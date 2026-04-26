import { chainById } from "./chains";
import { DbUser } from "./db";
import { findRecipientUserByUsername, getTransferUserSecrets, nzdToCents } from "./fiat";

export type AppPreparedTransfer = {
  chainId: number;
  token: {
    symbol: string;
    address: string;
    decimals: number;
  };
  senderWalletAddress: string;
  recipientWalletAddress: string;
  recipient: {
    id: number;
    name: string;
    username: string;
  };
};

export function prepareAppTransfer(sender: DbUser, recipientInput: string, amountNzd: string): AppPreparedTransfer {
  const recipient = findRecipientUserByUsername(recipientInput);
  if (!recipient) {
    throw new Error("No PocketRail user found for that username.");
  }

  nzdToCents(amountNzd);

  const transferSecrets = getTransferUserSecrets(sender.id, recipient.id);
  const chain = chainById(84532);
  const token = chain?.tokens.find((item) => item.symbol === "dNZD");
  if (!chain || !token?.address) {
    throw new Error("Base Sepolia dNZD is not configured.");
  }

  return {
    chainId: chain.id,
    token: {
      symbol: token.symbol,
      address: token.address,
      decimals: token.decimals,
    },
    senderWalletAddress: sender.wallet_address || transferSecrets.senderWalletAddress,
    recipientWalletAddress: transferSecrets.recipientWalletAddress,
    recipient: {
      id: recipient.id,
      name: recipient.name,
      username: recipient.username,
    },
  };
}
