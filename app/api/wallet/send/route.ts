import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveEnsAddress } from "@/lib/ens";
import { sendFromEmbeddedWallet } from "@/lib/wallet";

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

    if (!user.encrypted_private_key) {
      return NextResponse.json(
        { error: "This account uses an external wallet. Sign the transfer in your browser wallet." },
        { status: 400 },
      );
    }

    const txHash = await sendFromEmbeddedWallet({
      encryptedPrivateKey: user.encrypted_private_key,
      chainId: input.chainId,
      recipient: recipientAddress,
      amount: input.amount,
      symbol: input.symbol,
    });

    db()
      .prepare(
        `INSERT INTO transfers (user_id, chain_id, asset_symbol, recipient, amount, tx_hash, status)
         VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
      )
      .run(user.id, input.chainId, input.symbol, recipientAddress, input.amount, txHash);

    return NextResponse.json({ txHash });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Could not send transfer";
    const message = raw.toLowerCase().includes("insufficient funds")
      ? "Insufficient funds for this transfer. Keep some Sepolia ETH in the generated wallet for gas, or send a smaller amount."
      : raw;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
