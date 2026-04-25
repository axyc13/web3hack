export const REGION_OPTIONS = [
  { code: "NZ", label: "New Zealand", currency: "NZD", locale: "en-NZ" },
  { code: "AU", label: "Australia", currency: "AUD", locale: "en-AU" },
  { code: "US", label: "United States", currency: "USD", locale: "en-US" },
  { code: "GB", label: "United Kingdom", currency: "GBP", locale: "en-GB" },
  { code: "EU", label: "Euro Area", currency: "EUR", locale: "en-IE" },
  { code: "SG", label: "Singapore", currency: "SGD", locale: "en-SG" },
  { code: "JP", label: "Japan", currency: "JPY", locale: "ja-JP" },
] as const;

export type SupportedRegionCode = (typeof REGION_OPTIONS)[number]["code"];
export type SupportedCurrencyCode = (typeof REGION_OPTIONS)[number]["currency"];

export type RegionOption = (typeof REGION_OPTIONS)[number];

const regionByCode = new Map<string, RegionOption>(
  REGION_OPTIONS.map((option) => [option.code, option]),
);

export function getRegionConfig(code?: string | null): RegionOption {
  return regionByCode.get(code || "") || REGION_OPTIONS[0];
}

export function getCurrencyForRegion(code?: string | null): SupportedCurrencyCode {
  return getRegionConfig(code).currency;
}

export function getLocaleForRegion(code?: string | null): string {
  return getRegionConfig(code).locale;
}

export function formatDisplayCurrency(value: number, regionCode?: string | null, currencyCode?: string | null) {
  const region = getRegionConfig(regionCode);
  const currency = (currencyCode || region.currency) as SupportedCurrencyCode;

  return value.toLocaleString(region.locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export async function getFxRatesFromNzd(currencies: readonly string[]) {
  const targets = [...new Set(currencies.filter((currency) => currency !== "NZD"))];
  if (targets.length === 0) {
    return { NZD: 1 } as Record<string, number>;
  }

  const response = await fetch(
    `https://api.frankfurter.dev/v1/latest?base=NZD&symbols=${targets.join(",")}`,
    {
      headers: { accept: "application/json" },
      next: { revalidate: 300 },
    },
  );
  if (!response.ok) {
    throw new Error("Could not fetch exchange rates.");
  }

  const data = (await response.json()) as { rates?: Record<string, number> };
  return {
    NZD: 1,
    ...(data.rates || {}),
  };
}

export async function convertFromNzd(amount: number, currencyCode: SupportedCurrencyCode) {
  if (currencyCode === "NZD") return amount;
  const rates = await getFxRatesFromNzd([currencyCode]);
  const rate = rates[currencyCode];
  if (!rate) {
    throw new Error(`Exchange rate for ${currencyCode} is unavailable.`);
  }
  return amount * rate;
}
