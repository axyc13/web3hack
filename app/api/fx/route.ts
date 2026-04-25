import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrencyForRegion, getFxRatesFromNzd, REGION_OPTIONS } from "@/lib/currency";

export const runtime = "nodejs";

const schema = z.object({
  regionCode: z.enum(["NZ", "AU", "US", "GB", "EU", "SG", "JP"]).default("NZ"),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const input = schema.parse({
      regionCode: searchParams.get("regionCode") || "NZ",
    });
    const preferredCurrency = getCurrencyForRegion(input.regionCode);
    const rates = await getFxRatesFromNzd(REGION_OPTIONS.map((option) => option.currency));

    return NextResponse.json({
      baseCurrency: "NZD",
      regionCode: input.regionCode,
      preferredCurrency,
      rate: rates[preferredCurrency] || 1,
      rates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load exchange rates";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
