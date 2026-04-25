import { Contract, ethers, id, Interface, parseEther, parseUnits, zeroPadValue } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { chains } from "@/lib/chains";
import { findRecipientUser, getTransferUserSecrets, sendToAppUser, usdToCents } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
  amountUsd: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  proofAsset: z.enum(["USDC", "ETH"]).default("USDC"),
});

const transferTopic = id("Transfer(address,address,uint256)");
const erc20Abi = ["function decimals() view returns (uint8)"];
const transferInterface = new Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export async function POST(request: Request) {
  try {
    const sender = await requireUser();
    if (sender.wallet_kind !== "external" || !sender.linked_wallet_address) {
      return NextResponse.json({ error: "This route is only for linked-wallet transfers." }, { status: 400 });
    }

    const input = schema.parse(await request.json());
    const recipient = findRecipientUser(input.recipient);
    if (!recipient) {
      return NextResponse.json(
        { error: "No PocketRail user found for that username or wallet address." },
        { status: 404 },
      );
    }

    const amountCents = usdToCents(input.amountUsd);
    const transferSecrets = getTransferUserSecrets(sender.id, recipient.id);
    const sepolia = chains.find((chain) => chain.id === 11155111);
    const usdc = sepolia?.tokens.find((token) => token.symbol === "USDC");
    if (!sepolia || !usdc?.address) {
      return NextResponse.json({ error: "Sepolia USDC is not configured." }, { status: 400 });
    }

    const provider = new ethers.JsonRpcProvider(sepolia.rpcUrl, sepolia.id);
    const receipt = await provider.getTransactionReceipt(input.txHash);
    if (!receipt || receipt.status !== 1) {
      return NextResponse.json({ error: "Wait for the Sepolia transaction to confirm, then try again." }, { status: 400 });
    }

    if (input.proofAsset === "USDC") {
      if (receipt.to?.toLowerCase() !== usdc.address.toLowerCase()) {
        return NextResponse.json({ error: "That transaction was not sent to the Sepolia USDC contract." }, { status: 400 });
      }

      const contract = new Contract(usdc.address, erc20Abi, provider);
      const decimals = Number(await contract.decimals().catch(() => usdc.decimals));
      const expectedAmount = parseUnits(input.amountUsd, decimals);
      const expectedFrom = zeroPadValue(sender.linked_wallet_address, 32).toLowerCase();
      const expectedTo = zeroPadValue(transferSecrets.recipientWalletAddress, 32).toLowerCase();
      const matchingTransfer = receipt.logs.some((log) => {
        if (log.address.toLowerCase() !== usdc.address?.toLowerCase()) return false;
        if (log.topics[0] !== transferTopic || log.topics[1]?.toLowerCase() !== expectedFrom) return false;
        if (log.topics[2]?.toLowerCase() !== expectedTo) return false;
        const parsed = transferInterface.parseLog({ topics: log.topics, data: log.data });
        return parsed?.args.value === expectedAmount;
      });

      if (!matchingTransfer) {
        return NextResponse.json({ error: "That USDC transaction does not match this PocketRail transfer." }, { status: 400 });
      }
    } else {
      const tx = await provider.getTransaction(input.txHash);
      if (!tx) {
        return NextResponse.json({ error: "Could not load the Sepolia ETH transaction." }, { status: 400 });
      }
      const fromMatches = tx.from.toLowerCase() === sender.linked_wallet_address.toLowerCase();
      const toMatches = tx.to?.toLowerCase() === transferSecrets.recipientWalletAddress.toLowerCase();
      if (!fromMatches || !toMatches || tx.value < parseEther("0.000001")) {
        return NextResponse.json({ error: "That ETH proof transaction does not match this PocketRail transfer." }, { status: 400 });
      }
    }

    const fiat = sendToAppUser({
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      amountCents,
      txHash: input.txHash,
      stableSymbol: input.proofAsset,
      note: input.proofAsset === "ETH"
        ? `Sepolia ETH proof transfer ${input.txHash}`
        : `Sepolia USDC transfer ${input.txHash}`,
    });

    return NextResponse.json({
      fiat,
      txHash: input.txHash,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        username: recipient.username,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record transfer";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
