import { NextResponse } from "next/server";
import { getUsdQuotes } from "@/lib/quotes";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ quotes: await getUsdQuotes() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load quotes";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
