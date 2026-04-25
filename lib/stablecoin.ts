import { Contract, ethers, formatUnits, parseUnits, Wallet } from "ethers";
import { chainById } from "./chains";
import { decryptText } from "./crypto";

const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export async function sendBaseDnzd(input: {
  encryptedPrivateKey: string;
  recipientAddress: string;
  amount: string;
}) {
  const chain = chainById(84532);
  const token = chain?.tokens.find((item) => item.symbol === "dNZD");
  if (!chain || !token?.address) {
    throw new Error("Base Sepolia dNZD is not configured. Set BASE_DNZD_ADDRESS in .env.");
  }

  const provider = new ethers.JsonRpcProvider(chain.rpcUrl, chain.id);
  const wallet = new Wallet(decryptText(input.encryptedPrivateKey), provider);
  const gasBalance = await provider.getBalance(wallet.address);
  if (gasBalance === 0n) {
    throw new Error(`Fund ${wallet.address} with Base Sepolia ETH for gas before sending dNZD.`);
  }

  const contract = new Contract(token.address, erc20Abi, wallet);
  const amountRaw = parseUnits(input.amount, token.decimals);
  const tokenBalance = (await contract.balanceOf(wallet.address)) as bigint;
  if (tokenBalance < amountRaw) {
    throw new Error(
      `Fund ${wallet.address} with dNZD before sending. Current dNZD balance is ${formatUnits(tokenBalance, token.decimals)}.`,
    );
  }

  const tx = await contract.transfer(input.recipientAddress, amountRaw);
  return tx.hash as string;
}
