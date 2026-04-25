"use client";

import { useEffect } from "react";
import { KeyRound } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

export function PrivyWalletButton({ onWallet }: { onWallet: (address: string) => void }) {
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || "";

  if (!appId) return null;
  return <PrivyWalletButtonInner onWallet={onWallet} />;
}

function PrivyWalletButtonInner({ onWallet }: { onWallet: (address: string) => void }) {
  const { connectOrCreateWallet, ready } = usePrivy();
  const { wallets } = useWallets();

  useEffect(() => {
    if (wallets[0]?.address) onWallet(wallets[0].address);
  }, [wallets, onWallet]);

  return (
    <button
      type="button"
      className="secondary"
      disabled={!ready}
      onClick={() => connectOrCreateWallet()}
    >
      <KeyRound size={17} /> Privy wallet
    </button>
  );
}
