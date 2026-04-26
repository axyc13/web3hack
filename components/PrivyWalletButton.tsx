"use client";

import { useEffect } from "react";
import { KeyRound } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import type { ConnectedWallet } from "@privy-io/react-auth";

export function PrivyWalletButton({
  onWallet,
  onStateChange,
}: {
  onWallet: (address: string) => void;
  onStateChange?: (input: { wallets: ConnectedWallet[]; privyUserId: string | null }) => void;
}) {
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || "";

  if (!appId) return null;
  return <PrivyWalletButtonInner onWallet={onWallet} onStateChange={onStateChange} />;
}

function PrivyWalletButtonInner({
  onWallet,
  onStateChange,
}: {
  onWallet: (address: string) => void;
  onStateChange?: (input: { wallets: ConnectedWallet[]; privyUserId: string | null }) => void;
}) {
  const { connectOrCreateWallet, ready, user } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy" && wallet.address);

  useEffect(() => {
    if (embeddedWallet?.address) onWallet(embeddedWallet.address);
  }, [embeddedWallet, onWallet]);

  useEffect(() => {
    onStateChange?.({
      wallets: wallets.filter((wallet): wallet is ConnectedWallet => wallet.type === "ethereum"),
      privyUserId: user?.id || null,
    });
  }, [onStateChange, user?.id, wallets]);

  return (
    <button
      type="button"
      className="secondary"
      disabled={!ready}
      onClick={() => connectOrCreateWallet()}
    >
      <KeyRound size={17} /> {embeddedWallet ? "Reconnect Privy wallet" : "Create Privy wallet"}
    </button>
  );
}
