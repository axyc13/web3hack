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
  wallet_kind: "external" | null;
  ens_name: string | null;
  encrypted_private_key: string | null;
  privy_user_id: string | null;
  nzd_balance_cents: number;
  region_code: string;
  preferred_currency: string;
  created_at: string;
};

export type DbAutomationSettings = {
  user_id: number;
  ai_enabled: number;
  autopay_enabled: number;
  max_single_amount_cents: number;
  daily_limit_amount_cents: number;
  auto_approve_amount_cents: number;
  recipient_scope: "saved_only" | "any_registered";
  allowed_channels: string;
  updated_at: string;
};

export type DbSavedRecipient = {
  id: number;
  user_id: number;
  recipient_user_id: number;
  nickname: string | null;
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
        wallet_kind TEXT CHECK(wallet_kind IN ('external')),
        ens_name TEXT,
        encrypted_private_key TEXT,
        privy_user_id TEXT,
        nzd_balance_cents INTEGER NOT NULL DEFAULT 0,
        region_code TEXT NOT NULL DEFAULT 'NZ',
        preferred_currency TEXT NOT NULL DEFAULT 'NZD',
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
        currency TEXT NOT NULL DEFAULT 'USD',
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS app_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_user_id INTEGER NOT NULL,
        recipient_user_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        stable_symbol TEXT NOT NULL DEFAULT 'dNZD',
        tx_hash TEXT,
        chain_id INTEGER NOT NULL DEFAULT 11155111,
        status TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS automation_settings (
        user_id INTEGER PRIMARY KEY,
        ai_enabled INTEGER NOT NULL DEFAULT 0,
        autopay_enabled INTEGER NOT NULL DEFAULT 0,
        max_single_amount_cents INTEGER NOT NULL DEFAULT 10000,
        daily_limit_amount_cents INTEGER NOT NULL DEFAULT 50000,
        auto_approve_amount_cents INTEGER NOT NULL DEFAULT 2500,
        recipient_scope TEXT NOT NULL DEFAULT 'saved_only' CHECK(recipient_scope IN ('saved_only', 'any_registered')),
        allowed_channels TEXT NOT NULL DEFAULT 'dashboard',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS saved_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        recipient_user_id INTEGER NOT NULL,
        nickname TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_recipients_unique
      ON saved_recipients(user_id, recipient_user_id);
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
  if (!columns.some((column) => column.name === "nzd_balance_cents")) {
    instance.exec("ALTER TABLE users ADD COLUMN nzd_balance_cents INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "region_code")) {
    instance.exec("ALTER TABLE users ADD COLUMN region_code TEXT NOT NULL DEFAULT 'NZ'");
  }
  if (!columns.some((column) => column.name === "preferred_currency")) {
    instance.exec("ALTER TABLE users ADD COLUMN preferred_currency TEXT NOT NULL DEFAULT 'NZD'");
  }
  instance.exec(`
    UPDATE users
    SET wallet_address = COALESCE(linked_wallet_address, wallet_address),
        linked_wallet_address = COALESCE(linked_wallet_address, wallet_address),
        wallet_kind = CASE
          WHEN COALESCE(linked_wallet_address, wallet_address) IS NOT NULL THEN 'external'
          ELSE wallet_kind
        END,
        encrypted_private_key = NULL,
        region_code = COALESCE(NULLIF(region_code, ''), 'NZ'),
        preferred_currency = CASE
          WHEN preferred_currency IS NOT NULL AND preferred_currency != '' THEN preferred_currency
          WHEN region_code = 'AU' THEN 'AUD'
          WHEN region_code = 'US' THEN 'USD'
          WHEN region_code = 'GB' THEN 'GBP'
          WHEN region_code = 'EU' THEN 'EUR'
          WHEN region_code = 'SG' THEN 'SGD'
          WHEN region_code = 'JP' THEN 'JPY'
          ELSE 'NZD'
        END
  `);
  const appTransferColumns = instance
    .prepare("PRAGMA table_info(app_transfers)")
    .all() as Array<{ name: string }>;
  if (!appTransferColumns.some((column) => column.name === "tx_hash")) {
    instance.exec("ALTER TABLE app_transfers ADD COLUMN tx_hash TEXT");
  }
  if (!appTransferColumns.some((column) => column.name === "chain_id")) {
    instance.exec("ALTER TABLE app_transfers ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 11155111");
  }
  const automationColumns = instance
    .prepare("PRAGMA table_info(automation_settings)")
    .all() as Array<{ name: string }>;
  if (automationColumns.length === 0) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS automation_settings (
        user_id INTEGER PRIMARY KEY,
        ai_enabled INTEGER NOT NULL DEFAULT 0,
        autopay_enabled INTEGER NOT NULL DEFAULT 0,
        max_single_amount_cents INTEGER NOT NULL DEFAULT 10000,
        daily_limit_amount_cents INTEGER NOT NULL DEFAULT 50000,
        auto_approve_amount_cents INTEGER NOT NULL DEFAULT 2500,
        recipient_scope TEXT NOT NULL DEFAULT 'saved_only' CHECK(recipient_scope IN ('saved_only', 'any_registered')),
        allowed_channels TEXT NOT NULL DEFAULT 'dashboard',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }
  if (!automationColumns.some((column) => column.name === "autopay_enabled")) {
    instance.exec("ALTER TABLE automation_settings ADD COLUMN autopay_enabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!automationColumns.some((column) => column.name === "max_single_amount_cents")) {
    instance.exec("ALTER TABLE automation_settings ADD COLUMN max_single_amount_cents INTEGER NOT NULL DEFAULT 10000");
  }
  if (!automationColumns.some((column) => column.name === "daily_limit_amount_cents")) {
    instance.exec("ALTER TABLE automation_settings ADD COLUMN daily_limit_amount_cents INTEGER NOT NULL DEFAULT 50000");
  }
  if (!automationColumns.some((column) => column.name === "auto_approve_amount_cents")) {
    instance.exec("ALTER TABLE automation_settings ADD COLUMN auto_approve_amount_cents INTEGER NOT NULL DEFAULT 2500");
  }
  if (!automationColumns.some((column) => column.name === "recipient_scope")) {
    instance.exec("ALTER TABLE automation_settings ADD COLUMN recipient_scope TEXT NOT NULL DEFAULT 'saved_only'");
  }
  if (!automationColumns.some((column) => column.name === "allowed_channels")) {
    instance.exec("ALTER TABLE automation_settings ADD COLUMN allowed_channels TEXT NOT NULL DEFAULT 'dashboard'");
  }
  if (!automationColumns.some((column) => column.name === "updated_at")) {
    instance.exec("ALTER TABLE automation_settings ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  }
  const savedRecipientColumns = instance
    .prepare("PRAGMA table_info(saved_recipients)")
    .all() as Array<{ name: string }>;
  if (savedRecipientColumns.length === 0) {
    instance.exec(`
      CREATE TABLE IF NOT EXISTS saved_recipients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        recipient_user_id INTEGER NOT NULL,
        nickname TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }
  if (!savedRecipientColumns.some((column) => column.name === "nickname")) {
    instance.exec("ALTER TABLE saved_recipients ADD COLUMN nickname TEXT");
  }
  instance.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_recipients_unique
    ON saved_recipients(user_id, recipient_user_id)
  `);
  const fiatEventColumns = instance
    .prepare("PRAGMA table_info(fiat_events)")
    .all() as Array<{ name: string }>;
  if (!fiatEventColumns.some((column) => column.name === "currency")) {
    instance.exec("ALTER TABLE fiat_events ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'");
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
  instance.exec(`
    INSERT OR IGNORE INTO automation_settings (
      user_id,
      ai_enabled,
      autopay_enabled,
      max_single_amount_cents,
      daily_limit_amount_cents,
      auto_approve_amount_cents,
      recipient_scope,
      allowed_channels
    )
    SELECT id, 0, 0, 10000, 50000, 2500, 'saved_only', 'dashboard'
    FROM users
  `);
}

export function publicUser(user: DbUser) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    walletAddress: user.linked_wallet_address || user.wallet_address,
    linkedWalletAddress: user.linked_wallet_address || user.wallet_address,
    walletKind: user.wallet_kind,
    ensName: user.ens_name,
    regionCode: user.region_code,
    preferredCurrency: user.preferred_currency,
    hasServerWallet: false,
    privyUserId: user.privy_user_id,
    createdAt: user.created_at,
  };
}
