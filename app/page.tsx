"use client";

import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, ethers, isAddress } from "ethers";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  History,
  KeyRound,
  Link2,
  Lock,
  Loader2,
  LogOut,
  RefreshCcw,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { PrivyWalletButton } from "@/components/PrivyWalletButton";

type User = {
  id: number;
  name: string;
  email: string;
  walletAddress: string | null;
  walletKind: "external" | "embedded" | null;
  ensName: string | null;
  hasServerWallet: boolean;
};

type Asset = {
  symbol: string;
  name: string;
  chainId: number;
  chainName: string;
  decimals: number;
  balance: string;
  rawBalance: string;
  native: boolean;
};

type BalanceGroup = {
  chain: { id: number; name: string; explorer: string };
  assets: Asset[];
};

type WalletTransaction = {
  hash: string;
  chainId: number;
  chainName: string;
  explorerUrl: string;
  direction: "incoming" | "outgoing" | "self" | "unknown";
  from: string;
  to: string;
  amount: string;
  symbol: string;
  fee: string | null;
  status: string;
  method: string | null;
  timestamp: string;
  source: "explorer" | "local";
};

type CryptoQuote = {
  id: string;
  symbol: string;
  name: string;
  nzd: number;
};

type FiatAccount = {
  balanceCents: number;
  balanceNzd: string;
  events: Array<{
    id: number;
    kind: "top_up" | "withdrawal";
    amountNzd: string;
    status: string;
    provider: string;
    note: string | null;
    createdAt: string;
  }>;
};

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [walletMode, setWalletMode] = useState<"embedded" | "external">("embedded");
  const [connectedWallet, setConnectedWallet] = useState("");
  const [balances, setBalances] = useState<BalanceGroup[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [quotes, setQuotes] = useState<CryptoQuote[]>([]);
  const [fiat, setFiat] = useState<FiatAccount | null>(null);
  const [selected, setSelected] = useState("");
  const [sendAsset, setSendAsset] = useState("USDC");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [bankAmount, setBankAmount] = useState("50");
  const [exportPassword, setExportPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [dataStatus, setDataStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [sendError, setSendError] = useState("");
  const [exportError, setExportError] = useState("");
  const [dataError, setDataError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const flatAssets = useMemo(
    () => balances.flatMap((group) => group.assets.filter((asset) => Number(asset.balance) > 0 || asset.native)),
    [balances],
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setUser(data.user))
      .finally(() => setLoadingUser(false));
  }, []);

  useEffect(() => {
    if (user?.walletAddress) {
      void loadBalances();
      void loadTransactions();
      void loadQuotes();
      void loadFiat();
    }
  }, [user?.walletAddress]);

  useEffect(() => {
    if (!selected && flatAssets.length) {
      setSelected(`${flatAssets[0].chainId}:${flatAssets[0].symbol}`);
    }
  }, [flatAssets, selected]);

  useEffect(() => {
    if (!quotes.some((quote) => quote.symbol === sendAsset) && quotes.length) {
      setSendAsset(quotes.find((quote) => quote.symbol === "USDC")?.symbol || quotes[0].symbol);
    }
  }, [quotes, sendAsset]);

  async function api<T>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: { error?: string } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || "The server returned an unexpected response." };
    }
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data as T;
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      const payload =
        authMode === "login"
          ? { email: form.email, password: form.password }
          : {
              ...form,
              walletMode,
              walletAddress: walletMode === "external" ? connectedWallet : undefined,
            };
      const data = await api<{ user: User }>(
        authMode === "login" ? "/api/auth/login" : "/api/auth/register",
        payload,
      );
      setUser(data.user);
      setAuthStatus(authMode === "login" ? "Welcome back." : "Account created.");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectInjectedWallet() {
    setAuthError("");
    setSendError("");
    if (!window.ethereum) {
      const message = "No browser wallet found. Install MetaMask or use the embedded wallet option.";
      if (user) setSendError(message);
      else setAuthError(message);
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    setConnectedWallet(accounts[0]);
  }

  async function linkWallet(address?: string) {
    const walletAddress = address || connectedWallet;
    if (!walletAddress) return;
    setBusy(true);
    setDataError("");
    try {
      const data = await api<{ user: User }>("/api/wallet/link", { walletAddress });
      setUser(data.user);
      setDataStatus("Wallet linked.");
      await loadBalances();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not link wallet");
    } finally {
      setBusy(false);
    }
  }

  async function loadBalances() {
    try {
      const data = await api<{ balances: BalanceGroup[] }>("/api/wallet/balances");
      setBalances(data.balances);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load balances");
    }
  }

  async function loadTransactions() {
    try {
      const data = await api<{ transactions: WalletTransaction[] }>("/api/wallet/transactions");
      setTransactions(data.transactions);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load transactions");
    }
  }

  async function loadQuotes() {
    try {
      const data = await api<{ quotes: CryptoQuote[] }>("/api/quotes");
      setQuotes(data.quotes);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load NZD quotes");
    }
  }

  async function loadFiat() {
    try {
      const data = await api<{ fiat: FiatAccount }>("/api/fiat");
      setFiat(data.fiat);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load NZD account");
    }
  }

  async function updateTestBalance(kind: "top-up" | "withdraw") {
    setDataError("");
    setDataStatus("");
    setBusy(true);
    try {
      const data = await api<{ fiat: FiatAccount }>(
        kind === "top-up" ? "/api/fiat/top-up" : "/api/fiat/withdraw",
        { amountNzd: bankAmount },
      );
      setFiat(data.fiat);
      setDataStatus(kind === "top-up" ? "Test NZD added." : "Test NZD withdrawn.");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not update NZD balance");
    } finally {
      setBusy(false);
    }
  }

  async function exportPrivateKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setPrivateKey("");
    setExportError("");
    setExportStatus("");
    try {
      const data = await api<{ privateKey: string }>("/api/wallet/export-key", {
        password: exportPassword,
      });
      setPrivateKey(data.privateKey);
      setShowPrivateKey(false);
      setExportStatus("Private key unlocked. Keep it secret.");
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not export private key");
    } finally {
      setBusy(false);
    }
  }

  async function sendTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendError("");
    setBusy(true);
    setSendStatus("");
    try {
      const quote = quotes.find((item) => item.symbol === sendAsset);
      if (!quote) throw new Error("Choose a supported crypto asset.");
      if (bankBalanceNzd < Number(amount)) {
        throw new Error("Insufficient NZD balance. Add test money first.");
      }
      const recipientAddress = await resolveRecipient(recipient);
      if (!recipientAddress) {
        throw new Error("Recipient must be a valid wallet address or resolvable ENS name.");
      }
      const data = await api<{ fiat: FiatAccount }>("/api/fiat/withdraw", {
        amountNzd: amount,
      });
      setFiat(data.fiat);
      const cryptoAmount = Number(amount) / quote.nzd;
      setSendStatus(`Demo sent ${formatCrypto(cryptoAmount)} ${quote.symbol} to ${shortAddress(recipientAddress)}.`);
      setAmount("");
      setRecipient("");
      await loadTransactions();
    } catch (err) {
      setSendError(walletErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", {});
    setUser(null);
    setBalances([]);
    setTransactions([]);
    setFiat(null);
    setPrivateKey("");
    setExportPassword("");
    setAuthStatus("");
    setSendStatus("");
    setExportStatus("");
    setDataStatus("");
    setAuthError("");
    setSendError("");
    setExportError("");
    setDataError("");
  }

  async function resolveRecipient(value: string) {
    const trimmed: string = value.trim();
    if (isAddress(trimmed)) return trimmed;
    if (!String(trimmed).toLowerCase().endsWith(".eth")) return null;

    const data = await api<{ address: string }>("/api/ens/resolve", { name: trimmed });
    return data.address;
  }

  const bankBalanceNzd = Number(fiat?.balanceNzd || "0");
  const nzdReference = bankBalanceNzd > 0 ? bankBalanceNzd : 100;
  const stableQuotes = quotes.filter((quote) =>
    ["USDC", "USDT", "DAI", "PYUSD", "FDUSD", "TUSD", "BUSD", "ETH", "SOL", "BTC"].includes(quote.symbol),
  );
  const sendQuote = quotes.find((quote) => quote.symbol === sendAsset);
  const sendPreview = sendQuote && Number(amount) > 0
    ? `${formatCrypto(Number(amount) / sendQuote.nzd)} ${sendQuote.symbol}`
    : "";

  if (loadingUser) {
    return <main className="center-screen"><Loader2 className="spin" /> Loading wallet...</main>;
  }

  if (!user) {
    return (
      <main className="auth-page">
        <section className="brand-panel">
          <div className="brand-mark"><Wallet size={30} /></div>
          <h1>PocketRail</h1>
          <p>A crypto wallet wrapper for people who just want to log in, see balances, and send funds without wrestling with wallet UX.</p>
          <div className="proof-row">
            <span><ShieldCheck size={16} /> SQLite user records</span>
            <span><Check size={16} /> Remembered sessions</span>
          </div>
        </section>

        <section className="auth-panel">
          <div className="segmented">
            <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
            <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Log in</button>
          </div>

          <form onSubmit={submitAuth} className="stack">
            {authMode === "register" && (
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ada Lovelace" required />
              </label>
            )}
            <label>
              Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <div className="password-field">
                <input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" required minLength={authMode === "register" ? 8 : 1} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            {authMode === "register" && (
              <div className="wallet-choice">
                <p>Do you already have a crypto wallet?</p>
                <div className="choice-grid">
                  <button type="button" className={walletMode === "external" ? "choice active" : "choice"} onClick={() => setWalletMode("external")}>
                    <Link2 size={18} /> Yes, link it
                  </button>
                  <button type="button" className={walletMode === "embedded" ? "choice active" : "choice"} onClick={() => setWalletMode("embedded")}>
                    <Wallet size={18} /> No, create one
                  </button>
                </div>
                {walletMode === "external" && (
                  <div className="inline-actions">
                    <button type="button" className="secondary" onClick={connectInjectedWallet}>
                      <Link2 size={17} /> Connect browser wallet
                    </button>
                    <PrivyWalletButton onWallet={setConnectedWallet} />
                  </div>
                )}
                {walletMode === "embedded" && (
                  <div className="generated-note">
                    <Check size={16} /> A new wallet will be generated for this account.
                  </div>
                )}
                {connectedWallet && <code className="address-chip">{shortAddress(connectedWallet)}</code>}
              </div>
            )}

            {authError && <p className="error">{authError}</p>}
            {authStatus && <p className="success">{authStatus}</p>}
            <button className="primary" disabled={busy || (authMode === "register" && walletMode === "external" && !connectedWallet)}>
              {busy ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              {authMode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <span className="eyebrow">PocketRail</span>
          <h1>Welcome, {user.name}</h1>
        </div>
        <button className="icon-button" onClick={logout} aria-label="Log out"><LogOut size={19} /></button>
      </header>

      <section className="money-panel">
        <div className="money-hero">
          <span className="eyebrow">Bank balance</span>
          <h2>{formatNzd(bankBalanceNzd)}</h2>
          <p>Hackathon test balance for top-ups, withdrawals, and conversion estimates.</p>
        </div>
        <div className="money-control">
          <label>
            NZD amount
            <input value={bankAmount} onChange={(event) => setBankAmount(event.target.value)} inputMode="decimal" placeholder="50.00" />
          </label>
          <div className="money-actions">
            <button className="primary" onClick={() => updateTestBalance("top-up")} disabled={busy}>
              <Check size={17} /> Add test money
            </button>
            <button className="secondary strong" onClick={() => updateTestBalance("withdraw")} disabled={busy}>
              <Wallet size={17} /> Withdraw test money
            </button>
          </div>
          {dataError && <p className="error">{dataError}</p>}
          {dataStatus && <p className="success">{dataStatus}</p>}
        </div>
      </section>

      <section className="dashboard-grid bottom-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Send from NZD</h2>
            <Send size={19} />
          </div>
          <form className="stack" onSubmit={sendTransfer}>
            <label>
              Convert to
              <select value={sendAsset} onChange={(e) => setSendAsset(e.target.value)}>
                {stableQuotes.map((quote) => (
                  <option key={quote.id} value={quote.symbol}>
                    {quote.symbol} - {quote.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Recipient wallet
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x... or name.eth" required />
            </label>
            <label>
              NZD amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="25.00" required />
            </label>
            {sendPreview && <p className="preview-line">Estimated send: <strong>{sendPreview}</strong></p>}
            {sendError && <p className="error">{sendError}</p>}
            {sendStatus && <p className="success">{sendStatus}</p>}
            <button className="primary" disabled={busy || !sendQuote}>
              {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              Convert and send
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Wallet backing</h2>
            <button className="icon-button" onClick={loadBalances} aria-label="Refresh balances"><RefreshCcw size={17} /></button>
          </div>
          <div className="asset-list">
            {flatAssets.map((asset) => (
              <button key={`${asset.chainId}-${asset.symbol}`} className={selected === `${asset.chainId}:${asset.symbol}` ? "asset active" : "asset"} onClick={() => setSelected(`${asset.chainId}:${asset.symbol}`)}>
                <span className="asset-icon">{asset.symbol.slice(0, 1)}</span>
                <span>
                  <strong>{asset.symbol}</strong>
                  <small>{asset.chainName}</small>
                </span>
                <span className="asset-balance">{shortAmount(asset.balance)}</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="panel wide">
        <h2>Account details</h2>
        <div className="detail-grid">
          <span>Email</span><strong>{user.email}</strong>
          <span>Wallet type</span><strong>{user.walletKind}</strong>
          <span>ENS</span><strong>{user.ensName || "None found"}</strong>
          <span>Address</span><strong className="break">{user.walletAddress}</strong>
        </div>
        <div className="inline-actions">
          <button className="secondary" onClick={connectInjectedWallet}><Link2 size={17} /> Connect another wallet</button>
          <button className="secondary" onClick={() => linkWallet()} disabled={!connectedWallet || busy}><Check size={17} /> Save linked wallet</button>
          <PrivyWalletButton onWallet={(address) => { setConnectedWallet(address); void linkWallet(address); }} />
        </div>
      </section>

      <section className="panel wide">
        <div className="panel-head">
          <h2>NZD estimates</h2>
          <button className="icon-button" onClick={loadQuotes} aria-label="Refresh NZD quotes">
            <RefreshCcw size={17} />
          </button>
        </div>
        <div className="quote-grid">
          {quotes.map((quote) => (
            <div className="quote-row" key={quote.id}>
              <span>
                <strong>{quote.symbol}</strong>
                <small>{quote.name}</small>
              </span>
              <span>
                <strong>{formatCrypto(nzdReference / quote.nzd)} {quote.symbol}</strong>
                <small>{formatNzd(quote.nzd)} each</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-grid bottom-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Export key</h2>
            <KeyRound size={19} />
          </div>
          <form className="stack" onSubmit={exportPrivateKey}>
            <p className="muted-copy">
              Export is only available for wallets generated by this app.
            </p>
            <label>
              Confirm password
              <div className="password-field">
                <input
                  type="password"
                  value={exportPassword}
                  onChange={(event) => setExportPassword(event.target.value)}
                  placeholder="Account password"
                  required
                />
                <Lock size={17} className="field-icon" />
              </div>
            </label>
            <button className="secondary strong" disabled={busy || !user.hasServerWallet}>
              <KeyRound size={17} /> Unlock private key
            </button>
            {exportError && <p className="error">{exportError}</p>}
            {exportStatus && <p className="success">{exportStatus}</p>}
            {privateKey && (
              <div className="key-box">
                <div className="panel-head compact">
                  <strong>Private key</strong>
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => setShowPrivateKey((value) => !value)}
                    aria-label="Toggle private key visibility"
                  >
                    {showPrivateKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <code>{showPrivateKey ? privateKey : `${privateKey.slice(0, 10)}${"*".repeat(34)}${privateKey.slice(-6)}`}</code>
                <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(privateKey)}>
                  <Copy size={17} /> Copy key
                </button>
              </div>
            )}
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Transactions</h2>
            <button className="icon-button" onClick={loadTransactions} aria-label="Refresh transactions">
              <History size={17} />
            </button>
          </div>
          <div className="tx-list">
            {transactions.length === 0 && (
              <p className="muted-copy">No incoming or outgoing transactions found yet.</p>
            )}
            {transactions.map((tx) => (
              <a className="tx-row" href={tx.explorerUrl || "#"} target="_blank" rel="noreferrer" key={`${tx.chainId}-${tx.hash}`}>
                <span className={`direction ${tx.direction}`}>{tx.direction}</span>
                <span>
                  <strong>{shortAmount(tx.amount)} {tx.symbol}</strong>
                  <small>{tx.chainName} · {tx.method || "transfer"} · {tx.status}</small>
                </span>
                <span className="tx-meta">
                  <small>{timeAgo(tx.timestamp)}</small>
                  <ExternalLink size={15} />
                </span>
              </a>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function shortAddress(address: string) {
  if (!address) return "No wallet";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortAmount(value: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  if (number === 0) return "0";
  if (number < 0.0001) return "<0.0001";
  return number.toLocaleString(undefined, { maximumFractionDigits: 5 });
}

function timeAgo(timestamp: string) {
  const then = new Date(timestamp).getTime();
  if (!Number.isFinite(then)) return "recently";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNzd(value: number) {
  return value.toLocaleString("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 2,
  });
}

function formatCrypto(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value > 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value > 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function walletErrorMessage(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  const message = raw.toLowerCase();

  if (message.includes("insufficient funds")) {
    return "Insufficient funds for this transfer. On Sepolia you need enough Sepolia ETH for the amount plus gas, so try sending a little less or fund the selected wallet.";
  }
  if (message.includes("user rejected") || message.includes("rejected")) {
    return "Transfer cancelled in your wallet.";
  }
  if (message.includes("wallet_switchethereumchain")) {
    return "Could not switch your wallet network. Switch to Sepolia in your wallet and try again.";
  }
  return raw || "Transfer failed";
}
