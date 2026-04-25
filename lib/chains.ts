export type TokenConfig = {
  symbol: string;
  name: string;
  decimals: number;
  address?: `0x${string}`;
  native?: boolean;
};

export type ChainConfig = {
  id: number;
  name: string;
  rpcUrl: string;
  explorer: string;
  blockscoutApi?: string;
  native: TokenConfig;
  tokens: TokenConfig[];
};

export const chains: ChainConfig[] = [
  {
    id: 84532,
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_RPC_URL || "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org/tx/",
    blockscoutApi: "https://base-sepolia.blockscout.com/api/v2",
    native: { symbol: "ETH", name: "Base Sepolia Ether", decimals: 18, native: true },
    tokens: [
      {
        symbol: "dNZD",
        name: "NewMoney dNZD",
        decimals: Number(process.env.BASE_DNZD_DECIMALS || 6),
        address: (process.env.BASE_DNZD_ADDRESS ||
          "0x63ee4b77d3912DC7bCe711c3BE7bF12D532F1853") as `0x${string}`,
      },
    ],
  },
  {
    id: 1,
    name: "Ethereum",
    rpcUrl: process.env.ETHEREUM_RPC_URL || "https://ethereum.publicnode.com",
    explorer: "https://etherscan.io/tx/",
    blockscoutApi: "https://eth.blockscout.com/api/v2",
    native: { symbol: "ETH", name: "Ether", decimals: 18, native: true },
    tokens: [
      {
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      },
      {
        symbol: "USDT",
        name: "Tether USD",
        decimals: 6,
        address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      },
    ],
  },
];

export function chainById(chainId: number) {
  return chains.find((chain) => chain.id === chainId);
}
