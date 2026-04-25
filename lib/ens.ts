import { ethers, isAddress } from "ethers";
import { db, DbUser } from "./db";
import { chains } from "./chains";

export async function resolveEnsName(address: string | null) {
  if (!address || !isAddress(address)) return null;

  const ethereum = chains.find((chain) => chain.id === 1);
  if (!ethereum) return null;

  try {
    const provider = new ethers.JsonRpcProvider(ethereum.rpcUrl, 1);
    return await provider.lookupAddress(address);
  } catch {
    return null;
  }
}

export async function refreshEnsForUser(user: DbUser) {
  if (!user.wallet_address) return user;

  const ensName = await resolveEnsName(user.wallet_address);
  db().prepare("UPDATE users SET ens_name = ? WHERE id = ?").run(ensName, user.id);

  return {
    ...user,
    ens_name: ensName,
  };
}
