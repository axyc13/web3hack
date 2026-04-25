import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await request.text();
    await requireUser();
    return NextResponse.json(
      { error: "PocketRail no longer stores an internal wallet. Use your linked wallet in MetaMask." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export private key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
