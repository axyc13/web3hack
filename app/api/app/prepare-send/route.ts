import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { chainById } from "@/lib/chains";
import { findRecipientUser, getTransferUserSecrets, nzdToCents } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
  amountNzd: z.string().min(1),
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

    nzdToCents(input.amountNzd);

    const transferSecrets = getTransferUserSecrets(sender.id, recipient.id);
    const chain = chainById(84532);
    const token = chain?.tokens.find((item) => item.symbol === "dNZD");
    if (!chain || !token?.address) {
      return NextResponse.json({ error: "Base Sepolia dNZD is not configured." }, { status: 400 });
    }

    return NextResponse.json({
      chainId: chain.id,
      token: {
        symbol: token.symbol,
        address: token.address,
        decimals: token.decimals,
      },
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
