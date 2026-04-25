import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { nzdToCents, withdrawTestNzd } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  amountNzd: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    return NextResponse.json({ fiat: withdrawTestNzd(user.id, nzdToCents(input.amountNzd)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not withdraw test NZD";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
