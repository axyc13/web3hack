import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { topUpTestUsd, usdToCents } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  amountUsd: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    return NextResponse.json({ fiat: topUpTestUsd(user.id, usdToCents(input.amountUsd)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add test USD";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
