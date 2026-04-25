import crypto from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { db, DbUser, publicUser } from "./db";
import { hashToken } from "./crypto";

const cookieName = "wallet_session";
const thirtyDays = 1000 * 60 * 60 * 24 * 30;

export async function createPasswordHash(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + thirtyDays;
  db()
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash, userId, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: thirtyDays / 1000,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (token) {
    db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
  cookieStore.delete(cookieName);
}

export async function currentUser(): Promise<DbUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  const row = db()
    .prepare(
      `SELECT users.*
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .get(hashToken(token), Date.now()) as DbUser | undefined;

  return row || null;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export function userResponse(user: DbUser) {
  return { user: publicUser(user) };
}
