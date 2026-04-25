import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBalances } from "@/lib/wallet";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.wallet_address) {
      return NextResponse.json({ balances: [] });
    }
    const balances = await getBalances(user.wallet_address);
    return NextResponse.json({ balances });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load balances";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
