import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { findRecipientUserByUsername } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireUser();
    const input = schema.parse(await request.json());
    const recipient = findRecipientUserByUsername(input.recipient);
    if (!recipient) {
      return NextResponse.json({ recipient: null }, { status: 404 });
    }

    return NextResponse.json({
      recipient: {
        id: recipient.id,
        name: recipient.name,
        username: recipient.username,
        walletAddress: recipient.wallet_address,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve recipient";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
