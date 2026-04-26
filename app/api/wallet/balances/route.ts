import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getBalances } from "@/lib/wallet";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const address = user.wallet_address;
    if (!address) {
      return NextResponse.json({ balances: [] });
    }
    const balances = await getBalances(address);
    return NextResponse.json({ balances });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load balances";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
