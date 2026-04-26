import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { nzdToCents, recordAppTransfer } from "@/lib/fiat";
import { prepareAppTransfer } from "@/lib/app-transfers";
import { sendFromEmbeddedWallet } from "@/lib/wallet";

export const runtime = "nodejs";

const schema = z.object({
  recipient: z.string().min(1),
  amountNzd: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const sender = await requireUser();
    if (!sender.encrypted_private_key || !sender.wallet_address) {
      return NextResponse.json({ error: "Create an automatic PocketRail wallet before sending dNZD." }, { status: 400 });
    }

    const input = schema.parse(await request.json());
    const prepared = prepareAppTransfer(sender, input.recipient, input.amountNzd);
    const txHash = await sendFromEmbeddedWallet({
      encryptedPrivateKey: sender.encrypted_private_key,
      chainId: prepared.chainId,
      recipient: prepared.recipientWalletAddress,
      amount: input.amountNzd,
      symbol: prepared.token.symbol,
    });

    recordAppTransfer({
      senderUserId: sender.id,
      recipientUserId: prepared.recipient.id,
      amountCents: nzdToCents(input.amountNzd),
      txHash,
      stableSymbol: prepared.token.symbol,
      chainId: prepared.chainId,
      note: `PocketRail generated wallet transfer ${txHash}`,
    });

    return NextResponse.json({
      txHash,
      recipient: prepared.recipient,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send money";
    const status = message.includes("No PocketRail user found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
