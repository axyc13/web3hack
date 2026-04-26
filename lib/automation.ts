import { db, DbAutomationSettings } from "./db";
import { findRecipientUserByUsername, nzdToCents } from "./fiat";

export type RecipientScope = "saved_only" | "any_registered";

export type AutomationSettings = {
  aiEnabled: boolean;
  autopayEnabled: boolean;
  maxSingleAmountNzd: string;
  dailyLimitAmountNzd: string;
  autoApproveAmountNzd: string;
  recipientScope: RecipientScope;
  allowedChannels: string[];
  dailyUsedAmountNzd: string;
  dailyRemainingAmountNzd: string;
};

export type SavedRecipient = {
  id: number;
  recipientUserId: number;
  name: string;
  username: string;
  walletAddress: string | null;
  nickname: string | null;
  createdAt: string;
};

export type AutomationOverview = {
  settings: AutomationSettings;
  recipients: SavedRecipient[];
  agentBrief: string;
};

export type AutomationTransferReview = {
  allowed: boolean;
  recipientAllowed: boolean;
  channelAllowed: boolean;
  exceedsSingleLimit: boolean;
  exceedsDailyLimit: boolean;
  requiresConfirmation: boolean;
  reasons: string[];
};

type UpdateAutomationInput = {
  aiEnabled: boolean;
  autopayEnabled: boolean;
  maxSingleAmountNzd: string;
  dailyLimitAmountNzd: string;
  autoApproveAmountNzd: string;
  recipientScope: RecipientScope;
  allowedChannels: string[];
};

export function getAutomationOverview(userId: number) {
  const row = ensureAutomationSettings(userId);
  const recipients = listSavedRecipients(userId);
  const settings = mapSettings(row, getDailyTransferredAmountCents(userId));

  return {
    settings,
    recipients,
    agentBrief: buildAgentBrief(userId, settings, recipients),
  } satisfies AutomationOverview;
}

