import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getFiatAccount } from "@/lib/fiat";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ fiat: getFiatAccount(user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load NZD account";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
