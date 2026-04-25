import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { chains } from "@/lib/chains";
import { findRecipientUser, getFiatAccount, getTransferUserSecrets, usdToCents } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
  amountUsd: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const sender = await requireUser();
    const input = schema.parse(await request.json());
    const recipient = findRecipientUser(input.recipient);
    if (!recipient) {
      return NextResponse.json(
        { error: "No PocketRail user found for that username or wallet address." },
        { status: 404 },
      );
    }

    const amountCents = usdToCents(input.amountUsd);
    const account = getFiatAccount(sender.id);
    if (account.balanceCents < amountCents) {
      return NextResponse.json({ error: "Insufficient balance. Add money first." }, { status: 400 });
    }

    const transferSecrets = getTransferUserSecrets(sender.id, recipient.id);
    const sepolia = chains.find((chain) => chain.id === 11155111);
    const usdc = sepolia?.tokens.find((token) => token.symbol === "USDC");
    if (!sepolia || !usdc?.address) {
      return NextResponse.json({ error: "Sepolia USDC is not configured." }, { status: 400 });
    }

    return NextResponse.json({
      chainId: sepolia.id,
      token: {
        symbol: usdc.symbol,
        address: usdc.address,
        decimals: usdc.decimals,
      },
      ethProofWei: "1000000000000",
      senderWalletAddress: sender.linked_wallet_address || transferSecrets.senderWalletAddress,
      recipientWalletAddress: transferSecrets.recipientWalletAddress,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        username: recipient.username,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare transfer";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
