import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { chainById } from "@/lib/chains";
import { getFiatAccount } from "@/lib/fiat";
import { getBalances } from "@/lib/wallet";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const address = user.wallet_address;
    if (!address) {
      return NextResponse.json({ balances: [] });
    }
    const balances = await getBalances(address);
    const fiat = getFiatAccount(user.id);
    const demoDnzBalance = Number(fiat.nzdBalance || "0");
    if (demoDnzBalance > 0) {
      const baseGroup = balances.find((group) => group.chain.id === 84532);
      const existingDnzdAsset = baseGroup?.assets.find((asset) => asset.symbol === "dNZD");
      if (existingDnzdAsset) {
        existingDnzdAsset.balance = (Number(existingDnzdAsset.balance || "0") + demoDnzBalance).toFixed(2);
      } else if (baseGroup) {
        baseGroup.assets.unshift({
          symbol: "dNZD",
          name: "PocketRail demo dNZD",
          chainId: 84532,
          chainName: baseGroup.chain.name,
          decimals: 18,
          balance: demoDnzBalance.toFixed(2),
          rawBalance: "0",
          native: false,
        });
      } else {
        const baseChain = chainById(84532);
        if (!baseChain) {
          throw new Error("Base Sepolia is not configured.");
        }
        balances.unshift({
          chain: baseChain,
          assets: [{
            symbol: "dNZD",
            name: "PocketRail demo dNZD",
            chainId: 84532,
            chainName: "Base Sepolia",
            decimals: 18,
            balance: demoDnzBalance.toFixed(2),
            rawBalance: "0",
            native: false,
          }],
        });
      }
    }
    return NextResponse.json({ balances });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load balances";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
