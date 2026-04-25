import { Contract, ethers, formatUnits, parseUnits, Wallet } from "ethers";
import { chains } from "./chains";
import { decryptText } from "./crypto";

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export async function sendSepoliaUsdc(input: {
  encryptedPrivateKey: string;
  recipientAddress: string;
  amount: string;
}) {
  const chain = chains.find((item) => item.id === 11155111);
  const token = chain?.tokens.find((item) => item.symbol === "USDC");
  if (!chain || !token?.address) {
    throw new Error("Sepolia USDC is not configured. Set SEPOLIA_USDC_ADDRESS in .env or use the default Circle test token.");
  }

  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.id);
  const wallet = new Wallet(decryptText(input.encryptedPrivateKey), provider);
  const gasBalance = await provider.getBalance(wallet.address);
  if (gasBalance === 0n) {
    throw new Error(`Fund ${wallet.address} with Sepolia ETH for gas before sending test USDC.`);
  }

  const contract = new Contract(token.address, erc20Abi, wallet);
  const amountRaw = parseUnits(input.amount, token.decimals);
  const tokenBalance = (await contract.balanceOf(wallet.address)) as bigint;
  if (tokenBalance < amountRaw) {
    throw new Error(
      `Fund ${wallet.address} with Sepolia USDC before sending. Current test USDC balance is ${formatUnits(tokenBalance, token.decimals)}.`,
    );
  }

  const tx = await contract.transfer(input.recipientAddress, amountRaw);
  return tx.hash as string;
}
