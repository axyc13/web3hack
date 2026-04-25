import { NextResponse } from "next/server";
import { isAddress } from "ethers";
import { z } from "zod";
import { createPasswordHash, createSession, userResponse } from "@/lib/auth";
import { db, DbUser } from "@/lib/db";
import { resolveEnsName } from "@/lib/ens";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(2),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8),
  walletAddress: z.string(),
  privyUserId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const username = input.username.toLowerCase();
    const existingUsername = db()
      .prepare("SELECT id FROM users WHERE lower(username) = lower(?)")
      .get(username);
    if (existingUsername) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    if (!isAddress(input.walletAddress)) {
      return NextResponse.json({ error: "Connect a valid wallet first." }, { status: 400 });
    }
    const passwordHash = await createPasswordHash(input.password);
    const walletAddress = input.walletAddress;
    const ensName = await resolveEnsName(walletAddress);

    const result = db()
      .prepare(
        `INSERT INTO users
          (name, username, email, password_hash, wallet_address, linked_wallet_address, wallet_kind, ens_name, encrypted_private_key, privy_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        username,
        input.email.toLowerCase(),
        passwordHash,
        walletAddress,
        walletAddress,
        "external",
        ensName,
        null,
        input.privyUserId || null,
      );

    const user = db()
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(result.lastInsertRowid) as DbUser;
    await createSession(user.id);
    return NextResponse.json(userResponse(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not register";
    const status = message.includes("UNIQUE") ? 409 : 400;
    return NextResponse.json(
      { error: status === 409 ? "An account already exists for this email." : message },
      { status },
    );
  }
}
