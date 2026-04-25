import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DbUser = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  wallet_address: string | null;
  wallet_kind: "external" | "embedded" | null;
  ens_name: string | null;
  encrypted_private_key: string | null;
  privy_user_id: string | null;
  created_at: string;
};

declare global {
  // eslint-disable-next-line no-var
  var walletAppDb: DatabaseSync | undefined;
}

const dbPath = join(process.cwd(), "data", "app.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

export function db() {
  if (!globalThis.walletAppDb) {
    const instance = new DatabaseSync(dbPath);
    instance.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        wallet_address TEXT,
        wallet_kind TEXT CHECK(wallet_kind IN ('external', 'embedded')),
        ens_name TEXT,
        encrypted_private_key TEXT,
        privy_user_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        chain_id INTEGER NOT NULL,
        asset_symbol TEXT NOT NULL,
        recipient TEXT NOT NULL,
        amount TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS fiat_accounts (
        user_id INTEGER PRIMARY KEY,
        nzd_cents INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS fiat_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('top_up', 'withdrawal')),
        amount_cents INTEGER NOT NULL,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    globalThis.walletAppDb = instance;
  }
  ensureSchema(globalThis.walletAppDb);
  return globalThis.walletAppDb;
}

function ensureSchema(instance: DatabaseSync) {
  const columns = instance
    .prepare("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "ens_name")) {
    instance.exec("ALTER TABLE users ADD COLUMN ens_name TEXT");
  }
}

export function publicUser(user: DbUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    walletAddress: user.wallet_address,
    walletKind: user.wallet_kind,
    ensName: user.ens_name,
    hasServerWallet: Boolean(user.encrypted_private_key),
    privyUserId: user.privy_user_id,
    createdAt: user.created_at,
  };
}
