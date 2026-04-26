# PocketRail

A Next.js bank-style crypto app for the Web3NZ hackathon idea: users register, get a Privy-generated wallet, hold a fiat-style balance view, and send money to other PocketRail users without needing to manage Base Sepolia gas manually.

## What works

- Email/password registration and login.
- Persistent HTTP-only session cookie, so refresh does not log the user out.
- Unique usernames checked during registration.
- SQLite database in `data/app.sqlite` for users, sessions, balances, and transfers.
- Privy embedded wallet creation during registration.
- USD-facing balance backed by Base Sepolia dNZD transfers.
- Add/withdraw test money for hackathon demos.
- Send money only to another PocketRail user by `@username` or their hidden wallet address.
- User-to-user sends submit an ERC-20 dNZD transfer on Base Sepolia and store the real tx hash.
- Transaction history for incoming/outgoing PocketRail transfers.

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

## Docker Deploy

Build and run the production app on port `3003`:

```bash
docker compose up --build -d
```

The SQLite database is stored in the named Docker volume `pocketrail-data` mounted at `/app/data`, so `data/app.sqlite` survives container restarts and image rebuilds. Set real secrets before deploying:

```bash
SESSION_SECRET="a-long-random-secret"
WALLET_ENCRYPTION_KEY="a-long-random-wallet-encryption-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3003"
```

Stop the deployment with:

```bash
docker compose down
```

## GitHub Actions Deploy

The workflow in `.github/workflows/deploy.yml` deploys on every push to `main`. It SSHs into your server, updates the server-side repo, rebuilds Docker with no cache, and recreates the app container.

Set these repository secrets:

```text
DEPLOY_HOST
DEPLOY_USER
DEPLOY_SSH_KEY
DEPLOY_PORT
DEPLOY_PATH
NEXT_PUBLIC_APP_URL
SESSION_SECRET
WALLET_ENCRYPTION_KEY
```

`DEPLOY_PATH` is the absolute path to the cloned repo on your server, for example `/home/vjam/web3hack`. If it is omitted, the workflow uses `/home/vjam/web3hack`.

The server needs Git and Docker Compose installed. The workflow runs `git pull --ff-only origin main`, `docker compose build --no-cache pocketrail`, and `docker compose up -d --force-recreate pocketrail`. The app is exposed on port `3003`, and SQLite stays in the persistent Docker volume `pocketrail-data`.

## Environment

Copy `.env.example` to `.env` and set these before using anything beyond local demos:

```bash
SESSION_SECRET="a-long-random-secret"
NEXT_PUBLIC_PRIVY_APP_ID="your-privy-app-id"
BANXA_PARTNER_NAME="your-banxa-partner-name"
BANXA_ENV="sandbox"
BASE_RPC_URL="optional-custom-rpc"
ETHEREUM_RPC_URL="optional-custom-rpc"
BASE_DNZD_ADDRESS="0x63ee4b77d3912DC7bCe711c3BE7bF12D532F1853"
BASE_DNZD_DECIMALS="6"
```

Card top-ups and bank withdrawals are launched through Banxa's hosted sandbox checkout so PocketRail never collects or stores raw card/bank details. Use `BANXA_ENV=production` only after your Banxa partner account, domain, payment methods, KYC/AML settings, and supported corridors are approved.

For hackathon demos, the dashboard includes a local test USD balance. It is intentionally not real money: it lets judges try the account balance, top-up, withdrawal, and user-to-user transfer UX immediately while keeping the architecture ready for Banxa or another regulated provider later.

To make the sponsored transfer flow succeed, the sender wallet only needs dNZD on Base Sepolia. Gas is expected to be covered by Privy sponsorship once the dashboard and app are configured correctly.

Banxa sandbox notes:

- You need a Banxa partner name from Banxa onboarding.
- Sandbox checkout opens `https://{BANXA_PARTNER_NAME}.banxa-sandbox.com`.
- Production checkout opens `https://{BANXA_PARTNER_NAME}.banxa.com`.
- Buy flow passes `coinType=ETH`, `fiatType=USD`, `fiatAmount=50`, `blockchain=ETH`, and the user wallet address.
- Sell flow passes `orderType=sell`, `coinType=ETH`, `fiatType=USD`, `blockchain=ETH`, and the user wallet address.

## Production notes

For a real-money deployment, keep Privy as the wallet layer, add email verification, and use a production database such as Postgres.
