import { db } from "./db";

export type FiatEvent = {
  id: number;
  kind: "top_up" | "withdrawal";
  amountCents: number;
  amountNzd: string;
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
    balanceNzd: centsToNzd(account.nzd_cents),
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      amountCents: event.amount_cents,
      amountNzd: centsToNzd(event.amount_cents),
      status: event.status,
      provider: event.provider,
      note: event.note,
      createdAt: event.created_at,
    })) satisfies FiatEvent[],
  };
}

export function topUpTestNzd(userId: number, amountCents: number) {
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

export function withdrawTestNzd(userId: number, amountCents: number) {
  ensureFiatAccount(userId);
  const account = getFiatAccount(userId);
  if (account.balanceCents < amountCents) {
    throw new Error("Insufficient NZD test balance.");
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

export function nzdToCents(amount: string) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Enter an NZD amount greater than 0.");
  }
  return Math.round(parsed * 100);
}

function ensureFiatAccount(userId: number) {
  db()
    .prepare("INSERT OR IGNORE INTO fiat_accounts (user_id, nzd_cents) VALUES (?, 0)")
    .run(userId);
}

function centsToNzd(cents: number) {
  return (cents / 100).toFixed(2);
}
