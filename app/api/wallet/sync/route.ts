import { isAddress } from "ethers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, userResponse } from "@/lib/auth";
import { db, DbUser } from "@/lib/db";
import { resolveEnsName } from "@/lib/ens";

export const runtime = "nodejs";

const schema = z.object({
  walletAddress: z.string(),
  privyUserId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());

    if (!isAddress(input.walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
    }

    if (!user.privy_user_id || user.privy_user_id !== input.privyUserId) {
      return NextResponse.json({ error: "Privy session does not match this account." }, { status: 403 });
    }

    if (user.wallet_address?.toLowerCase() === input.walletAddress.toLowerCase()) {
      return NextResponse.json({ user: userResponse(user) });
    }

    const ensName = await resolveEnsName(input.walletAddress);

    db()
      .prepare("UPDATE users SET wallet_address = ?, ens_name = ? WHERE id = ?")
      .run(input.walletAddress, ensName, user.id);

    const updatedUser = db()
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(user.id) as DbUser;

    return NextResponse.json({ user: userResponse(updatedUser) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sync wallet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
