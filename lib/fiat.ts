import { db } from "./db";

export type FiatCurrency = "USD" | "NZD";

export type FiatEvent = {
  id: number;
  kind: "top_up" | "withdrawal";
  currency: FiatCurrency;
  amountCents: number;
  amountUsd: string;
  amountNzd: string;
  status: string;
  provider: string;
  note: string | null;
  createdAt: string;
};

export function getFiatAccount(userId: number) {
  ensureFiatAccount(userId);
  const account = db()
    .prepare(
      `SELECT fiat_accounts.nzd_cents AS usd_cents, users.nzd_balance_cents
       FROM fiat_accounts
       JOIN users ON users.id = fiat_accounts.user_id
       WHERE fiat_accounts.user_id = ?`,
    )
    .get(userId) as { usd_cents: number; nzd_balance_cents: number };
  const events = db()
    .prepare(
      `SELECT id, kind, amount_cents, currency, status, provider, note, created_at
       FROM fiat_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
    )
    .all(userId) as Array<{
      id: number;
      kind: "top_up" | "withdrawal";
      currency: FiatCurrency;
      amount_cents: number;
      status: string;
      provider: string;
      note: string | null;
      created_at: string;
    }>;

  return {
    balanceCents: account.usd_cents,
    balanceUsd: centsToUsd(account.usd_cents),
    usdBalanceCents: account.usd_cents,
    usdBalance: centsToUsd(account.usd_cents),
    nzdBalanceCents: account.nzd_balance_cents,
    nzdBalance: centsToNzd(account.nzd_balance_cents),
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      currency: event.currency,
      amountCents: event.amount_cents,
      amountUsd: centsToUsd(event.amount_cents),
      amountNzd: centsToNzd(event.amount_cents),
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
  recordFiatEvent(userId, "top_up", amountCents, "USD", "Hackathon test USD balance top-up");
  return getFiatAccount(userId);
}

export function topUpTestNzd(userId: number, amountCents: number) {
  return creditNzdBalance(userId, amountCents, "Hackathon test NZD balance top-up");
}

export function creditNzdBalance(
  userId: number,
  amountCents: number,
  note: string,
  provider = "test-ledger",
) {
  db()
    .prepare(
      `UPDATE users
       SET nzd_balance_cents = nzd_balance_cents + ?
       WHERE id = ?`,
    )
    .run(amountCents, userId);
  recordFiatEvent(userId, "top_up", amountCents, "NZD", note, provider);
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
  recordFiatEvent(userId, "withdrawal", amountCents, "USD", "Hackathon test USD balance withdrawal");
  return getFiatAccount(userId);
}

export function withdrawTestNzd(userId: number, amountCents: number) {
  const account = getFiatAccount(userId);
  if (account.nzdBalanceCents < amountCents) {
    throw new Error("Insufficient NZD test balance.");
  }

  db()
    .prepare(
      `UPDATE users
       SET nzd_balance_cents = nzd_balance_cents - ?
       WHERE id = ?`,
    )
    .run(amountCents, userId);
  recordFiatEvent(userId, "withdrawal", amountCents, "NZD", "Hackathon test NZD balance withdrawal");
  return getFiatAccount(userId);
}

export function sendToAppUser(input: {
  senderUserId: number;
  recipientUserId: number;
  amountCents: number;
  txHash: string;
  stableSymbol?: string;
  note?: string;
  chainId?: number;
}) {
  return sendUsdToAppUser(input);
}

export function sendUsdToAppUser(input: {
  senderUserId: number;
  recipientUserId: number;
  amountCents: number;
  txHash: string;
  stableSymbol?: string;
  note?: string;
  chainId?: number;
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
  if (database.prepare("SELECT id FROM app_transfers WHERE tx_hash = ?").get(input.txHash)) {
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
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
    )
    .run(
      input.senderUserId,
      input.recipientUserId,
      input.amountCents,
      input.stableSymbol || "USDC",
      input.txHash,
      input.chainId || 11155111,
      input.note || `Sepolia USDC transfer ${input.txHash}`,
    );

  recordFiatEvent(input.senderUserId, "withdrawal", input.amountCents, "USD", `Sent to user #${input.recipientUserId}`, "stable-ledger");
  recordFiatEvent(input.recipientUserId, "top_up", input.amountCents, "USD", `Received from user #${input.senderUserId}`, "stable-ledger");

  return getFiatAccount(input.senderUserId);
}

export function sendNzdToAppUser(input: {
  senderUserId: number;
  recipientUserId: number;
  amountCents: number;
  txHash: string;
  stableSymbol?: string;
  note?: string;
  chainId?: number;
}) {
  if (input.senderUserId === input.recipientUserId) {
    throw new Error("You cannot send money to yourself.");
  }

  const database = db();
  const sender = database
    .prepare("SELECT nzd_balance_cents FROM users WHERE id = ?")
    .get(input.senderUserId) as { nzd_balance_cents: number } | undefined;
  if (!sender) {
    throw new Error("Sender account not found.");
  }
  if (sender.nzd_balance_cents < input.amountCents) {
    throw new Error("Insufficient NZD balance.");
  }
  if (database.prepare("SELECT id FROM app_transfers WHERE tx_hash = ?").get(input.txHash)) {
    throw new Error("This blockchain transaction has already been recorded.");
  }

  database
    .prepare("UPDATE users SET nzd_balance_cents = nzd_balance_cents - ? WHERE id = ?")
    .run(input.amountCents, input.senderUserId);
  database
    .prepare("UPDATE users SET nzd_balance_cents = nzd_balance_cents + ? WHERE id = ?")
    .run(input.amountCents, input.recipientUserId);
  database
    .prepare(
      `INSERT INTO app_transfers (sender_user_id, recipient_user_id, amount_cents, stable_symbol, tx_hash, chain_id, status, note)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
    )
    .run(
      input.senderUserId,
      input.recipientUserId,
      input.amountCents,
      input.stableSymbol || "dNZD",
      input.txHash,
      input.chainId || 84532,
      input.note || `Base Sepolia dNZD transfer ${input.txHash}`,
    );

  recordFiatEvent(input.senderUserId, "withdrawal", input.amountCents, "NZD", `Sent to user #${input.recipientUserId}`, "stable-ledger");
  recordFiatEvent(input.recipientUserId, "top_up", input.amountCents, "NZD", `Received from user #${input.senderUserId}`, "stable-ledger");

  return getFiatAccount(input.senderUserId);
}

export function recordAppTransfer(input: {
  senderUserId: number;
  recipientUserId: number;
  amountCents: number;
  txHash: string;
  stableSymbol?: string;
  note?: string;
  chainId?: number;
}) {
  if (input.senderUserId === input.recipientUserId) {
    throw new Error("You cannot send money to yourself.");
  }

  const database = db();
  if (database.prepare("SELECT id FROM app_transfers WHERE tx_hash = ?").get(input.txHash)) {
    throw new Error("This blockchain transaction has already been recorded.");
  }

  database
    .prepare(
      `INSERT INTO app_transfers (sender_user_id, recipient_user_id, amount_cents, stable_symbol, tx_hash, chain_id, status, note)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
    )
    .run(
      input.senderUserId,
      input.recipientUserId,
      input.amountCents,
      input.stableSymbol || "dNZD",
      input.txHash,
      input.chainId || 84532,
      input.note || `Base Sepolia dNZD transfer ${input.txHash}`,
    );
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
       LIMIT 1`,
    )
    .get(normalizedUsername, value) as
    | { id: number; name: string; username: string; email: string; wallet_address: string | null }
    | undefined;
  return row || null;
}

export function findRecipientUserByUsername(identifier: string) {
  const value = identifier.trim();
  if (!value) return null;
  const normalizedUsername = value.startsWith("@") ? value.slice(1) : value;
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(normalizedUsername)) return null;

  const row = db()
    .prepare(
      `SELECT id, name, username, email, wallet_address
       FROM users
       WHERE lower(username) = lower(?)
       LIMIT 1`,
    )
    .get(normalizedUsername) as
    | { id: number; name: string; username: string; email: string; wallet_address: string | null }
    | undefined;
  return row || null;
}

export function getTransferUserSecrets(senderUserId: number, recipientUserId: number) {
  const sender = db()
    .prepare("SELECT id, wallet_address FROM users WHERE id = ?")
    .get(senderUserId) as
    | { id: number; wallet_address: string | null }
    | undefined;
  const recipient = db()
    .prepare("SELECT id, wallet_address FROM users WHERE id = ?")
    .get(recipientUserId) as
    | { id: number; wallet_address: string | null }
    | undefined;
  const senderAddress = sender?.wallet_address;
  const recipientAddress = recipient?.wallet_address;

  if (!senderAddress) {
    throw new Error("Your wallet is not available.");
  }
  if (!recipientAddress) {
    throw new Error("Recipient wallet is not available.");
  }

  return {
    senderWalletAddress: senderAddress,
    recipientWalletAddress: recipientAddress,
  };
}

export function usdToCents(amount: string) {
  return amountToCents(amount, "USD");
}

export function nzdToCents(amount: string) {
  return amountToCents(amount, "NZD");
}

export function amountToCents(amount: string, currency: FiatCurrency) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Enter a ${currency} amount greater than 0.`);
  }
  return Math.round(parsed * 100);
}

function ensureFiatAccount(userId: number) {
  db()
    .prepare("INSERT OR IGNORE INTO fiat_accounts (user_id, nzd_cents) VALUES (?, 0)")
    .run(userId);
}

function recordFiatEvent(
  userId: number,
  kind: "top_up" | "withdrawal",
  amountCents: number,
  currency: FiatCurrency,
  note: string,
  provider = "test-ledger",
) {
  db()
    .prepare(
      `INSERT INTO fiat_events (user_id, kind, amount_cents, status, provider, currency, note)
       VALUES (?, ?, ?, 'completed', ?, ?, ?)`,
    )
    .run(userId, kind, amountCents, provider, currency, note);
}

function centsToUsd(cents: number) {
  return (cents / 100).toFixed(2);
}

function centsToNzd(cents: number) {
  return (cents / 100).toFixed(2);
}
