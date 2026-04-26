import { Contract, ethers, formatUnits, isAddress } from "ethers";
import { chains } from "./chains";

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
];

export async function getBalances(address: string) {
  if (!isAddress(address)) throw new Error("Invalid wallet address");

  const results = await Promise.all(
    chains.map(async (chain) => {
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.id);
      const nativeWei = await provider.getBalance(address);
      const assets = [
        {
          symbol: chain.native.symbol,
          name: chain.native.name,
          chainId: chain.id,
          chainName: chain.name,
          decimals: chain.native.decimals,
          balance: formatUnits(nativeWei, chain.native.decimals),
          rawBalance: nativeWei.toString(),
          native: true,
        },
      ];

      for (const token of chain.tokens) {
        if (!token.address) continue;
        try {
          const contract = new Contract(token.address, erc20Abi, provider);
          const raw = (await contract.balanceOf(address)) as bigint;
          assets.push({
            symbol: token.symbol,
            name: token.name,
            chainId: chain.id,
            chainName: chain.name,
            decimals: token.decimals,
            balance: formatUnits(raw, token.decimals),
            rawBalance: raw.toString(),
            native: false,
          });
        } catch {
          assets.push({
            symbol: token.symbol,
            name: token.name,
            chainId: chain.id,
            chainName: chain.name,
            decimals: token.decimals,
            balance: "0",
            rawBalance: "0",
            native: false,
          });
        }
      }

      return { chain, assets };
    }),
  );

  return results;
}
