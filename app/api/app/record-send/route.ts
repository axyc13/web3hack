import { Contract, ethers, id, Interface, parseUnits, zeroPadValue } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { chainById } from "@/lib/chains";
import { findRecipientUserByUsername, getTransferUserSecrets, nzdToCents, recordAppTransfer } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
  amountNzd: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  chainId: z.number().int().default(84532),
});

const transferTopic = id("Transfer(address,address,uint256)");
const erc20Abi = ["function decimals() view returns (uint8)"];
const transferInterface = new Interface(["event Transfer(address indexed from, address indexed to, uint256 value)"]);

export async function POST(request: Request) {
  try {
    const sender = await requireUser();
    if (!sender.wallet_address) {
      return NextResponse.json({ error: "Connect a wallet before recording transfers." }, { status: 400 });
    }

    const input = schema.parse(await request.json());
    const recipient = findRecipientUserByUsername(input.recipient);
    if (!recipient) {
      return NextResponse.json(
        { error: "No PocketRail user found for that username." },
        { status: 404 },
      );
    }

    const chain = chainById(input.chainId);
    if (!chain || chain.id !== 84532) {
      return NextResponse.json({ error: "PocketRail only records Base Sepolia dNZD transfers on this branch." }, { status: 400 });
    }

    const amountCents = nzdToCents(input.amountNzd);
    const transferSecrets = getTransferUserSecrets(sender.id, recipient.id);
    const token = chain.tokens.find((item) => item.symbol === "dNZD");
    if (!token?.address) {
      return NextResponse.json({ error: "Base Sepolia dNZD is not configured." }, { status: 400 });
    }
    const tokenAddress = token.address;

    const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.id);
    const receipt = await provider.getTransactionReceipt(input.txHash);
    if (!receipt || receipt.status !== 1) {
      return NextResponse.json({ error: "Wait for the Base Sepolia transaction to confirm, then try again." }, { status: 400 });
    }

    if (receipt.to?.toLowerCase() !== tokenAddress.toLowerCase()) {
      return NextResponse.json({ error: "That transaction was not sent to the Base Sepolia dNZD contract." }, { status: 400 });
    }

    const contract = new Contract(tokenAddress, erc20Abi, provider);
    const decimals = Number(await contract.decimals().catch(() => token.decimals));
    const expectedAmount = parseUnits(input.amountNzd, decimals);
    const expectedFrom = zeroPadValue(sender.wallet_address, 32).toLowerCase();
    const expectedTo = zeroPadValue(transferSecrets.recipientWalletAddress, 32).toLowerCase();
    const matchingTransfer = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) return false;
      if (log.topics[0] !== transferTopic || log.topics[1]?.toLowerCase() !== expectedFrom) return false;
      if (log.topics[2]?.toLowerCase() !== expectedTo) return false;
      const parsed = transferInterface.parseLog({ topics: log.topics, data: log.data });
      return parsed?.args.value === expectedAmount;
    });

    if (!matchingTransfer) {
      return NextResponse.json({ error: "That dNZD transaction does not match this PocketRail transfer." }, { status: 400 });
    }

    recordAppTransfer({
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      amountCents,
      txHash: input.txHash,
      stableSymbol: "dNZD",
      chainId: chain.id,
      note: `Base Sepolia dNZD transfer ${input.txHash}`,
    });

    return NextResponse.json({
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
