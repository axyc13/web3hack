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
    id: 11155111,
    name: "Sepolia",
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
    explorer: "https://sepolia.etherscan.io/tx/",
    blockscoutApi: "https://eth-sepolia.blockscout.com/api/v2",
    native: { symbol: "ETH", name: "Sepolia Ether", decimals: 18, native: true },
    tokens: [
      {
        symbol: "USDC",
        name: "USD Coin test token",
        decimals: 6,
        address: (process.env.SEPOLIA_USDC_ADDRESS ||
          "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238") as `0x${string}`,
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
