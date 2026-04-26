import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { findRecipientUser, nzdToCents, sendNzdToAppUser } from "@/lib/fiat";

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

    const txHash = `demo-${randomUUID()}`;
    sendNzdToAppUser({
      senderUserId: sender.id,
      recipientUserId: recipient.id,
      amountCents: nzdToCents(input.amountNzd),
      txHash,
      stableSymbol: "dNZD",
      chainId: 84532,
      note: `PocketRail demo transfer ${txHash}`,
    });

    return NextResponse.json({
      txHash,
      recipient: {
        id: recipient.id,
        name: recipient.name,
        username: recipient.username,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send money";
    const status = message.includes("No PocketRail user found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