export function updateAutomationSettings(userId: number, input: UpdateAutomationInput) {
  const maxSingleAmountCents = toNonNegativeCents(input.maxSingleAmountNzd, "single transfer limit");
  const dailyLimitAmountCents = toNonNegativeCents(input.dailyLimitAmountNzd, "daily limit");
  const autoApproveAmountCents = toNonNegativeCents(input.autoApproveAmountNzd, "auto-approve limit");

  if (maxSingleAmountCents === 0) {
    throw new Error("Set the single transfer limit above 0.");
  }
  if (dailyLimitAmountCents < maxSingleAmountCents) {
    throw new Error("Daily limit must be at least the single transfer limit.");
  }
  if (autoApproveAmountCents > maxSingleAmountCents) {
    throw new Error("Auto-approve limit cannot be higher than the single transfer limit.");
  }

  const allowedChannels = normalizeChannels(input.allowedChannels);
  if (allowedChannels.length === 0) {
    throw new Error("Add at least one approved automation channel.");
  }

  db()
    .prepare(
      `INSERT INTO automation_settings (
        user_id,
        ai_enabled,
        autopay_enabled,
        max_single_amount_cents,
        daily_limit_amount_cents,
        auto_approve_amount_cents,
        recipient_scope,
        allowed_channels,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        ai_enabled = excluded.ai_enabled,
        autopay_enabled = excluded.autopay_enabled,
        max_single_amount_cents = excluded.max_single_amount_cents,
        daily_limit_amount_cents = excluded.daily_limit_amount_cents,
        auto_approve_amount_cents = excluded.auto_approve_amount_cents,
        recipient_scope = excluded.recipient_scope,
        allowed_channels = excluded.allowed_channels,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .run(
      userId,
      input.aiEnabled ? 1 : 0,
      input.autopayEnabled ? 1 : 0,
      maxSingleAmountCents,
      dailyLimitAmountCents,
      autoApproveAmountCents,
      input.recipientScope,
      allowedChannels.join(","),
    );

  return getAutomationOverview(userId);
}

export function addSavedRecipient(userId: number, identifier: string, nickname?: string | null) {
  const recipient = findRecipientUserByUsername(identifier);
  if (!recipient) {
    throw new Error("No PocketRail user found for that username.");
  }
  if (recipient.id === userId) {
    throw new Error("You cannot save yourself as a recipient.");
  }

  const normalizedNickname = normalizeNickname(nickname);
  const existing = db()
    .prepare("SELECT id FROM saved_recipients WHERE user_id = ? AND recipient_user_id = ?")
    .get(userId, recipient.id) as { id: number } | undefined;

  if (existing) {
    db()
      .prepare(
        `UPDATE saved_recipients
         SET nickname = COALESCE(?, nickname)
         WHERE id = ? AND user_id = ?`,
      )
      .run(normalizedNickname, existing.id, userId);
  } else {
    db()
      .prepare(
        `INSERT INTO saved_recipients (user_id, recipient_user_id, nickname)
         VALUES (?, ?, ?)`,
      )
      .run(userId, recipient.id, normalizedNickname);
  }

  return getAutomationOverview(userId);
}

export function removeSavedRecipient(userId: number, savedRecipientId: number) {
  db()
    .prepare("DELETE FROM saved_recipients WHERE id = ? AND user_id = ?")
    .run(savedRecipientId, userId);

  return getAutomationOverview(userId);
}

export function updateSavedRecipient(userId: number, savedRecipientId: number, nickname?: string | null) {
  const existing = db()
    .prepare("SELECT id FROM saved_recipients WHERE id = ? AND user_id = ?")
    .get(savedRecipientId, userId) as { id: number } | undefined;
  if (!existing) {
    throw new Error("Saved recipient not found.");
  }

  db()
    .prepare(
      `UPDATE saved_recipients
       SET nickname = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(normalizeNickname(nickname), savedRecipientId, userId);

  return getAutomationOverview(userId);
}

export function isSavedRecipient(userId: number, recipientUserId: number) {
  const row = db()
    .prepare("SELECT id FROM saved_recipients WHERE user_id = ? AND recipient_user_id = ?")
    .get(userId, recipientUserId);
  return Boolean(row);
}

export function reviewAutomationTransfer(userId: number, input: {
  recipientUserId: number;
  amountNzd: string;
  channel?: string;
}) {
  const { settings } = getAutomationOverview(userId);
  const amountCents = nzdToCents(input.amountNzd);
  const channel = (input.channel || "dashboard").trim().toLowerCase();
  const reasons: string[] = [];
  const channelAllowed = settings.allowedChannels.includes(channel);
  const recipientAllowed =
    settings.recipientScope === "any_registered" || isSavedRecipient(userId, input.recipientUserId);
  const exceedsSingleLimit = amountCents > toNonNegativeCents(settings.maxSingleAmountNzd, "single transfer limit");
  const exceedsDailyLimit = amountCents > toNonNegativeCents(settings.dailyRemainingAmountNzd, "daily remaining limit");

  if (!channelAllowed) {
    reasons.push(`"${channel}" is not in your approved AI channels.`);
  }
  if (!recipientAllowed) {
    reasons.push("This recipient is not allowed by your saved-recipient policy.");
  }
  if (exceedsSingleLimit) {
    reasons.push(`This amount is above your single transfer limit of ${settings.maxSingleAmountNzd} dNZD.`);
  }
  if (exceedsDailyLimit) {
    reasons.push(`This amount would exceed your remaining daily limit of ${settings.dailyRemainingAmountNzd} dNZD.`);
  }

  return {
    allowed: reasons.length === 0,
    recipientAllowed,
    channelAllowed,
    exceedsSingleLimit,
    exceedsDailyLimit,
    requiresConfirmation: true,
    reasons,
  } satisfies AutomationTransferReview;
}

export function findSavedRecipientByAlias(userId: number, identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (!value) return null;
  const plainValue = value.startsWith("@") ? value.slice(1) : value;

  const recipient = listSavedRecipients(userId).find((item) => {
    const nickname = item.nickname?.trim().toLowerCase();
    return (
      nickname === plainValue ||
      item.username.toLowerCase() === plainValue ||
      item.name.trim().toLowerCase() === plainValue
    );
  });

  if (recipient) {
    return recipient;
  }

  const matchedUser = findRecipientUserByUsername(identifier);
  if (!matchedUser) {
    return null;
  }

  return listSavedRecipients(userId).find((item) => item.recipientUserId === matchedUser.id) || null;
}

function listSavedRecipients(userId: number) {
  return db()
    .prepare(
      `SELECT
         saved_recipients.id,
         saved_recipients.recipient_user_id,
         saved_recipients.nickname,
         saved_recipients.created_at,
         users.name,
         users.username,
         users.wallet_address AS wallet_address
       FROM saved_recipients
       JOIN users ON users.id = saved_recipients.recipient_user_id
       WHERE saved_recipients.user_id = ?
       ORDER BY lower(COALESCE(saved_recipients.nickname, users.name, users.username)) ASC, saved_recipients.id ASC`,
    )
    .all(userId)
    .map((row) => ({
      id: Number((row as SavedRecipientRow).id),
      recipientUserId: Number((row as SavedRecipientRow).recipient_user_id),
      name: (row as SavedRecipientRow).name,
      username: (row as SavedRecipientRow).username,
      walletAddress: (row as SavedRecipientRow).wallet_address,
      nickname: (row as SavedRecipientRow).nickname,
      createdAt: (row as SavedRecipientRow).created_at,
    })) satisfies SavedRecipient[];
}

function ensureAutomationSettings(userId: number) {
  db()
    .prepare(
      `INSERT OR IGNORE INTO automation_settings (
        user_id,
        ai_enabled,
        autopay_enabled,
        max_single_amount_cents,
        daily_limit_amount_cents,
        auto_approve_amount_cents,
        recipient_scope,
        allowed_channels
      )
      VALUES (?, 0, 0, 10000, 50000, 2500, 'saved_only', 'dashboard')`,
    )
    .run(userId);

  return db()
    .prepare("SELECT * FROM automation_settings WHERE user_id = ?")
    .get(userId) as DbAutomationSettings;
}

function getDailyTransferredAmountCents(userId: number) {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM app_transfers
       WHERE sender_user_id = ?
         AND status = 'completed'
         AND created_at >= datetime('now', '-1 day')`,
    )
    .get(userId) as { total: number } | undefined;

  return row?.total || 0;
}

function mapSettings(row: DbAutomationSettings, dailyUsedAmountCents: number) {
  const dailyRemainingAmountCents = Math.max(row.daily_limit_amount_cents - dailyUsedAmountCents, 0);

  return {
    aiEnabled: Boolean(row.ai_enabled),
    autopayEnabled: Boolean(row.autopay_enabled),
    maxSingleAmountNzd: centsToAmount(row.max_single_amount_cents),
    dailyLimitAmountNzd: centsToAmount(row.daily_limit_amount_cents),
    autoApproveAmountNzd: centsToAmount(row.auto_approve_amount_cents),
    recipientScope: row.recipient_scope,
    allowedChannels: normalizeChannels(row.allowed_channels.split(",")),
    dailyUsedAmountNzd: centsToAmount(dailyUsedAmountCents),
    dailyRemainingAmountNzd: centsToAmount(dailyRemainingAmountCents),
  } satisfies AutomationSettings;
}

function buildAgentBrief(userId: number, settings: AutomationSettings, recipients: SavedRecipient[]) {
  const user = db()
    .prepare("SELECT username, name FROM users WHERE id = ?")
    .get(userId) as { username: string; name: string } | undefined;
  const owner = user?.username ? `@${user.username}` : user?.name || "the account owner";
  const recipientLines = recipients.length
    ? recipients.map((recipient) => {
        const label = recipient.nickname || recipient.name;
        return `- ${label} (@${recipient.username})${recipient.walletAddress ? ` ${recipient.walletAddress}` : ""}`;
      })
    : ["- No saved recipients yet."];

  return [
    `PocketRail automation brief for ${owner}`,
    `AI automation: ${settings.aiEnabled ? "enabled" : "disabled"}`,
    `Autopay without manual intervention: ${settings.autopayEnabled ? "enabled" : "disabled"}`,
    `Single transfer cap: ${settings.maxSingleAmountNzd} dNZD`,
    `Daily cap: ${settings.dailyLimitAmountNzd} dNZD`,
    `Auto-approve threshold: ${settings.autoApproveAmountNzd} dNZD`,
    `Recipient policy: ${settings.recipientScope === "saved_only" ? "saved recipients only" : "any PocketRail user"}`,
    `Allowed inbound channels: ${settings.allowedChannels.join(", ")}`,
    "Saved recipients:",
    ...recipientLines,
    "Never send if the requested amount exceeds the single-transfer cap or would break the daily cap.",
    "If the recipient is not allowed by policy, stop and ask the account owner to save them first.",
    "If the request is above the auto-approve threshold, prepare the transfer but require explicit confirmation.",
  ].join("\n");
}

function normalizeChannels(channels: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const channel of channels) {
    const normalized = channel.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeNickname(value?: string | null) {
  const normalized = value?.trim() || null;
  if (!normalized) return null;
  return normalized.slice(0, 40);
}

function toNonNegativeCents(amount: string, label: string) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return Math.round(parsed * 100);
}

function centsToAmount(cents: number) {
  return (cents / 100).toFixed(2);
}

type SavedRecipientRow = {
  id: number;
  recipient_user_id: number;
  nickname: string | null;
  created_at: string;
  name: string;
  username: string;
  wallet_address: string | null;
};
