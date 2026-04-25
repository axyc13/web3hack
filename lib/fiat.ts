import { db } from "./db";
import { decryptText } from "./crypto";
import { createEmbeddedWallet } from "./wallet";

export type FiatEvent = {
  id: number;
  kind: "top_up" | "withdrawal";
  amountCents: number;
  amountUsd: string;
  status: string;
  provider: string;
  note: string | null;
  createdAt: string;
};

export function getFiatAccount(userId: number) {
  ensureFiatAccount(userId);
  const account = db()
    .prepare("SELECT nzd_cents FROM fiat_accounts WHERE user_id = ?")
    .get(userId) as { nzd_cents: number };
  const events = db()
    .prepare(
      `SELECT id, kind, amount_cents, status, provider, note, created_at
       FROM fiat_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    .all(userId) as Array<{
      id: number;
      kind: "top_up" | "withdrawal";
      amount_cents: number;
      status: string;
      provider: string;
      note: string | null;
      created_at: string;
    }>;

  return {
    balanceCents: account.nzd_cents,
    balanceUsd: centsToUsd(account.nzd_cents),
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      amountCents: event.amount_cents,
      amountUsd: centsToUsd(event.amount_cents),
      status: event.status,
      provider: event.provider,
      note: event.note,
      createdAt: event.created_at,
    })) satisfies FiatEvent[],
  };
}

export function topUpTestUsd(userId: number, amountCents: number) {
  ensureFiatAccount(userId);
  db()
    .prepare(
      `UPDATE fiat_accounts
       SET nzd_cents = nzd_cents + ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .run(amountCents, userId);
  db()
    .prepare(
      `INSERT INTO fiat_events (user_id, kind, amount_cents, status, provider, note)
       VALUES (?, 'top_up', ?, 'completed', 'test-ledger', 'Hackathon test balance top-up')`,
    )
    .run(userId, amountCents);
  return getFiatAccount(userId);
}

export function withdrawTestUsd(userId: number, amountCents: number) {
  ensureFiatAccount(userId);
  const account = getFiatAccount(userId);
  if (account.balanceCents < amountCents) {
    throw new Error("Insufficient USD test balance.");
  }

  db()
    .prepare(
      `UPDATE fiat_accounts
       SET nzd_cents = nzd_cents - ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
    )
    .run(amountCents, userId);
  db()
    .prepare(
      `INSERT INTO fiat_events (user_id, kind, amount_cents, status, provider, note)
       VALUES (?, 'withdrawal', ?, 'completed', 'test-ledger', 'Hackathon test balance withdrawal')`,
    )
    .run(userId, amountCents);
  return getFiatAccount(userId);
}

export function sendToAppUser(input: {
  senderUserId: number;
  recipientUserId: number;
  amountCents: number;
  txHash: string;
  stableSymbol?: string;
  note?: string;
}) {
  if (input.senderUserId === input.recipientUserId) {
    throw new Error("You cannot send money to yourself.");
  }
  ensureFiatAccount(input.senderUserId);
  ensureFiatAccount(input.recipientUserId);
  const sender = getFiatAccount(input.senderUserId);
  if (sender.balanceCents < input.amountCents) {
    throw new Error("Insufficient balance.");
  }

  const database = db();
  if (
    database
      .prepare("SELECT id FROM app_transfers WHERE tx_hash = ?")
      .get(input.txHash)
  ) {
    throw new Error("This blockchain transaction has already been recorded.");
  }
  database
    .prepare("UPDATE fiat_accounts SET nzd_cents = nzd_cents - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?")
    .run(input.amountCents, input.senderUserId);
  database
    .prepare("UPDATE fiat_accounts SET nzd_cents = nzd_cents + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?")
    .run(input.amountCents, input.recipientUserId);
  database
    .prepare(
      `INSERT INTO app_transfers (sender_user_id, recipient_user_id, amount_cents, stable_symbol, tx_hash, chain_id, status, note)
       VALUES (?, ?, ?, ?, ?, 11155111, 'completed', ?)`,
    )
    .run(
      input.senderUserId,
      input.recipientUserId,
      input.amountCents,
      input.stableSymbol || "USDC",
      input.txHash,
      input.note || `Sepolia USDC transfer ${input.txHash}`,
    );

  database
    .prepare(
      `INSERT INTO fiat_events (user_id, kind, amount_cents, status, provider, note)
       VALUES (?, 'withdrawal', ?, 'completed', 'stable-ledger', ?)`,
    )
    .run(input.senderUserId, input.amountCents, `Sent to user #${input.recipientUserId}`);
  database
    .prepare(
      `INSERT INTO fiat_events (user_id, kind, amount_cents, status, provider, note)
       VALUES (?, 'top_up', ?, 'completed', 'stable-ledger', ?)`,
    )
    .run(input.recipientUserId, input.amountCents, `Received from user #${input.senderUserId}`);

  return getFiatAccount(input.senderUserId);
}

export function findRecipientUser(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;
  const normalizedUsername = value.startsWith("@") ? value.slice(1) : value;
  const row = db()
    .prepare(
      `SELECT id, name, username, email, wallet_address
       FROM users
       WHERE lower(username) = lower(?)
          OR lower(wallet_address) = lower(?)
          OR lower(linked_wallet_address) = lower(?)
       LIMIT 1`,
    )
    .get(normalizedUsername, value, value) as
    | { id: number; name: string; username: string; email: string; wallet_address: string | null }
    | undefined;
  return row || null;
}

export function getTransferUserSecrets(senderUserId: number, recipientUserId: number) {
  ensureInternalTransferWallet(senderUserId);
  ensureInternalTransferWallet(recipientUserId);
  const sender = db()
    .prepare("SELECT id, wallet_address, encrypted_private_key FROM users WHERE id = ?")
    .get(senderUserId) as
    | { id: number; wallet_address: string | null; encrypted_private_key: string | null }
    | undefined;
  const recipient = db()
    .prepare("SELECT id, wallet_address FROM users WHERE id = ?")
    .get(recipientUserId) as
    | { id: number; wallet_address: string | null }
    | undefined;

  if (!sender?.wallet_address || !sender.encrypted_private_key) {
    throw new Error("Your hidden wallet is not available for test stablecoin transfer.");
  }
  if (!recipient?.wallet_address) {
    throw new Error("Recipient hidden wallet is not available.");
  }

  return {
    encryptedPrivateKey: sender.encrypted_private_key,
    senderWalletAddress: sender.wallet_address,
    recipientWalletAddress: recipient.wallet_address,
  };
}

function ensureInternalTransferWallet(userId: number) {
  const user = db()
    .prepare("SELECT id, wallet_address, linked_wallet_address, encrypted_private_key FROM users WHERE id = ?")
    .get(userId) as
    | {
        id: number;
        wallet_address: string | null;
        linked_wallet_address: string | null;
        encrypted_private_key: string | null;
      }
    | undefined;
  if (!user) return;
  if (user.encrypted_private_key) {
    try {
      decryptText(user.encrypted_private_key);
      return;
    } catch {
      // Local hackathon recovery: regenerate transfer wallets encrypted with an old/dev key format.
    }
  }

  const wallet = createEmbeddedWallet();
  db()
    .prepare(
      `UPDATE users
       SET wallet_address = ?,
           linked_wallet_address = COALESCE(linked_wallet_address, wallet_address),
           encrypted_private_key = ?
       WHERE id = ?`,
    )
    .run(wallet.address, wallet.encryptedPrivateKey, userId);
}

export function usdToCents(amount: string) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Enter a USD amount greater than 0.");
  }
  return Math.round(parsed * 100);
}

function ensureFiatAccount(userId: number) {
  db()
    .prepare("INSERT OR IGNORE INTO fiat_accounts (user_id, nzd_cents) VALUES (?, 0)")
    .run(userId);
}

function centsToUsd(cents: number) {
  return (cents / 100).toFixed(2);
}
