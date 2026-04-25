import { formatEther } from "ethers";
import { chains } from "./chains";
import { db } from "./db";

type BlockscoutAddress = {
  hash?: string;
  ens_domain_name?: string | null;
};

type BlockscoutTransaction = {
  hash: string;
  timestamp: string;
  status: string;
  value?: string;
  fee?: { value?: string };
  from?: BlockscoutAddress;
  to?: BlockscoutAddress | null;
  method?: string | null;
  transaction_types?: string[];
};

export type WalletTransaction = {
  hash: string;
  chainId: number;
  chainName: string;
  explorerUrl: string;
  direction: "incoming" | "outgoing" | "self" | "unknown";
  from: string;
  to: string;
  amount: string;
  symbol: string;
  fee: string | null;
  status: string;
  method: string | null;
  timestamp: string;
  source: "explorer" | "local" | "app";
};

export async function getWalletTransactions(userId: number, address: string) {
  const explorerTransactions: WalletTransaction[] = [];
  const localTransactions = [...getAppTransfers(userId), ...getLocalTransactions(userId)];

  const byKey = new Map<string, WalletTransaction>();
  for (const tx of [...explorerTransactions.flat(), ...localTransactions]) {
    byKey.set(`${tx.chainId}:${tx.hash}`, tx);
  }

  return [...byKey.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function getAppTransfers(userId: number): WalletTransaction[] {
  const rows = db()
    .prepare(
      `SELECT app_transfers.id, sender_user_id, recipient_user_id, amount_cents, stable_symbol, tx_hash, chain_id, status, app_transfers.created_at,
              sender.username AS sender_username, recipient.username AS recipient_username,
              sender.wallet_address AS sender_wallet_address, recipient.wallet_address AS recipient_wallet_address
       FROM app_transfers
       JOIN users sender ON sender.id = app_transfers.sender_user_id
       JOIN users recipient ON recipient.id = app_transfers.recipient_user_id
       WHERE sender_user_id = ? OR recipient_user_id = ?
       ORDER BY app_transfers.created_at DESC
       LIMIT 50`,
    )
    .all(userId, userId) as Array<{
      id: number;
      sender_user_id: number;
      recipient_user_id: number;
      amount_cents: number;
      stable_symbol: string;
      tx_hash: string | null;
      chain_id: number;
      status: string;
      created_at: string;
      sender_username: string;
      recipient_username: string;
      sender_wallet_address: string | null;
      recipient_wallet_address: string | null;
    }>;

  return rows.map((row) => {
    const outgoing = row.sender_user_id === userId;
    return {
      hash: row.tx_hash || `internal-${row.id}`,
      chainId: row.chain_id || 11155111,
      chainName: "Sepolia",
      explorerUrl: row.tx_hash ? `https://sepolia.etherscan.io/tx/${row.tx_hash}` : "",
      direction: outgoing ? "outgoing" : "incoming",
      from: `@${row.sender_username}`,
      to: `@${row.recipient_username}`,
      amount: (row.amount_cents / 100).toFixed(2),
      symbol: row.stable_symbol || "USDC",
      fee: null,
      status: row.status,
      method: row.stable_symbol === "ETH" ? "Sepolia ETH proof transfer" : "Sepolia USDC transfer",
      timestamp: new Date(`${row.created_at}Z`).toISOString(),
      source: "app",
    };
  });
}

async function getExplorerTransactions(
  chain: (typeof chains)[number],
  address: string,
): Promise<WalletTransaction[]> {
  if (!chain.blockscoutApi) return [];

  try {
    const url = `${chain.blockscoutApi}/addresses/${address}/transactions`;
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 20 },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: BlockscoutTransaction[] };

    return (data.items || []).map((tx) => {
      const from = tx.from?.hash || "";
      const to = tx.to?.hash || "";
      const fromMatches = from.toLowerCase() === address.toLowerCase();
      const toMatches = to.toLowerCase() === address.toLowerCase();
      const direction = fromMatches && toMatches
        ? "self"
        : fromMatches
          ? "outgoing"
          : toMatches
            ? "incoming"
            : "unknown";

      return {
        hash: tx.hash,
        chainId: chain.id,
        chainName: chain.name,
        explorerUrl: `${chain.explorer}${tx.hash}`,
        direction,
        from,
        to,
        amount: formatEther(BigInt(tx.value || "0")),
        symbol: chain.native.symbol,
        fee: tx.fee?.value ? formatEther(BigInt(tx.fee.value)) : null,
        status: tx.status || "unknown",
        method: tx.method || tx.transaction_types?.[0] || null,
        timestamp: tx.timestamp,
        source: "explorer",
      };
    });
  } catch {
    return [];
  }
}

function getLocalTransactions(userId: number): WalletTransaction[] {
  const rows = db()
    .prepare(
      `SELECT chain_id, asset_symbol, recipient, amount, tx_hash, status, created_at
       FROM transfers
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(userId) as Array<{
      chain_id: number;
      asset_symbol: string;
      recipient: string;
      amount: string;
      tx_hash: string | null;
      status: string;
      created_at: string;
    }>;

  return rows
    .filter((row) => row.tx_hash)
    .map((row) => {
      const chain = chains.find((item) => item.id === row.chain_id);
      return {
        hash: row.tx_hash as string,
        chainId: row.chain_id,
        chainName: chain?.name || `Chain ${row.chain_id}`,
        explorerUrl: chain ? `${chain.explorer}${row.tx_hash}` : "",
        direction: "outgoing",
        from: "This wallet",
        to: row.recipient,
        amount: row.amount,
        symbol: row.asset_symbol,
        fee: null,
        status: row.status,
        method: "PocketRail send",
        timestamp: new Date(`${row.created_at}Z`).toISOString(),
        source: "local",
      };
    });
}
