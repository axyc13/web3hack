import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { findRecipientUser, getTransferUserSecrets, sendToAppUser, usdToCents } from "@/lib/fiat";
import { sendSepoliaUsdc } from "@/lib/stablecoin";

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
    const transferSecrets = getTransferUserSecrets(sender.id, recipient.id);
    const txHash = await sendSepoliaUsdc({
      encryptedPrivateKey: transferSecrets.encryptedPrivateKey,
      recipientAddress: transferSecrets.recipientWalletAddress,
      amount: input.amountUsd,
    });

    const fiat = sendToAppUser({
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      amountCents,
      txHash,
    });

    return NextResponse.json({
      fiat,
      txHash,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        username: recipient.username,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send money";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
