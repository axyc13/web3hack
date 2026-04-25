import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  flow: z.enum(["buy", "sell"]),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());

    if (!user.wallet_address) {
      return NextResponse.json(
        { error: "Create or link a wallet before opening Banxa." },
        { status: 400 },
      );
    }

    const partner = process.env.BANXA_PARTNER_NAME;
    if (!partner) {
      return NextResponse.json(
        { error: "Set BANXA_PARTNER_NAME in .env to enable Banxa sandbox checkout." },
        { status: 400 },
      );
    }

    const sandbox = process.env.BANXA_ENV !== "production";
    const host = sandbox
      ? `https://${partner}.banxa-sandbox.com`
      : `https://${partner}.banxa.com`;
    const returnUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const params = new URLSearchParams({
      coinType: "ETH",
      fiatType: "NZD",
      blockchain: "ETH",
      walletAddress: user.wallet_address,
      returnUrl,
      theme: "light",
      backgroundColor: "ffffff",
      primaryColor: "2563eb",
      secondaryColor: "1e40af",
      textColor: "172033",
    });

    if (input.flow === "buy") {
      params.set("fiatAmount", "50");
    } else {
      params.set("orderType", "sell");
    }

    return NextResponse.json({ url: `${host}/?${params.toString()}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create Banxa URL";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
