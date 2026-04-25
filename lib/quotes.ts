const cryptoIds = [
  "bitcoin",
  "ethereum",
  "solana",
  "usd-coin",
  "tether",
  "dai",
  "binance-usd",
  "paypal-usd",
  "first-digital-usd",
  "true-usd",
];

export type CryptoQuote = {
  id: string;
  symbol: string;
  name: string;
  nzd: number;
};

const metadata: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: "BTC", name: "Bitcoin" },
  ethereum: { symbol: "ETH", name: "Ethereum" },
  solana: { symbol: "SOL", name: "Solana" },
  "usd-coin": { symbol: "USDC", name: "USD Coin" },
  tether: { symbol: "USDT", name: "Tether" },
  dai: { symbol: "DAI", name: "Dai" },
  "binance-usd": { symbol: "BUSD", name: "Binance USD" },
  "paypal-usd": { symbol: "PYUSD", name: "PayPal USD" },
  "first-digital-usd": { symbol: "FDUSD", name: "First Digital USD" },
  "true-usd": { symbol: "TUSD", name: "TrueUSD" },
};

export async function getNzdQuotes(): Promise<CryptoQuote[]> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(",")}&vs_currencies=nzd`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: 30 },
  });
  if (!response.ok) {
    throw new Error("Could not fetch crypto/NZD quotes.");
  }

  const data = (await response.json()) as Record<string, { nzd?: number }>;
  return cryptoIds
    .filter((id) => typeof data[id]?.nzd === "number")
    .map((id) => ({
      id,
      ...metadata[id],
      nzd: data[id].nzd as number,
    }));
}
