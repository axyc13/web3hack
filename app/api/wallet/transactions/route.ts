import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getWalletTransactions } from "@/lib/transactions";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const address = user.linked_wallet_address || user.wallet_address;
    if (!address) {
      return NextResponse.json({ transactions: [] });
    }

    const transactions = await getWalletTransactions(user.id, address);
    return NextResponse.json({ transactions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load transactions";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
