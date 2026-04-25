"use client";

import { BrowserProvider, Contract, parseUnits } from "ethers";
import { useEffect, useState } from "react";
import { REGION_OPTIONS } from "@/lib/currency";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ExternalLink,
  History,
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
  walletKind: "external" | null;
  ensName: string | null;
  regionCode: string;
  preferredCurrency: string;
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

type WalletAsset = {
  symbol: string;
  name: string;
  chainId: number;
  chainName: string;
  decimals: number;
  balance: string;
  rawBalance: string;
  native: boolean;
};

type WalletBalanceGroup = {
  chain: {
    id: number;
    name: string;
  };
  assets: WalletAsset[];
};

type PreparedTransfer = {
  chainId: number;
  token: {
    symbol: string;
    address: string;
    decimals: number;
  };
  senderWalletAddress: string;
  recipientWalletAddress: string;
  recipient: {
    id: number;
    name: string;
    username: string;
  };
};

type FxState = {
  rate: number;
  preferredCurrency: string;
};

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_CHAIN_HEX = "0x14a34";
const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org/tx/";
const erc20BalanceAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [balanceGroups, setBalanceGroups] = useState<WalletBalanceGroup[]>([]);
  const [fx, setFx] = useState<FxState>({ rate: 1, preferredCurrency: "NZD" });
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [sendLink, setSendLink] = useState("");
  const [dataError, setDataError] = useState("");
  const [authError, setAuthError] = useState("");
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    walletAddress: "",
    regionCode: "NZ",
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");
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
    if (!user?.walletAddress) return;
    void loadTransactions();
    void loadBalances();
  }, [user?.walletAddress]);

  useEffect(() => {
    if (!user) return;
    void loadFx(user.regionCode);
  }, [user?.regionCode]);

  useEffect(() => {
    if (!user?.walletAddress) return;

    const refresh = () => {
      void loadTransactions();
      void loadBalances();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }, 10000);
    const onFocus = () => refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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
      const payload = authMode === "login"
        ? { email: form.email, password: form.password }
        : form;
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
      setForm((current) => ({ ...current, walletAddress: accounts[0] }));
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

  async function loadBalances() {
    try {
      const data = await api<{ balances: WalletBalanceGroup[] }>("/api/wallet/balances");
      setBalanceGroups(data.balances);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load wallet balances");
    }
  }

  async function loadFx(regionCode: string) {
    try {
      const data = await api<{ rate: number; preferredCurrency: string }>(`/api/fx?regionCode=${encodeURIComponent(regionCode)}`);
      setFx({
        rate: data.rate || 1,
        preferredCurrency: data.preferredCurrency || "NZD",
      });
    } catch {
      setFx({ rate: 1, preferredCurrency: "NZD" });
    }
  }

  async function updateRegion(regionCode: string) {
    setProfileBusy(true);
    setProfileError("");
    setProfileStatus("");
    try {
      const data = await api<{ user: User }>("/api/profile", { regionCode });
      setUser(data.user);
      setProfileStatus("Display region updated.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setProfileBusy(false);
    }
  }

  async function sendTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendError("");
    setBusy(true);
    setSendStatus("");
    setSendLink("");
    try {
      const amountValue = Number(amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error("Enter a dNZD amount greater than 0.");
      }
      if (bankBalanceNzd < amountValue) {
        throw new Error("Insufficient dNZD balance.");
      }

      const data = await sendFromLinkedWallet();

      setSendStatus(`Sent ${formatCurrency(amountValue, "NZD", "NZ")} to @${data.recipient.username}.`);
      setSendLink(`${BASE_SEPOLIA_EXPLORER}${data.txHash}`);
      setAmount("");
      setRecipient("");
      await Promise.all([loadTransactions(), loadBalances()]);
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
      amountNzd: amount,
    });

    await switchToBaseSepolia();
    const provider = new BrowserProvider(window.ethereum);
    const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
    const selected = accounts[0];
    if (!selected || selected.toLowerCase() !== user.linkedWalletAddress.toLowerCase()) {
      throw new Error(`Switch your browser wallet to the linked wallet ${shortAddress(user.linkedWalletAddress)}.`);
    }

    const signer = await provider.getSigner();
    const token = new Contract(prepared.token.address, erc20BalanceAbi, signer);
    const amountRaw = parseUnits(amount, prepared.token.decimals);
    const tokenBalance = (await token.balanceOf(selected)) as bigint;
    if (tokenBalance < amountRaw) {
      throw new Error("Linked wallet does not have enough dNZD for this payment.");
    }

    const tx = await token.transfer(prepared.recipientWalletAddress, amountRaw);
    const receipt = await tx.wait();
    if (!receipt?.hash) {
      throw new Error("The wallet transaction did not return a Base Sepolia hash.");
    }

    return api<{ txHash: string; recipient: { name: string; username: string } }>("/api/app/record-send", {
      recipient,
      amountNzd: amount,
      txHash: receipt.hash,
      chainId: prepared.chainId,
    });
  }

  async function switchToBaseSepolia() {
    try {
      await window.ethereum?.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA_CHAIN_HEX }],
      });
    } catch (error: unknown) {
      const walletError = error as { code?: number };
      if (walletError?.code !== 4902) throw error;
      await window.ethereum?.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: BASE_SEPOLIA_CHAIN_HEX,
            chainName: "Base Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [BASE_SEPOLIA_RPC_URL],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          },
        ],
      });
    }
  }

  async function logout() {
    await api("/api/auth/logout", {});
    setUser(null);
    setTransactions([]);
    setBalanceGroups([]);
    setAuthStatus("");
    setSendStatus("");
    setSendLink("");
    setAuthError("");
    setSendError("");
    setDataError("");
  }

  const baseSepoliaAssets = balanceGroups.find((group) => group.chain.id === BASE_SEPOLIA_CHAIN_ID)?.assets || [];
  const dnzdAsset = baseSepoliaAssets.find((asset) => asset.symbol === "dNZD");
  const gasAsset = baseSepoliaAssets.find((asset) => asset.symbol === "ETH" && asset.native);
  const bankBalanceNzd = Number(dnzdAsset?.balance || "0");
  const gasBalanceEth = gasAsset?.balance || "0";
  const userRegionCode = user?.regionCode || "NZ";
  const displayCurrency = user?.preferredCurrency || fx.preferredCurrency;
  const displayRegion = REGION_OPTIONS.find((option) => option.code === userRegionCode) || REGION_OPTIONS[0];
  const bankBalanceDisplay = bankBalanceNzd * (fx.rate || 1);
  const sendAmountValue = Number(amount);
  const convertedSendAmount = Number.isFinite(sendAmountValue) ? sendAmountValue * (fx.rate || 1) : 0;

  if (loadingUser) {
    return <main className="center-screen"><Loader2 className="spin" /> Loading wallet...</main>;
  }

  if (!user) {
    return (
      <main className="auth-page">
        <section className="brand-panel">
          <div className="brand-mark"><Wallet size={30} /></div>
          <h1>PocketRail</h1>
          <p>A wallet-connected dNZD account on Base Sepolia for paying other PocketRail users from your linked wallet.</p>
          <div className="proof-row">
            <span><ShieldCheck size={16} /> SQLite user records</span>
            <span><ShieldCheck size={16} /> Base Sepolia dNZD payments</span>
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
              <label>
                Region
                <select
                  value={form.regionCode}
                  onChange={(event) => setForm({ ...form, regionCode: event.target.value })}
                >
                  {REGION_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label} ({option.currency})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {authMode === "register" && (
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
                    required
                  />
                </label>
              </div>
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
          <h2>{formatCurrency(bankBalanceDisplay, displayCurrency, user.regionCode)}</h2>
          <p>Your live dNZD balance shown in {displayRegion.label} currency.</p>
        </div>
        <div className="money-control">
          <div className="profile-box">
            <strong>Base Sepolia wallet</strong>
            <small>dNZD available: {shortAmount(dnzdAsset?.balance || "0")} dNZD</small>
            <small>ETH for gas: {shortAmount(gasBalanceEth)} ETH</small>
            <small>Display region: {displayRegion.label} ({displayCurrency})</small>
            <small>Linked wallet {shortAddress(user.linkedWalletAddress || user.walletAddress || "")}</small>
          </div>
          <p className="muted-copy compact-copy">
            Transfers still settle in dNZD. We only convert the on-screen display into the user&apos;s selected region currency.
          </p>
          {dataError && <p className="error">{dataError}</p>}
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
              dNZD amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="25.00" required />
            </label>
            <p className="muted-copy compact-copy">
              {Number.isFinite(sendAmountValue) && sendAmountValue > 0
                ? `Shown to you as ${formatCurrency(convertedSendAmount, displayCurrency, user.regionCode)} in ${displayRegion.label}.`
                : `Transfers settle in dNZD, while your dashboard displays ${displayCurrency}.`}
            </p>
            {sendError && <p className="error">{sendError}</p>}
            {sendStatus && <p className="success">{sendStatus}</p>}
            {sendLink && (
              <a className="inline-link" href={sendLink} target="_blank" rel="noreferrer">
                View Base Sepolia transaction <ExternalLink size={14} />
              </a>
            )}
            <button className="primary" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              Send dNZD
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
            <label>
              Region
              <select
                value={user.regionCode}
                onChange={(event) => void updateRegion(event.target.value)}
                disabled={profileBusy}
              >
                {REGION_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label} ({option.currency})
                  </option>
                ))}
              </select>
            </label>
            <small>Display currency: {displayCurrency}</small>
            <small>Linked wallet {shortAddress(user.linkedWalletAddress || user.walletAddress || "")}</small>
            {profileError && <p className="error">{profileError}</p>}
            {profileStatus && <p className="success">{profileStatus}</p>}
          </div>
        </section>
      </section>

      <section className="dashboard-grid bottom-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Transactions</h2>
            <button className="icon-button" onClick={() => { void loadTransactions(); void loadBalances(); }} aria-label="Refresh transactions">
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

function formatCurrency(value: number, currency: string, regionCode: string) {
  const locale = REGION_OPTIONS.find((option) => option.code === regionCode)?.locale || "en-NZ";
  return value.toLocaleString(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}
