import { Contract, ethers, formatUnits, isAddress, parseUnits, Wallet } from "ethers";
import { chainById, chains } from "./chains";
import { decryptText, encryptText } from "./crypto";

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export function createEmbeddedWallet() {
  const wallet = Wallet.createRandom();
  return {
    address: wallet.address,
    encryptedPrivateKey: encryptText(wallet.privateKey),
  };
}

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

export async function sendFromEmbeddedWallet(input: {
  encryptedPrivateKey: string;
  chainId: number;
  recipient: string;
  amount: string;
  symbol: string;
}) {
  if (!isAddress(input.recipient)) throw new Error("Recipient address is invalid");
  const chain = chainById(input.chainId);
  if (!chain) throw new Error("Unsupported network");

  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.id);
  const wallet = new Wallet(decryptText(input.encryptedPrivateKey), provider);
  const nativeSymbol = chain.native.symbol.toLowerCase();
  const requestedSymbol = input.symbol.toLowerCase();

  if (requestedSymbol === nativeSymbol) {
    const tx = await wallet.sendTransaction({
      to: input.recipient,
      value: parseUnits(input.amount, chain.native.decimals),
    });
    await tx.wait();
    return tx.hash;
  }

  const token = chain.tokens.find(
    (asset) => asset.symbol.toLowerCase() === requestedSymbol,
  );
  if (!token?.address) throw new Error("Unsupported token on this network");

  const contract = new Contract(token.address, erc20Abi, wallet);
  const tx = await contract.transfer(input.recipient, parseUnits(input.amount, token.decimals));
  await tx.wait();
  return tx.hash as string;
}
