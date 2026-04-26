"use client";

import { useEffect, useRef } from "react";
import { KeyRound } from "lucide-react";
import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import type { ConnectedWallet } from "@privy-io/react-auth";

type WalletStateInput = {
  wallets: ConnectedWallet[];
  privyUserId: string | null;
};

export function PrivyWalletButton({
  label,
  onWallet,
  onStateChange,
}: {
  label?: string;
  onWallet: (address: string) => void;
  onStateChange?: (input: WalletStateInput) => void;
}) {
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || "";

  if (!appId) return null;
  return (
    <PrivyWalletButtonInner
      label={label}
      onWallet={onWallet}
      onStateChange={onStateChange}
    />
  );
}

function PrivyWalletButtonInner({
  label,
  onWallet,
  onStateChange,
}: {
  label?: string;
  onWallet: (address: string) => void;
  onStateChange?: (input: WalletStateInput) => void;
}) {
  const { authenticated, login, ready, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { wallets } = useWallets();
  const selectedWallet = wallets.find((wallet) => wallet.walletClientType === "privy" && wallet.address);
  const onWalletRef = useRef(onWallet);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onWalletRef.current = onWallet;
  }, [onWallet]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (selectedWallet?.address) {
      onWalletRef.current(selectedWallet.address);
    }
  }, [selectedWallet?.address]);

  useEffect(() => {
    onStateChangeRef.current?.({
      wallets: wallets.filter((wallet): wallet is ConnectedWallet => wallet.type === "ethereum"),
      privyUserId: user?.id || null,
    });
  }, [user?.id, wallets]);

  async function handleClick() {
    if (!ready) return;

    if (!authenticated) {
      login();
      return;
    }

    if (selectedWallet?.address) {
      onWalletRef.current(selectedWallet.address);
      return;
    }

    await createWallet();
  }

  return (
    <button
      type="button"
      className="secondary"
      disabled={!ready}
      onClick={() => void handleClick()}
    >
      <KeyRound size={17} /> {label || "Create wallet with email"}
    </button>
  );
}

export function PrivyWalletStateSync({
  onStateChange,
}: {
  onStateChange: (input: WalletStateInput) => void;
}) {
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || "";

  if (!appId) return null;
  return <PrivyWalletStateSyncInner onStateChange={onStateChange} />;
}

function PrivyWalletStateSyncInner({
  onStateChange,
}: {
  onStateChange: (input: WalletStateInput) => void;
}) {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onStateChangeRef.current({
      wallets: wallets.filter((wallet): wallet is ConnectedWallet => wallet.type === "ethereum"),
      privyUserId: user?.id || null,
    });
  }, [user?.id, wallets]);

  return null;
}
