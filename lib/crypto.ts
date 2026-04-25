import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function key() {
  const secret =
    process.env.WALLET_ENCRYPTION_KEY ||
    "dev-only-wallet-key-change-before-real-funds";
  return crypto.createHash("sha256").update(secret).digest();
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function encryptText(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptText(payload: string) {
  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = crypto.createDecipheriv(
    algorithm,
    key(),
    Buffer.from(ivRaw, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
