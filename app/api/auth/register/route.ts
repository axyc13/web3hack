import { NextResponse } from "next/server";
import { isAddress } from "ethers";
import { z } from "zod";
import { createPasswordHash, createSession, userResponse } from "@/lib/auth";
import { db, DbUser } from "@/lib/db";
import { resolveEnsName } from "@/lib/ens";
import { createEmbeddedWallet } from "@/lib/wallet";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  walletMode: z.enum(["external", "embedded"]),
  walletAddress: z.string().optional(),
  privyUserId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const passwordHash = await createPasswordHash(input.password);
    let walletAddress = input.walletAddress || null;
    let encryptedPrivateKey: string | null = null;

    if (input.walletMode === "external") {
      if (!walletAddress || !isAddress(walletAddress)) {
        return NextResponse.json({ error: "Connect a valid wallet first." }, { status: 400 });
      }
    } else if (!walletAddress) {
      const wallet = createEmbeddedWallet();
      walletAddress = wallet.address;
      encryptedPrivateKey = wallet.encryptedPrivateKey;
    }
    const ensName = await resolveEnsName(walletAddress);

    const result = db()
      .prepare(
        `INSERT INTO users
          (name, email, password_hash, wallet_address, wallet_kind, ens_name, encrypted_private_key, privy_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.email.toLowerCase(),
        passwordHash,
        walletAddress,
        input.walletMode,
        ensName,
        encryptedPrivateKey,
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
