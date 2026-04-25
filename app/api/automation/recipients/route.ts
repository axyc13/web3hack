import { NextResponse } from "next/server";
import { z } from "zod";
import { addSavedRecipient, removeSavedRecipient } from "@/lib/automation";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const addRecipientSchema = z.object({
  recipient: z.string().min(1),
  nickname: z.string().max(40).optional(),
});

const removeRecipientSchema = z.object({
  savedRecipientId: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = addRecipientSchema.parse(await request.json());
    return NextResponse.json(addSavedRecipient(user.id, input.recipient, input.nickname));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save recipient";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const input = removeRecipientSchema.parse(await request.json());
    return NextResponse.json(removeSavedRecipient(user.id, input.savedRecipientId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove recipient";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
