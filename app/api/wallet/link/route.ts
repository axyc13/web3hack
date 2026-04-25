import { NextResponse } from "next/server";
import { isAddress } from "ethers";
import { z } from "zod";
import { requireUser, userResponse } from "@/lib/auth";
import { db, DbUser } from "@/lib/db";
import { resolveEnsName } from "@/lib/ens";

export const runtime = "nodejs";

const schema = z.object({
  walletAddress: z.string(),
  privyUserId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (!isAddress(input.walletAddress)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }
    const user = await requireUser();
    const ensName = await resolveEnsName(input.walletAddress);
    db()
      .prepare(
        `UPDATE users
         SET wallet_address = ?, wallet_kind = 'external', ens_name = ?, encrypted_private_key = NULL, privy_user_id = COALESCE(?, privy_user_id)
         WHERE id = ?`,
      )
      .run(input.walletAddress, ensName, input.privyUserId || null, user.id);

    const updated = db().prepare("SELECT * FROM users WHERE id = ?").get(user.id) as DbUser;
    return NextResponse.json(userResponse(updated));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not link wallet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
