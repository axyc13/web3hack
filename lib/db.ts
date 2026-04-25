import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DbUser = {
  id: number;
  name: string;
  username: string;
  email: string;
  password_hash: string;
  wallet_address: string | null;
  linked_wallet_address: string | null;
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
        username TEXT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        wallet_address TEXT,
        linked_wallet_address TEXT,
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
      CREATE TABLE IF NOT EXISTS app_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_user_id INTEGER NOT NULL,
        recipient_user_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        stable_symbol TEXT NOT NULL DEFAULT 'USDC',
        tx_hash TEXT,
        chain_id INTEGER NOT NULL DEFAULT 11155111,
        status TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
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
  if (!columns.some((column) => column.name === "username")) {
    instance.exec("ALTER TABLE users ADD COLUMN username TEXT");
  }
  if (!columns.some((column) => column.name === "linked_wallet_address")) {
    instance.exec("ALTER TABLE users ADD COLUMN linked_wallet_address TEXT");
  }
  const appTransferColumns = instance
    .prepare("PRAGMA table_info(app_transfers)")
    .all() as Array<{ name: string }>;
  if (!appTransferColumns.some((column) => column.name === "tx_hash")) {
    instance.exec("ALTER TABLE app_transfers ADD COLUMN tx_hash TEXT");
  }
  if (!appTransferColumns.some((column) => column.name === "chain_id")) {
    instance.exec("ALTER TABLE app_transfers ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 11155111");
  }
  const users = instance.prepare("SELECT id, email, username FROM users").all() as Array<{
    id: number;
    email: string;
    username: string | null;
  }>;
  for (const user of users) {
    if (user.username) continue;
    const base = user.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "user";
    let candidate = base;
    let suffix = 1;
    while (
      instance
        .prepare("SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?")
        .get(candidate, user.id)
    ) {
      candidate = `${base}${suffix++}`;
    }
    instance.prepare("UPDATE users SET username = ? WHERE id = ?").run(candidate, user.id);
  }
  instance.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(lower(username))");
}

export function publicUser(user: DbUser) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    walletAddress: user.wallet_address,
    linkedWalletAddress: user.linked_wallet_address,
    walletKind: user.wallet_kind,
    ensName: user.ens_name,
    hasServerWallet: Boolean(user.encrypted_private_key) && user.wallet_kind !== "external",
    privyUserId: user.privy_user_id,
    createdAt: user.created_at,
  };
}
