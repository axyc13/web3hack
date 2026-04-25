"use client";

import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  History,
  KeyRound,
  Lock,
  Loader2,
  LogOut,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";

type User = {
  id: number;
  name: string;
  username: string;
  email: string;
  walletAddress: string | null;
  linkedWalletAddress: string | null;
  walletKind: "external" | "embedded" | null;
  ensName: string | null;
  hasServerWallet: boolean;
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
  source: "explorer" | "local" | "app";
};

type FiatAccount = {
  balanceCents: number;
  balanceUsd: string;
  events: Array<{
    id: number;
    kind: "top_up" | "withdrawal";
    amountUsd: string;
    status: string;
    provider: string;
    note: string | null;
    createdAt: string;
  }>;
};

type DisplayCurrency = "NZD" | "USD" | "AUD" | "EUR" | "GBP";

const displayCurrencies: Array<{ code: DisplayCurrency; label: string; usdRate: number; locale: string }> = [
  { code: "NZD", label: "New Zealand dollar", usdRate: 1.68, locale: "en-NZ" },
  { code: "USD", label: "US dollar", usdRate: 1, locale: "en-US" },
  { code: "AUD", label: "Australian dollar", usdRate: 1.54, locale: "en-AU" },
  { code: "EUR", label: "Euro", usdRate: 0.92, locale: "de-DE" },
  { code: "GBP", label: "British pound", usdRate: 0.79, locale: "en-GB" },
];

type PreparedTransfer = {
  chainId: number;
  token: {
    symbol: string;
    address: string;
    decimals: number;
  };
  ethProofWei: string;
  senderWalletAddress: string;
  recipientWalletAddress: string;
  recipient: {
    id: number;
    name: string;
    username: string;
  };
};

