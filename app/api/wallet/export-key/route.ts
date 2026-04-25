import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, verifyPassword } from "@/lib/auth";
import { decryptText } from "@/lib/crypto";

export const runtime = "nodejs";

const schema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const user = await requireUser();

    if (user.wallet_kind === "external" || !user.encrypted_private_key) {
      return NextResponse.json(
        { error: "This account uses a linked wallet, so PocketRail does not export a private key for it." },
        { status: 400 },
      );
    }

    const passwordOk = await verifyPassword(input.password, user.password_hash);
    if (!passwordOk) {
      return NextResponse.json({ error: "Password is incorrect." }, { status: 401 });
    }

    return NextResponse.json({ privateKey: decryptText(user.encrypted_private_key) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export private key";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
