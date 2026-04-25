"use client";

import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, ethers, formatUnits, isAddress, parseUnits } from "ethers";
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
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

const erc20Abi = ["function transfer(address to, uint256 amount) returns (bool)"];

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
  const [selected, setSelected] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const flatAssets = useMemo(
    () => balances.flatMap((group) => group.assets.filter((asset) => Number(asset.balance) > 0 || asset.native)),
    [balances],
  );

  const selectedAsset = flatAssets.find(
    (asset) => `${asset.chainId}:${asset.symbol}` === selected,
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setUser(data.user))
      .finally(() => setLoadingUser(false));
  }, []);

  useEffect(() => {
    if (user?.walletAddress) void loadBalances();
  }, [user?.walletAddress]);

  useEffect(() => {
    if (!selected && flatAssets.length) {
      setSelected(`${flatAssets[0].chainId}:${flatAssets[0].symbol}`);
    }
  }, [flatAssets, selected]);

  async function api<T>(url: string, body?: unknown): Promise<T> {
    setError("");
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    return data as T;
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
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
      setStatus(authMode === "login" ? "Welcome back." : "Account created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectInjectedWallet() {
    setError("");
    if (!window.ethereum) {
      setError("No browser wallet found. Install MetaMask or use the embedded wallet option.");
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
    try {
      const data = await api<{ user: User }>("/api/wallet/link", { walletAddress });
      setUser(data.user);
      setStatus("Wallet linked.");
      await loadBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link wallet");
    } finally {
      setBusy(false);
    }
  }

  async function loadBalances() {
    try {
      const data = await api<{ balances: BalanceGroup[] }>("/api/wallet/balances");
      setBalances(data.balances);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load balances");
    }
  }

  async function sendTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset) return;
    if (!isAddress(recipient)) {
      setError("Recipient address is invalid.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      if (user?.walletKind === "external") {
        if (!window.ethereum) throw new Error("Open your browser wallet to sign this transfer.");
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const current = await signer.getAddress();
        if (current.toLowerCase() !== user.walletAddress?.toLowerCase()) {
          throw new Error("Your connected browser wallet does not match this account.");
        }

        let txHash = "";
        if (selectedAsset.native) {
          const tx = await signer.sendTransaction({
            to: recipient,
            value: parseUnits(amount, selectedAsset.decimals),
          });
          txHash = tx.hash;
        } else {
          const tokenAddress = tokenAddressFor(selectedAsset.chainId, selectedAsset.symbol);
          const token = new Contract(tokenAddress, erc20Abi, signer);
          const tx = await token.transfer(recipient, parseUnits(amount, selectedAsset.decimals));
          txHash = tx.hash;
        }
        await api("/api/wallet/send", {
          chainId: selectedAsset.chainId,
          symbol: selectedAsset.symbol,
          recipient,
          amount,
          clientTxHash: txHash,
        });
        setStatus(`Transfer submitted: ${txHash}`);
      } else {
        const data = await api<{ txHash: string }>("/api/wallet/send", {
          chainId: selectedAsset.chainId,
          symbol: selectedAsset.symbol,
          recipient,
          amount,
        });
        setStatus(`Transfer submitted: ${data.txHash}`);
      }
      setAmount("");
      setRecipient("");
      await loadBalances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", {});
    setUser(null);
    setBalances([]);
    setStatus("");
  }

  const totalDisplay = flatAssets
    .filter((asset) => Number(asset.balance) > 0)
    .map((asset) => `${shortAmount(asset.balance)} ${asset.symbol}`)
    .slice(0, 3)
    .join(" + ");
  const walletLabel = user?.ensName || shortAddress(user?.walletAddress || "");

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

            {error && <p className="error">{error}</p>}
            {status && <p className="success">{status}</p>}
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

      <section className="summary-band">
        <div>
          <span className="eyebrow">Wallet</span>
          <h2>{totalDisplay || "No funded assets found yet"}</h2>
          <button className="copy-line" onClick={() => navigator.clipboard.writeText(user.walletAddress || "")}>
            {walletLabel} <Copy size={15} />
          </button>
        </div>
        <div className="wallet-pill">{user.walletKind === "embedded" ? "Embedded wallet" : "Linked wallet"}</div>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Assets</h2>
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

        <section className="panel">
          <div className="panel-head">
            <h2>Send</h2>
            <Send size={19} />
          </div>
          <form className="stack" onSubmit={sendTransfer}>
            <label>
              Asset
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {flatAssets.map((asset) => (
                  <option key={`${asset.chainId}:${asset.symbol}`} value={`${asset.chainId}:${asset.symbol}`}>
                    {asset.symbol} on {asset.chainName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Recipient wallet
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." required />
            </label>
            <label>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.01" required />
            </label>
            {user.walletKind === "external" && (
              <button type="button" className="secondary" onClick={connectInjectedWallet}>
                <Link2 size={17} /> Connect signer wallet
              </button>
            )}
            {error && <p className="error">{error}</p>}
            {status && <p className="success">{status}</p>}
            <button className="primary" disabled={busy || !selectedAsset}>
              {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              Send funds
            </button>
          </form>
        </section>
      </div>

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

function tokenAddressFor(chainId: number, symbol: string) {
  const known: Record<string, string> = {
    "1:USDC": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "1:USDT": "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "11155111:USDC": "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  };
  const address = known[`${chainId}:${symbol}`];
  if (!address) throw new Error("Unsupported browser token transfer.");
  return address;
}
