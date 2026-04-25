import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { nzdToCents, topUpTestNzd, topUpTestUsd, usdToCents } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  amountUsd: z.string().min(1),
  currency: z.enum(["USD", "NZD"]).default("USD"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const fiat = input.currency === "NZD"
      ? topUpTestNzd(user.id, nzdToCents(input.amountUsd))
      : topUpTestUsd(user.id, usdToCents(input.amountUsd));
    return NextResponse.json({ fiat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add test balance";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
