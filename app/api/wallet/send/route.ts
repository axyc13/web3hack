import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveEnsAddress } from "@/lib/ens";

export const runtime = "nodejs";

const schema = z.object({
  chainId: z.coerce.number(),
  recipient: z.string(),
  amount: z.string().min(1),
  symbol: z.string().min(1),
  clientTxHash: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const user = await requireUser();
    const recipientAddress = await resolveEnsAddress(input.recipient);
    if (!recipientAddress) {
      return NextResponse.json(
        { error: "Recipient must be a valid wallet address or resolvable ENS name." },
        { status: 400 },
      );
    }

    if (input.clientTxHash) {
      db()
        .prepare(
          `INSERT INTO transfers (user_id, chain_id, asset_symbol, recipient, amount, tx_hash, status)
           VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
        )
        .run(user.id, input.chainId, input.symbol, recipientAddress, input.amount, input.clientTxHash);
      return NextResponse.json({ txHash: input.clientTxHash });
    }

    return NextResponse.json(
      { error: "PocketRail no longer sends from a server wallet. Sign the transfer with your Privy wallet." },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send transfer";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