const erc20TransferAbi = ["function transfer(address to, uint256 amount) returns (bool)"];
const erc20BalanceAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [fiat, setFiat] = useState<FiatAccount | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [bankAmount, setBankAmount] = useState("50");
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("NZD");
  const [exportPassword, setExportPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [authStatus, setAuthStatus] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [sendLink, setSendLink] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [dataStatus, setDataStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [sendError, setSendError] = useState("");
  const [exportError, setExportError] = useState("");
  const [dataError, setDataError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    walletMode: "embedded" as "embedded" | "external",
    walletAddress: "",
  });
  const [usernameState, setUsernameState] = useState<{
    checking: boolean;
    available: boolean;
    message: string;
  }>({ checking: false, available: false, message: "" });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setUser(data.user))
      .finally(() => setLoadingUser(false));
  }, []);

  useEffect(() => {
    if (user?.walletAddress) {
      void loadTransactions();
      void loadFiat();
    }
  }, [user?.walletAddress]);

  useEffect(() => {
    if (authMode !== "register") return;
    const username = form.username.trim();
    if (!username) {
      setUsernameState({ checking: false, available: false, message: "" });
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      setUsernameState({
        checking: false,
        available: false,
        message: "Use 3-24 letters, numbers, or underscores.",
      });
      return;
    }

    let cancelled = false;
    setUsernameState({ checking: true, available: false, message: "Checking username..." });
    const timeout = window.setTimeout(async () => {
      try {
        const data = await api<{ available: boolean; error: string | null }>("/api/auth/check-username", {
          username,
        });
        if (cancelled) return;
        setUsernameState({
          checking: false,
          available: data.available,
          message: data.available ? "Username is available." : data.error || "Username is not available.",
        });
      } catch (err) {
        if (cancelled) return;
        setUsernameState({
          checking: false,
          available: false,
          message: err instanceof Error ? err.message : "Could not check username.",
        });
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [authMode, form.username]);

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
      if (authMode === "register" && !usernameState.available) {
        throw new Error(usernameState.message || "Choose a unique username first.");
      }
      const payload =
        authMode === "login"
          ? { email: form.email, password: form.password }
          : {
              ...form,
              walletAddress: form.walletMode === "external" ? form.walletAddress : undefined,
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

  async function connectRegistrationWallet() {
    setAuthError("");
    try {
      if (!window.ethereum?.request) {
        throw new Error("No browser wallet found. Paste your wallet address instead.");
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.[0]) {
        throw new Error("No wallet account selected.");
      }
      setForm((current) => ({ ...current, walletMode: "external", walletAddress: accounts[0] }));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Could not connect wallet");
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

  async function loadFiat() {
    try {
      const data = await api<{ fiat: FiatAccount }>("/api/fiat");
      setFiat(data.fiat);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load account");
    }
  }

  async function updateTestBalance(kind: "top-up" | "withdraw") {
    setDataError("");
    setDataStatus("");
    setBusy(true);
    try {
      const data = await api<{ fiat: FiatAccount }>(
        kind === "top-up" ? "/api/fiat/top-up" : "/api/fiat/withdraw",
        { amountUsd: displayToUsd(bankAmount, displayCurrency) },
      );
      setFiat(data.fiat);
      setDataStatus(
        kind === "top-up"
          ? `Added ${formatCurrency(Number(bankAmount), displayCurrency)} test value to the app ledger.`
          : `Withdrew ${formatCurrency(Number(bankAmount), displayCurrency)} test value from the app ledger.`,
      );
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not update balance");
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
    setSendLink("");
    try {
      const amountUsd = displayToUsd(amount, displayCurrency);
      if (bankBalanceUsd < Number(amountUsd)) {
        throw new Error("Insufficient balance. Add money first.");
      }
      const data =
        user?.walletKind === "external" && user.linkedWalletAddress
          ? await sendFromLinkedWallet()
          : await api<{ fiat: FiatAccount; txHash: string; recipient: { name: string; username: string } }>("/api/app/send", {
              recipient,
              amountUsd,
            });
      setFiat(data.fiat);
      setSendStatus(`Sent ${formatCurrency(Number(amount), displayCurrency)} to @${data.recipient.username}.`);
      setSendLink(`https://sepolia.etherscan.io/tx/${data.txHash}`);
      setAmount("");
      setRecipient("");
      await loadTransactions();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send money");
    } finally {
      setBusy(false);
    }
  }

  async function sendFromLinkedWallet() {
    if (!user?.linkedWalletAddress) {
      throw new Error("Connect the wallet linked to this account first.");
    }
    if (!window.ethereum?.request) {
      throw new Error("No browser wallet found. Open this app in a wallet browser or install MetaMask.");
    }

    const prepared = await api<PreparedTransfer>("/api/app/prepare-send", {
      recipient,
      amountUsd: displayToUsd(amount, displayCurrency),
    });

    await switchToSepolia();
    const provider = new BrowserProvider(window.ethereum);
    const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
    const selected = accounts[0];
    if (!selected || selected.toLowerCase() !== user.linkedWalletAddress.toLowerCase()) {
      throw new Error(`Switch your browser wallet to the linked wallet ${shortAddress(user.linkedWalletAddress)}.`);
    }

    const signer = await provider.getSigner();
    const usdc = new Contract(prepared.token.address, erc20BalanceAbi, signer);
    const amountRaw = parseUnits(displayToUsd(amount, displayCurrency), prepared.token.decimals);
    const usdcBalance = (await usdc.balanceOf(selected)) as bigint;
    const proofAsset = usdcBalance >= amountRaw ? "USDC" : "ETH";
    if (proofAsset === "ETH") {
      setSendStatus(
        `Linked wallet has ${formatUnits(usdcBalance, prepared.token.decimals)} test USDC, so using a tiny Sepolia ETH proof transaction for the demo.`,
      );
    }
    const tx = proofAsset === "USDC"
      ? await usdc.transfer(prepared.recipientWalletAddress, amountRaw)
      : await signer.sendTransaction({
          to: prepared.recipientWalletAddress,
          value: BigInt(prepared.ethProofWei),
        });
    const receipt = await tx.wait();
    if (!receipt?.hash) {
      throw new Error("The wallet transaction did not return a Sepolia hash.");
    }

    return api<{ fiat: FiatAccount; txHash: string; recipient: { name: string; username: string } }>("/api/app/record-send", {
      recipient,
      amountUsd: displayToUsd(amount, displayCurrency),
      txHash: receipt.hash,
      proofAsset,
    });
  }

  async function switchToSepolia() {
    const chainId = "0xaa36a7";
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId }],
      });
    } catch (error: any) {
      if (error?.code !== 4902) throw error;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://ethereum-sepolia.publicnode.com"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    }
  }

  async function logout() {
    await api("/api/auth/logout", {});
    setUser(null);
    setTransactions([]);
    setFiat(null);
    setPrivateKey("");
    setExportPassword("");
    setAuthStatus("");
    setSendStatus("");
    setSendLink("");
    setExportStatus("");
    setDataStatus("");
    setAuthError("");
    setSendError("");
    setExportError("");
    setDataError("");
  }

  const bankBalanceUsd = Number(fiat?.balanceUsd || "0");
  const selectedCurrency = currencyConfig(displayCurrency);
  const displayedBalance = bankBalanceUsd * selectedCurrency.usdRate;

  if (loadingUser) {
    return <main className="center-screen"><Loader2 className="spin" /> Loading wallet...</main>;
  }

  if (!user) {
    return (
      <main className="auth-page">
        <section className="brand-panel">
          <div className="brand-mark"><Wallet size={30} /></div>
          <h1>PocketRail</h1>
          <p>A bank-style crypto account that lets people hold USD value and send money to other PocketRail users without seeing wallet complexity.</p>
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
            {authMode === "register" && (
              <label>
                Username
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="ada" required minLength={3} />
                {usernameState.message && (
                  <span className={usernameState.available ? "field-hint success-text" : "field-hint error-text"}>
                    {usernameState.message}
                  </span>
                )}
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
              <fieldset className="wallet-choice">
                <legend>Wallet setup</legend>
                <div className="choice-grid">
                  <label className={form.walletMode === "embedded" ? "choice active" : "choice"}>
                    <input
                      type="radio"
                      name="walletMode"
                      value="embedded"
                      checked={form.walletMode === "embedded"}
                      onChange={() => setForm({ ...form, walletMode: "embedded", walletAddress: "" })}
                    />
                    <span>
                      <strong>Create one for me</strong>
                      <small>PocketRail creates a hidden wallet for USDC transfers.</small>
                    </span>
                  </label>
                  <label className={form.walletMode === "external" ? "choice active" : "choice"}>
                    <input
                      type="radio"
                      name="walletMode"
                      value="external"
                      checked={form.walletMode === "external"}
                      onChange={() => setForm({ ...form, walletMode: "external" })}
                    />
                    <span>
                      <strong>I have my own wallet</strong>
                      <small>Link it to your account; PocketRail still creates the transfer wallet.</small>
                    </span>
                  </label>
                </div>
                {form.walletMode === "external" && (
                  <div className="stack compact-stack">
                    <button type="button" className="secondary strong" onClick={connectRegistrationWallet}>
                      <Wallet size={17} /> Connect wallet
                    </button>
                    <label>
                      Wallet address
                      <input
                        value={form.walletAddress}
                        onChange={(event) => setForm({ ...form, walletAddress: event.target.value })}
                        placeholder="0x..."
                        required={form.walletMode === "external"}
                      />
                    </label>
                  </div>
                )}
              </fieldset>
            )}

            {authError && <p className="error">{authError}</p>}
            {authStatus && <p className="success">{authStatus}</p>}
            <button className="primary" disabled={busy || (authMode === "register" && !usernameState.available)}>
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
          <h2>{formatCurrency(displayedBalance, displayCurrency)}</h2>
          <p>Your app balance is stored as test USD/USDC and shown in your selected currency.</p>
        </div>
        <div className="money-control">
          <label>
            Display currency
            <select value={displayCurrency} onChange={(event) => setDisplayCurrency(event.target.value as DisplayCurrency)}>
              {displayCurrencies.map((currency) => (
                <option value={currency.code} key={currency.code}>
                  {currency.code} - {currency.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {displayCurrency} amount
            <input value={bankAmount} onChange={(event) => setBankAmount(event.target.value)} inputMode="decimal" placeholder="50.00" />
          </label>
          <p className="muted-copy compact-copy">
            Add test money updates the PocketRail demo ledger only. It does not mint USDC or send funds to a blockchain wallet.
          </p>
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
            <h2>Send money</h2>
            <Send size={19} />
          </div>
          <form className="stack" onSubmit={sendTransfer}>
            <label>
              Recipient
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="@username or wallet address" required />
            </label>
            <label>
              {displayCurrency} amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="25.00" required />
            </label>
            {sendError && <p className="error">{sendError}</p>}
            {sendStatus && <p className="success">{sendStatus}</p>}
            {sendLink && (
              <a className="inline-link" href={sendLink} target="_blank" rel="noreferrer">
                View Sepolia transaction <ExternalLink size={14} />
              </a>
            )}
            <button className="primary" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              Send money
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Profile</h2>
          </div>
          <div className="profile-box">
            <strong>@{user.username}</strong>
            <span>{user.name}</span>
            <small>{user.email}</small>
            {user.linkedWalletAddress && (
              <small>Linked wallet {shortAddress(user.linkedWalletAddress)}</small>
            )}
          </div>
        </section>
      </section>

      <section className="dashboard-grid bottom-grid">
        {user.hasServerWallet && (
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
              <button className="secondary strong" disabled={busy}>
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
        )}

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

function formatUsd(value: number) {
  return formatCurrency(value, "USD");
}

function formatCurrency(value: number, currency: DisplayCurrency) {
  const config = currencyConfig(currency);
  return value.toLocaleString(config.locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

function displayToUsd(value: string, currency: DisplayCurrency) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return value;
  return (parsed / currencyConfig(currency).usdRate).toFixed(2);
}

function currencyConfig(currency: DisplayCurrency) {
  return displayCurrencies.find((item) => item.code === currency) || displayCurrencies[0];
}
