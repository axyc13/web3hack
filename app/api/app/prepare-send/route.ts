import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prepareAppTransfer } from "@/lib/app-transfers";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
  amountNzd: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const sender = await requireUser();
    const input = schema.parse(await request.json());
    return NextResponse.json(prepareAppTransfer(sender, input.recipient, input.amountNzd));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare transfer";
    const status = message.includes("No PocketRail user found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
