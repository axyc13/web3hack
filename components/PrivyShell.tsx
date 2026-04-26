"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export function PrivyShell({ children }: { children: ReactNode }) {
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || "";

  if (!appId) return <>{children}</>;

  return (
    <PrivyProvider
      appId={appId}
      config={
        {
          appearance: {
            theme: "light",
            accentColor: "#2563eb",
            walletChainType: "ethereum-only",
            loginMessage: "Continue with email to create or reconnect your PocketRail wallet.",
          },
          loginMethods: ["email"],
          embeddedWallets: {
            ethereum: {
              createOnLogin: "users-without-wallets",
            },
          },
        } as never
      }
    >
      {children}
    </PrivyProvider>
  );
}
