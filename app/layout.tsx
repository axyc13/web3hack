import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PrivyShell } from "@/components/PrivyShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "PocketRail",
  description: "A simple wallet wrapper for crypto onboarding and transfers.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PrivyShell>{children}</PrivyShell>
      </body>
    </html>
  );
}
