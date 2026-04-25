# PocketRail

A Next.js wallet-wrapper app for the Web3NZ hackathon idea: users register or log in, choose whether they already have a wallet, link an external wallet or create an embedded wallet, keep their session across refreshes, view assets, and send funds.

## What works

- Email/password registration and login.
- Persistent HTTP-only session cookie, so refresh does not log the user out.
- SQLite database in `data/app.sqlite` for users, sessions, and transfers.
- Registration flow asks whether the user already has a wallet.
- External wallet linking through `window.ethereum` and optional Privy wallet UI.
- Embedded wallet creation for local/demo use when the user does not attach one.
- ENS reverse lookup for linked/generated wallet addresses.
- Balance lookup for ETH and common stablecoins on Sepolia and Ethereum.
- Send flow for embedded wallets through the server wallet, and external wallets through the browser signer.

## Run it

```bash
npm install
npm run dev
```

The current dev server is running at:

```text
http://localhost:3001
```

Port `3000` was already occupied on this machine, so Next selected `3001`.

## Environment

Copy `.env.example` to `.env` and set these before using anything beyond local demos:

```bash
SESSION_SECRET="a-long-random-secret"
WALLET_ENCRYPTION_KEY="a-long-random-wallet-encryption-secret"
NEXT_PUBLIC_PRIVY_APP_ID="your-privy-app-id"
SEPOLIA_RPC_URL="optional-custom-rpc"
ETHEREUM_RPC_URL="optional-custom-rpc"
```

Privy is wired through `@privy-io/react-auth`. When `NEXT_PUBLIC_PRIVY_APP_ID` is present, the Privy button appears and uses Privy's `connectOrCreateWallet` flow. Without it, the app still works locally by creating an encrypted demo EVM wallet on the server.

ENS names are resolved through Ethereum mainnet reverse lookup. If the attached wallet has a valid reverse ENS record, the dashboard shows the ENS name next to the wallet and in account details.

## Production notes

For a real-money deployment, prefer Privy embedded wallets over server-held private keys, add email verification, require signed wallet-link verification, and use a production database such as Postgres. The server-created wallet path is useful for hackathon demos and local testing, but it is not the custody model you would ship for consumer funds.
