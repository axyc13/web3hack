import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { creditNzdBalance, nzdToCents } from "@/lib/fiat";

export const runtime = "nodejs";

const schema = z.object({
  accountName: z.string().min(2),
  accountNumber: z.string().min(4),
  bankName: z.string().min(2),
  reference: z.string().min(2).max(80),
  amountNzd: z.string().min(1),
});

type NewMoneyResponse = {
  ok?: boolean;
  user_name?: string;
  wallet_address?: string;
  amount?: number;
  remaining_balance?: number;
  message?: string;
  error?: string;
  details?: string[];
};

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const apiKey = process.env.NEWMONEY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Set NEWMONEY_API_KEY in your local environment before using New Money top-ups." },
        { status: 500 },
      );
    }

    const amount = Number(input.amountNzd);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Enter a top-up amount greater than 0." }, { status: 400 });
    }

    const response = await fetch(
      process.env.NEWMONEY_BASE_URL || "https://dev-dnzd.newmoney-api.workers.dev",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          amount,
          chain: process.env.NEWMONEY_CHAIN || "sepolia",
        }),
      },
    );
    const data = await response.json() as NewMoneyResponse;

    if (!response.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error || data.details?.join(", ") || "New Money mint failed." },
        { status: response.status || 400 },
      );
    }

    const fiat = creditNzdBalance(
      user.id,
      nzdToCents(input.amountNzd),
      `New Money demo mint for ${input.reference}`,
      "newmoney-demo",
    );

    return NextResponse.json({
      fiat,
      newMoney: {
        userName: data.user_name || "New Money account",
        walletAddress: data.wallet_address || "",
        amount: data.amount ?? amount,
        remainingBalance: data.remaining_balance ?? null,
        message: data.message || "Mint operation initiated successfully",
        chain: process.env.NEWMONEY_CHAIN || "sepolia",
        bankReference: input.reference,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not top up with New Money";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
