import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getWalletTransactions } from "@/lib/transactions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.wallet_address) {
      return NextResponse.json({ transactions: [] });
    }

    const transactions = await getWalletTransactions(user.id, user.wallet_address);
    return NextResponse.json({ transactions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load transactions";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
