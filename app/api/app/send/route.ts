import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { findRecipientUser } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
  amountNzd: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const sender = await requireUser();
    if (!sender.linked_wallet_address) {
      return NextResponse.json({ error: "Connect a linked wallet before sending dNZD." }, { status: 400 });
    }
    const input = schema.parse(await request.json());
    const recipient = findRecipientUser(input.recipient);
    if (!recipient) {
      return NextResponse.json(
        { error: "No PocketRail user found for that username or wallet address." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "PocketRail no longer sends from an internal wallet. Sign the dNZD transfer in your linked wallet." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send money";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
