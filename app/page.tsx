"use client";

import { usePrivy, useSendTransaction, type ConnectedWallet } from "@privy-io/react-auth";
import { BrowserProvider, Contract, Interface, JsonRpcProvider, parseUnits } from "ethers";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { PrivyWalletButton, PrivyWalletStateSync } from "@/components/PrivyWalletButton";
import { chainById } from "@/lib/chains";
import { REGION_OPTIONS } from "@/lib/currency";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Eye,
  EyeOff,
  ExternalLink,
  History,
  Loader2,
  MessageCircle,
  LogOut,
  Pencil,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";

type User = {
  id: number;
  name: string;
  username: string;
  email: string;
  walletAddress: string | null;
  ensName: string | null;
  regionCode: string;
  preferredCurrency: string;
  privyUserId?: string | null;
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

type RecipientPreview = {
  id: number;
  name: string;
  username: string;
  walletAddress: string | null;
};

type FxState = {
  rate: number;
  preferredCurrency: string;
};

type FiatAccountState = {
  balanceCents: number;
  balanceUsd: string;
  usdBalanceCents: number;
  usdBalance: string;
  nzdBalanceCents: number;
  nzdBalance: string;
  events: Array<{
    id: number;
    kind: "top_up" | "withdrawal";
    currency: "USD" | "NZD";
    amountCents: number;
    amountUsd: string;
    amountNzd: string;
    status: string;
    provider: string;
    note: string | null;
    createdAt: string;
  }>;
};

type RecipientScope = "saved_only" | "any_registered";

type AutomationSettings = {
  aiEnabled: boolean;
  autopayEnabled: boolean;
  maxSingleAmountNzd: string;
  dailyLimitAmountNzd: string;
  autoApproveAmountNzd: string;
  recipientScope: RecipientScope;
  allowedChannels: string[];
  dailyUsedAmountNzd: string;
  dailyRemainingAmountNzd: string;
};

type SavedRecipient = {
  id: number;
  recipientUserId: number;
  name: string;
  username: string;
  walletAddress: string | null;
  nickname: string | null;
  createdAt: string;
};

type AutomationOverview = {
  settings: AutomationSettings;
  recipients: SavedRecipient[];
  agentBrief: string;
};

type BalanceTimelinePoint = {
  id: string;
  label: string;
  detail: string;
  balance: number;
};

type ProfileFormState = {
  name: string;
  username: string;
  email: string;
  regionCode: string;
};

type TransferConfirmation = {
  source: "manual" | "ai";
  amountNzd: string;
  amountValue: number;
  fromWalletAddress: string;
  recipientInput: string;
  prepared: PreparedTransfer;
};

type AiTransferProposal = {
  recipientInput: string;
  amountNzd: string;
  fromWalletAddress: string;
  prepared: PreparedTransfer;
};

type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  transferProposal?: AiTransferProposal | null;
};

type NewMoneyTopUpResult = {
  userName: string;
  walletAddress: string;
  amount: number;
  remainingBalance: number | null;
  message: string;
  chain: string;
  bankReference: string;
};

type DashboardView = "overview" | "pay" | "topup" | "activity" | "profile";

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org/tx/";
const erc20BalanceAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];
const erc20Interface = new Interface(erc20BalanceAbi);
const DASHBOARD_VIEWS: { id: DashboardView; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Balance and shortcuts" },
  { id: "pay", label: "Pay", hint: "Send dNZD" },
  { id: "topup", label: "Top Up", hint: "Add funds to your account" },
  { id: "activity", label: "Transaction History", hint: "Transactions and settlement" },
];
const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  aiEnabled: false,
  autopayEnabled: false,
  maxSingleAmountNzd: "100.00",
  dailyLimitAmountNzd: "500.00",
  autoApproveAmountNzd: "25.00",
  recipientScope: "saved_only",
  allowedChannels: ["dashboard"],
  dailyUsedAmountNzd: "0.00",
  dailyRemainingAmountNzd: "500.00",
};

export default function Home() {
  const privyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID);
  const {
    authenticated: privyAuthenticated,
    exportWallet,
    ready: privyReady,
  } = usePrivy();
  const { sendTransaction: sendPrivyTransaction } = useSendTransaction();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [privyUserId, setPrivyUserId] = useState<string | null>(null);
  const [privyConnectedWallets, setPrivyConnectedWallets] = useState<ConnectedWallet[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [balanceGroups, setBalanceGroups] = useState<WalletBalanceGroup[]>([]);
  const [fiatAccount, setFiatAccount] = useState<FiatAccountState | null>(null);
  const [fx, setFx] = useState<FxState>({ rate: 1, preferredCurrency: "NZD" });
  const [recipient, setRecipient] = useState("");
  const [recipientPreview, setRecipientPreview] = useState<RecipientPreview | null>(null);
  const [recipientPreviewStatus, setRecipientPreviewStatus] = useState("");
  const [amount, setAmount] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [sendLink, setSendLink] = useState("");
  const [dataError, setDataError] = useState("");
  const [authError, setAuthError] = useState("");
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpStatus, setTopUpStatus] = useState("");
  const [topUpError, setTopUpError] = useState("");
  const [topUpResult, setTopUpResult] = useState<NewMoneyTopUpResult | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [selectedWalletAddress, setSelectedWalletAddress] = useState("");
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    walletAddress: "",
    regionCode: "NZ",
  });
  const [topUpForm, setTopUpForm] = useState({
    accountName: "",
    accountNumber: "",
    bankName: "",
    reference: "PocketRail demo top-up",
    amountNzd: "100.00",
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");
  const [walletExportBusy, setWalletExportBusy] = useState(false);
  const [walletPanelStatus, setWalletPanelStatus] = useState("");
  const [walletExportError, setWalletExportError] = useState("");
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [contactEditMode, setContactEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    name: "",
    username: "",
    email: "",
    regionCode: "NZ",
  });
  const [transferConfirmation, setTransferConfirmation] = useState<TransferConfirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask me to prepare a transfer, like 'Send 25 dNZD to Mum'. I'll draft it for review before anything is sent.",
    },
  ]);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const [automation, setAutomation] = useState<AutomationSettings>(DEFAULT_AUTOMATION_SETTINGS);
  const [savedRecipients, setSavedRecipients] = useState<SavedRecipient[]>([]);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationError, setAutomationError] = useState("");
  const [automationStatus, setAutomationStatus] = useState("");
  const [recipientNicknameDrafts, setRecipientNicknameDrafts] = useState<Record<number, string>>({});
  const [usernameState, setUsernameState] = useState<{
    checking: boolean;
    available: boolean;
    message: string;
  }>({ checking: false, available: false, message: "" });
  const privyEthereumWallets = privyConnectedWallets.filter((wallet) => wallet.type === "ethereum");

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
    const trimmedRecipient = recipient.trim();
    if (!trimmedRecipient) {
      setRecipientPreview(null);
      setRecipientPreviewStatus("");
      return;
    }

    let cancelled = false;
    setRecipientPreviewStatus("Checking recipient...");
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/app/recipient", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: trimmedRecipient }),
        });
        const data = (await response.json()) as { recipient?: RecipientPreview | null };
        if (cancelled) return;
        if (!response.ok || !data.recipient) {
          setRecipientPreview(null);
          setRecipientPreviewStatus("No matching PocketRail user found yet.");
          return;
        }
        setRecipientPreview(data.recipient);
        setRecipientPreviewStatus("");
      } catch {
        if (cancelled) return;
        setRecipientPreview(null);
        setRecipientPreviewStatus("Could not check recipient.");
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [recipient, user]);

  useEffect(() => {
    if (!user) return;
    void loadFx(user.regionCode);
  }, [user?.regionCode]);

  useEffect(() => {
    if (!user) {
      setFiatAccount(null);
      return;
    }
    void loadFiat();
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setAutomation(DEFAULT_AUTOMATION_SETTINGS);
      setSavedRecipients([]);
      return;
    }
    setProfileForm({
      name: user.name,
      username: user.username,
      email: user.email,
      regionCode: user.regionCode,
    });
    setProfileEditMode(false);
    void loadAutomation();
  }, [user?.id]);

  useEffect(() => {
    setRecipientNicknameDrafts(
      Object.fromEntries(savedRecipients.map((savedRecipient) => [savedRecipient.id, savedRecipient.nickname || ""])),
    );
  }, [savedRecipients]);

  useEffect(() => {
    const nextWalletOptions = uniqueAddresses(
      privyEthereumWallets
        .filter((wallet) => wallet.walletClientType === "privy")
        .map((wallet) => wallet.address),
    );
    if (nextWalletOptions.length === 0) {
      if (selectedWalletAddress) {
        setSelectedWalletAddress("");
      }
      return;
    }
    if (
      selectedWalletAddress
      && nextWalletOptions.some((wallet) => wallet.toLowerCase() === selectedWalletAddress.toLowerCase())
    ) {
      return;
    }
    setSelectedWalletAddress(nextWalletOptions[0]);
  }, [selectedWalletAddress, privyEthereumWallets]);

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
    if (!chatOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const container = chatMessagesRef.current;
      if (!container) return;
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatOpen, chatMessages, chatBusy]);

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

  useEffect(() => {
    if (authMode !== "register") return;
    const privyWalletAddress = privyEthereumWallets.find((wallet) => wallet.walletClientType === "privy")?.address || "";
    if (!privyWalletAddress) return;
    setForm((current) => (
      current.walletAddress.toLowerCase() === privyWalletAddress.toLowerCase()
        ? current
        : { ...current, walletAddress: privyWalletAddress }
    ));
  }, [authMode, privyEthereumWallets]);

  useEffect(() => {
    if (!user?.id || !user.walletAddress || !privyUserId) return;
    const privyWalletAddress = privyEthereumWallets.find((wallet) => wallet.walletClientType === "privy")?.address || "";
    if (!privyWalletAddress) return;
    if (user.walletAddress.toLowerCase() === privyWalletAddress.toLowerCase()) return;

    let cancelled = false;
    void (async () => {
      try {
        const data = await api<{ user: User }>("/api/wallet/sync", {
          walletAddress: privyWalletAddress,
          privyUserId,
        });
        if (!cancelled) {
          setUser(data.user);
          setSelectedWalletAddress(privyWalletAddress);
        }
      } catch (err) {
        if (!cancelled) {
          setSendError(err instanceof Error ? err.message : "Could not sync Privy wallet.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.walletAddress, privyUserId, privyEthereumWallets]);

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
      if (!privyEnabled) {
        throw new Error("Add NEXT_PUBLIC_PRIVY_APP_ID to enable Privy before creating accounts.");
      }
      if (authMode === "register" && !usernameState.available) {
        throw new Error(usernameState.message || "Choose a unique username first.");
      }
      if (authMode === "register" && !form.walletAddress) {
        throw new Error("Create your Privy wallet first.");
      }
      if (authMode === "register" && !privyUserId) {
        throw new Error("Sign in with Privy first.");
      }
      const payload = authMode === "login"
        ? { email: form.email, password: form.password }
        : {
            ...form,
            privyUserId,
          };
      const data = await api<{ user: User }>(
        authMode === "login" ? "/api/auth/login" : "/api/auth/register",
        payload,
      );
      setUser(data.user);
      setActiveView("overview");
      setAuthStatus(authMode === "login" ? "Welcome back." : "Account created.");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadTransactions() {
    try {
      const data = await api<{ transactions: WalletTransaction[] }>("/api/wallet/transactions");
      setTransactions(data.transactions);
      setDataError("");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load transactions");
    }
  }

  async function loadBalances() {
    try {
      const data = await api<{ balances: WalletBalanceGroup[] }>("/api/wallet/balances");
      setBalanceGroups(data.balances);
      setDataError("");
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load wallet balances");
    }
  }

  async function loadFiat() {
    try {
      const data = await api<{ fiat: FiatAccountState }>("/api/fiat");
      setFiatAccount(data.fiat);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : "Could not load top-up balance");
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

  async function submitNewMoneyTopUp() {
    setTopUpBusy(true);
    setTopUpError("");
    setTopUpStatus("");
    setTopUpResult(null);
    try {
      const data = await api<{ fiat: FiatAccountState; newMoney: NewMoneyTopUpResult }>("/api/newmoney/top-up", topUpForm);
      if (!data.newMoney) {
        throw new Error("Invalid response from New Money API");
      }
      setFiatAccount(data.fiat);
      setTopUpResult(data.newMoney);
      setTopUpStatus(
        `Minted ${formatCurrency(data.newMoney.amount, "NZD", "NZ")} through New Money and credited your demo wallet balance.`,
      );
      await Promise.all([loadBalances(), loadTransactions()]);
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : "Could not top up with New Money");
    } finally {
      setTopUpBusy(false);
    }
  }

  async function saveProfileDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileStatus("");
    try {
      const data = await api<{ user: User }>("/api/profile", profileForm);
      setUser(data.user);
      setProfileEditMode(false);
      setProfileStatus("Account details updated.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Could not update profile");
    } finally {
      setProfileBusy(false);
    }
  }

  async function exportPrivyWalletToMetaMask() {
    setWalletPanelStatus("");
    setWalletExportError("");

    if (!privyEnabled) {
      setWalletExportError("Add NEXT_PUBLIC_PRIVY_APP_ID before exporting wallets.");
      return;
    }

    if (!privyReady || !privyAuthenticated) {
      setWalletExportError("Reconnect your Privy wallet with email before exporting it.");
      return;
    }

    if (!user?.walletAddress) {
      setWalletExportError("No Privy wallet address is stored for this account.");
      return;
    }

    setWalletExportBusy(true);
    try {
      await exportWallet({ address: user.walletAddress });
      setWalletPanelStatus("Privy opened the secure export flow for your PocketRail wallet.");
    } catch (err) {
      setWalletExportError(err instanceof Error ? err.message : "Could not export Privy wallet");
    } finally {
      setWalletExportBusy(false);
    }
  }

  function applyAutomationOverview(data: AutomationOverview) {
    setAutomation(data.settings);
    setSavedRecipients(data.recipients);
  }

  async function loadAutomation() {
    try {
      const data = await api<AutomationOverview>("/api/automation");
      applyAutomationOverview(data);
      setAutomationError("");
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : "Could not load automation settings");
    }
  }

  async function persistAutomationSettings(nextAutomation: AutomationSettings, successMessage: string) {
    setAutomationBusy(true);
    setAutomationError("");
    setAutomationStatus("");
    try {
      const data = await api<AutomationOverview>("/api/automation", {
        aiEnabled: nextAutomation.aiEnabled,
        autopayEnabled: nextAutomation.autopayEnabled,
        maxSingleAmountNzd: nextAutomation.maxSingleAmountNzd,
        dailyLimitAmountNzd: nextAutomation.dailyLimitAmountNzd,
        autoApproveAmountNzd: nextAutomation.autoApproveAmountNzd,
        recipientScope: nextAutomation.recipientScope,
        allowedChannels: nextAutomation.allowedChannels,
      });
      applyAutomationOverview(data);
      setAutomationStatus(successMessage);
      return true;
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : "Could not update automation settings");
      await loadAutomation();
      return false;
    } finally {
      setAutomationBusy(false);
    }
  }

  async function saveAutomationSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persistAutomationSettings(automation, "Automation guardrails updated.");
  }

  async function saveRecipient(identifier: string, nickname = "") {
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setAutomationError("Enter a username to save a recipient.");
      return;
    }
    setAutomationBusy(true);
    setAutomationError("");
    setAutomationStatus("");
    try {
      const data = await api<AutomationOverview>("/api/automation/recipients", {
        recipient: trimmedIdentifier,
        nickname: nickname.trim() || undefined,
      });
      applyAutomationOverview(data);
      setAutomationStatus("Recipient saved for future transfers and automation.");
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : "Could not save recipient");
    } finally {
      setAutomationBusy(false);
    }
  }

  async function removeRecipient(savedRecipientId: number) {
    setAutomationBusy(true);
    setAutomationError("");
    setAutomationStatus("");
    try {
      const res = await fetch("/api/automation/recipients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedRecipientId }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) as AutomationOverview & { error?: string } : undefined;
      if (!res.ok) {
        throw new Error(data?.error || "Could not remove recipient");
      }
      if (data) {
        applyAutomationOverview(data);
      }
      setAutomationStatus("Recipient removed from your saved list.");
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : "Could not remove recipient");
    } finally {
      setAutomationBusy(false);
    }
  }

  async function updateRecipientNickname(savedRecipientId: number) {
    setAutomationBusy(true);
    setAutomationError("");
    setAutomationStatus("");
    try {
      const res = await fetch("/api/automation/recipients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedRecipientId,
          nickname: recipientNicknameDrafts[savedRecipientId] || "",
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) as AutomationOverview & { error?: string } : undefined;
      if (!res.ok) {
        throw new Error(data?.error || "Could not update recipient");
      }
      if (data) {
        applyAutomationOverview(data);
      }
      setAutomationStatus("Saved contact details updated.");
    } catch (err) {
      setAutomationError(err instanceof Error ? err.message : "Could not update recipient");
    } finally {
      setAutomationBusy(false);
    }
  }

  async function saveCurrentRecipient() {
    await saveRecipient(recipient);
  }

  async function requestTransferConfirmation(input: {
    source: "manual" | "ai";
    recipient: string;
    amountNzd: string;
    walletAddress: string;
  }) {
    const amountValue = Number(input.amountNzd);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new Error("Enter a dNZD amount greater than 0.");
    }
    if (bankBalanceNzd < amountValue) {
      throw new Error("Insufficient dNZD balance.");
    }
    if (!input.walletAddress) {
      throw new Error("Select a wallet to pay from first.");
    }

    const prepared = await api<PreparedTransfer>("/api/app/prepare-send", {
      recipient: input.recipient,
      amountNzd: input.amountNzd,
    });

    setTransferConfirmation({
      source: input.source,
      amountNzd: input.amountNzd,
      amountValue,
      fromWalletAddress: input.walletAddress,
      recipientInput: input.recipient,
      prepared,
    });
    setConfirmationError("");
  }

  async function submitAiChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = chatInput.trim();
    if (!prompt || chatBusy) return;

    const nextMessages: AiChatMessage[] = [
      ...chatMessages,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: prompt,
      },
    ];

    setChatMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);
    setChatError("");

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          activeWalletAddress: activePaymentWallet,
        }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) as {
        message?: string;
        error?: string;
        transferProposal?: AiTransferProposal | null;
      } : {};
      if (!response.ok) {
        throw new Error(data.error || "Could not reach PocketRail AI.");
      }

      setChatMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message || "I prepared a response.",
          transferProposal: data.transferProposal || null,
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Could not reach PocketRail AI.");
    } finally {
      setChatBusy(false);
    }
  }

  async function reviewAiTransfer(proposal: AiTransferProposal) {
    try {
      await requestTransferConfirmation({
        source: "ai",
        recipient: proposal.recipientInput,
        amountNzd: proposal.amountNzd,
        walletAddress: proposal.fromWalletAddress,
      });
      setChatOpen(false);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Could not prepare AI transfer.");
    }
  }

  async function sendTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendError("");
    setSendStatus("");
    setSendLink("");
    setBusy(true);
    try {
      await requestTransferConfirmation({
        source: "manual",
        recipient,
        amountNzd: amount,
        walletAddress: activePaymentWallet,
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not prepare transfer");
    } finally {
      setBusy(false);
    }
  }

  async function sendFromSelectedWallet(confirmation: TransferConfirmation) {
    const walletAddress = confirmation.fromWalletAddress;
    if (!walletAddress) {
      throw new Error("Select a wallet to pay from first.");
    }
    const prepared = confirmation.prepared;
    const privyWallet = privyEthereumWallets.find(
      (wallet) =>
        wallet.walletClientType === "privy"
        && wallet.address.toLowerCase() === walletAddress.toLowerCase(),
    );
    if (!privyWallet) {
      throw new Error(`Reconnect ${shortAddress(walletAddress)} with Privy before sending.`);
    }

    const chain = chainById(prepared.chainId);
    if (!chain) {
      throw new Error("PocketRail could not resolve the settlement network.");
    }

    const readProvider = new JsonRpcProvider(chain.rpcUrl, chain.id);
    const readToken = new Contract(prepared.token.address, erc20BalanceAbi, readProvider);
    const tokenDecimals = Number((await readToken.decimals()) as bigint | number);
    const amountRaw = parseUnits(confirmation.amountNzd, tokenDecimals);
    const tokenBalance = (await readToken.balanceOf(walletAddress)) as bigint;
    if (tokenBalance < amountRaw) {
      if (localDemoBalanceNzd >= confirmation.amountValue) {
        return api<{ txHash: string; recipient: { name: string; username: string } }>("/api/app/send", {
          recipient: confirmation.recipientInput,
          amountNzd: confirmation.amountNzd,
        });
      }
      throw new Error("Selected wallet does not have enough dNZD for this payment." + "\n" + "Amount: " + amountRaw + " Token Balance: " + tokenBalance);
    }

    const provider = new BrowserProvider(await privyWallet.getEthereumProvider());
    const transferData = erc20Interface.encodeFunctionData("transfer", [
      prepared.recipientWalletAddress,
      amountRaw,
    ]);
    const { hash } = await sendPrivyTransaction(
      {
        to: prepared.token.address,
        data: transferData,
        chainId: prepared.chainId,
      },
      {
        address: walletAddress,
        sponsor: true,
      },
    );

    return api<{ txHash: string; recipient: { name: string; username: string } }>("/api/app/record-send", {
      recipient: confirmation.recipientInput,
      amountNzd: confirmation.amountNzd,
      txHash: hash,
      chainId: prepared.chainId,
    });
  }

  async function confirmTransfer() {
    if (!transferConfirmation) return;

    setBusy(true);
    setConfirmationError("");
    setSendError("");
    setSendStatus("");
    setSendLink("");
    try {
      const data = await sendFromSelectedWallet(transferConfirmation);
      setSendStatus(
        `Sent ${formatCurrency(transferConfirmation.amountValue, "NZD", "NZ")} to @${data.recipient.username}.`,
      );
      setSendLink(`${BASE_SEPOLIA_EXPLORER}${data.txHash}`);
      setAmount("");
      setRecipient("");
      setTransferConfirmation(null);
      setActiveView("activity");
      await Promise.all([loadTransactions(), loadBalances(), loadFiat()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send money";
      setConfirmationError(message);
      setSendError(message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", {});
    setUser(null);
    setTransactions([]);
    setBalanceGroups([]);
    setFiatAccount(null);
    setAuthStatus("");
    setSendStatus("");
    setSendLink("");
    setAuthError("");
    setSendError("");
    setTopUpStatus("");
    setTopUpError("");
    setTopUpResult(null);
    setDataError("");
    setProfileEditMode(false);
    setContactEditMode(false);
    setTransferConfirmation(null);
    setChatOpen(false);
    setChatBusy(false);
    setChatInput("");
    setChatError("");
    setChatMessages([
      {
        id: "welcome",
        role: "assistant",
          content: "Ask me to prepare a transfer, like 'Send 25 dNZD to Mum'. I'll draft it for review before anything is sent.",
      },
    ]);
    setAutomation(DEFAULT_AUTOMATION_SETTINGS);
    setSavedRecipients([]);
    setAutomationError("");
    setAutomationStatus("");
    setConfirmationError("");
    setActiveView("overview");
  }

  const baseSepoliaAssets = balanceGroups.find((group) => group.chain.id === BASE_SEPOLIA_CHAIN_ID)?.assets || [];
  const dnzdAsset = baseSepoliaAssets.find((asset) => asset.symbol === "dNZD");
  const gasAsset = baseSepoliaAssets.find((asset) => asset.symbol === "ETH" && asset.native);
  const localDemoBalanceNzd = Number(fiatAccount?.nzdBalance || "0");
  const bankBalanceNzd = Number(dnzdAsset?.balance || "0");
  const gasBalanceEth = gasAsset?.balance || "0";
  const userRegionCode = user?.regionCode || "NZ";
  const displayCurrency = user?.preferredCurrency || fx.preferredCurrency;
  const displayRegion = REGION_OPTIONS.find((option) => option.code === userRegionCode) || REGION_OPTIONS[0];
  const bankBalanceDisplay = bankBalanceNzd * (fx.rate || 1);
  const embeddedPrivyWallet = privyEthereumWallets.find((wallet) => wallet.walletClientType === "privy");
  const walletOptions = uniqueAddresses(embeddedPrivyWallet?.address ? [embeddedPrivyWallet.address] : []);
  const activePaymentWallet = embeddedPrivyWallet?.address || selectedWalletAddress || user?.walletAddress || "";
  const activePaymentWalletUsesPrivySponsorship = Boolean(
    activePaymentWallet
    && privyEthereumWallets.some(
      (wallet) =>
        wallet.walletClientType === "privy"
        && wallet.address.toLowerCase() === activePaymentWallet.toLowerCase(),
    ),
  );
  const activePaymentWalletIsConnected = Boolean(
    activePaymentWallet
    && privyEthereumWallets.some(
      (wallet) =>
        wallet.walletClientType === "privy"
        && wallet.address.toLowerCase() === activePaymentWallet.toLowerCase(),
    ),
  );
  const sendAmountValue = Number(amount);
  const convertedSendAmount = Number.isFinite(sendAmountValue) ? sendAmountValue * (fx.rate || 1) : 0;
  const latestTransaction = transactions[0];
  const selectedSavedRecipient = savedRecipients.find((savedRecipient) => {
    const normalizedRecipient = recipient.trim().toLowerCase();
    return (
      normalizedRecipient === `@${savedRecipient.username}`.toLowerCase() ||
      normalizedRecipient === savedRecipient.username.toLowerCase() ||
      normalizedRecipient === (savedRecipient.walletAddress || "").toLowerCase()
    );
  });
  const selectedSavedRecipientValue = selectedSavedRecipient ? String(selectedSavedRecipient.id) : "custom";
  const automationStateLabel = !automation.aiEnabled
    ? "Automation off"
    : automation.autopayEnabled
      ? "Autopay armed"
      : "AI assist only";
  const balanceTimeline = buildBalanceTimeline(transactions, bankBalanceDisplay, fx.rate || 1);
  const activeBalancePoint = balanceTimeline[balanceTimeline.length - 1];
  const confirmationDisplayAmount = transferConfirmation
    ? transferConfirmation.amountValue * (fx.rate || 1)
    : 0;
  const privyStateSync = privyEnabled ? (
    <PrivyWalletStateSync
      onStateChange={({ wallets, privyUserId: nextPrivyUserId }) => {
        setPrivyConnectedWallets(wallets);
        setPrivyUserId(nextPrivyUserId);
      }}
    />
  ) : null;

  if (loadingUser) {
    return (
      <>
        {privyStateSync}
        <main className="center-screen app-background">
          <div className="loading-orb">
            <Loader2 className="spin" />
          </div>
          <span>Loading PocketRail...</span>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        {privyStateSync}
        <main className="auth-shell app-background">
        <section className="auth-showcase surface-panel">
          <div className="hero-badge">
            <Wallet size={16} />
            PocketRail on Base Sepolia
          </div>
          <div className="hero-copy">
            <p className="eyebrow soft">Wallet-connected payments</p>
            <h1>Send stablecoin transfers through an app that feels familiar.</h1>
            <p className="lead-copy">
              PocketRail gives your crypto payment flow a cleaner bank-like front end, while settlement still happens onchain in dNZD.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-icon">
                <ShieldCheck size={16} />
              </span>
              <strong>Safer onboarding</strong>
              <p>Email login, username checks, and wallet linking all live in one flow.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <ArrowUpRight size={16} />
              </span>
              <strong>Fast handoff to chain</strong>
              <p>Users see familiar balances, then transactions settle through Base Sepolia.</p>
            </article>
            <article className="feature-card">
              <span className="feature-icon">
                <BadgeCheck size={16} />
              </span>
              <strong>Built for repeat use</strong>
              <p>Profile, activity, and send flow stay connected in a single experience.</p>
            </article>
          </div>
        </section>

        <section className="auth-card surface-panel">
          <div className="auth-card-head">
            <div>
              <p className="eyebrow">Access PocketRail</p>
              <h2>{authMode === "register" ? "Create your account" : "Welcome back"}</h2>
            </div>
            <div className="segmented">
              <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Log in</button>
            </div>
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
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="At least 8 characters"
                  required
                  minLength={authMode === "register" ? 8 : 1}
                />
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
                {!privyEnabled && (
                  <p className="field-hint error-text">
                    Add `NEXT_PUBLIC_PRIVY_APP_ID` in `.env` before using wallet onboarding.
                  </p>
                )}
                <PrivyWalletButton
                  label="Create your PocketRail wallet"
                  onWallet={(address) => {
                    setAuthError("");
                    setForm((current) => ({ ...current, walletAddress: address }));
                  }}
                  onStateChange={({ wallets, privyUserId: nextPrivyUserId }) => {
                    setPrivyConnectedWallets(wallets);
                    setPrivyUserId(nextPrivyUserId);
                  }}
                />
                <p className="field-hint">
                  Every PocketRail account uses an automatically generated Privy wallet. We create and reconnect it through your email login so dNZD sends can use sponsored gas.
                </p>
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
      </>
    );
  }

  return (
    <>
      {privyStateSync}
      <main className="app-shell app-background">
      <section className="sidebar-shell surface-panel">
        <div className="sidebar-main">
          <div className="sidebar-brand">
            <div className="brand-emblem">
              <Wallet size={18} />
            </div>
            <div>
              <p className="eyebrow">PocketRail</p>
              <h1>Payments</h1>
            </div>
          </div>

          <nav className="nav-stack" aria-label="Dashboard views">
            {DASHBOARD_VIEWS.map((view) => (
              <button
                key={view.id}
                type="button"
                className={activeView === view.id ? "nav-pill active" : "nav-pill"}
                onClick={() => setActiveView(view.id)}
              >
                <span>{view.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className={activeView === "profile" ? "profile-identity active" : "profile-identity"}
            onClick={() => setActiveView("profile")}
          >
            <div className="identity-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{user.name}</strong>
              <span>@{user.username}</span>
              <small>{user.email}</small>
            </div>
          </button>

          <button className="secondary logout-button" onClick={logout}>
            <LogOut size={16} /> Log out
          </button>
        </div>
      </section>

      <section className="content-shell">
        <header className="app-topbar surface-panel">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h2>{dashboardTitle(activeView, user.name)}</h2>
          </div>
        </header>

        <div className="view-stage">
          <section className={activeView === "overview" ? "view-panel active" : "view-panel"} aria-hidden={activeView !== "overview"}>
            <div className="hero-balance surface-panel">
              <div className="hero-balance-copy">
                <div className="hero-balance-head">
                  <p className="eyebrow soft">Available balance</p>
                  <h3>Welcome back, {user.name}</h3>
                </div>
                <div className="balance-line">
                  <strong>{formatCurrency(bankBalanceDisplay, displayCurrency, user.regionCode)}</strong>
                  <span>{displayCurrency}</span>
                </div>
                <p>
                  Your on-screen balance is localized for {displayRegion.label}, while settlement still happens in dNZD.
                </p>
                <div className="hero-actions">
                  <button className="primary" type="button" onClick={() => setActiveView("pay")}>
                    <Send size={16} /> Send dNZD
                  </button>
                  {latestTransaction?.explorerUrl && (
                    <a className="secondary" href={latestTransaction.explorerUrl} target="_blank" rel="noreferrer">
                      Latest transaction <ExternalLink size={15} />
                    </a>
                  )}
                </div>

                <div className="hero-balance-footer">
                  <div className="stat-card mini-stat">
                    <span>Wallet balance</span>
                    <strong>{shortAmount(dnzdAsset?.balance || "0")} dNZD</strong>
                  </div>
                  <div className="stat-card mini-stat">
                    <span>Gas balance</span>
                    <strong>{activePaymentWalletUsesPrivySponsorship ? "Sponsored" : `${shortAmount(gasBalanceEth)} ETH`}</strong>
                  </div>
                </div>
              </div>

              <div className="balance-chart-card">
                <div className="balance-chart-meta">
                  <div>
                    <span className="section-label">Balance over time</span>
                    <strong>{formatCurrency(activeBalancePoint.balance, displayCurrency, user.regionCode)} {displayCurrency}</strong>
                  </div>
                </div>

                <div className="balance-chart-frame" role="img" aria-label="Balance over time">
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={balanceTimeline} margin={{ top: 12, right: 10, left: 0, bottom: 8 }}>
                      <defs>
                        <linearGradient id="balance-fill-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 6" vertical={false} />
                      <XAxis
                        dataKey="label"
                        hide
                        axisLine={false}
                        tickLine={false}
                        tickMargin={12}
                      />
                      <Tooltip
                        cursor={{ stroke: "rgba(59, 130, 246, 0.22)", strokeWidth: 2 }}
                        content={(props) => (
                          <BalanceChartTooltip
                            active={props.active}
                            payload={props.payload as unknown as ReadonlyArray<{ payload: BalanceTimelinePoint }> | undefined}
                            regionCode={user.regionCode}
                            currency={displayCurrency}
                          />
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        stroke="#3b82f6"
                        strokeWidth={4}
                        fill="url(#balance-fill-gradient)"
                        activeDot={{ r: 7, fill: "#2dd4bf", stroke: "#ffffff", strokeWidth: 3 }}
                        dot={{ r: 4, fill: "#ffffff", stroke: "#3b82f6", strokeWidth: 3 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {dataError && <p className="error floating-message">{dataError}</p>}
          </section>

          <section className={activeView === "pay" ? "view-panel active" : "view-panel"} aria-hidden={activeView !== "pay"}>
            <section className="surface-panel panel pay-panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Send money</p>
                  <h3>Pay another PocketRail user</h3>
                </div>
                <Send size={20} />
              </div>
              <form className="stack" onSubmit={sendTransfer}>
                <div className="pay-top-grid">
                  <label>
                    Pay from
                    <select
                      value={activePaymentWallet}
                      onChange={(event) => setSelectedWalletAddress(event.target.value)}
                      disabled={walletOptions.length === 0}
                    >
                      {walletOptions.length === 0 ? (
                        <option value="">Connect your Privy wallet to send</option>
                      ) : (
                        walletOptions.map((wallet) => (
                          <option key={wallet} value={wallet}>
                            {walletLabel(wallet, user)}
                          </option>
                        ))
                      )}
                    </select>
                  </label>

                  <div className="payment-wallet-card">
                    <div className="payment-wallet-head">
                      <span className="section-label">Payment wallet</span>
                      <Wallet size={18} />
                    </div>
                    <div className="profile-box compact-box">
                      <strong>{shortAddress(activePaymentWallet)}</strong>
                      <small>Selected wallet</small>
                      <small>{shortAmount(dnzdAsset?.balance || "0")} dNZD available</small>
                      <small>
                        {activePaymentWalletUsesPrivySponsorship
                          ? "Privy gas sponsorship enabled"
                          : `${shortAmount(gasBalanceEth)} ETH gas balance`}
                      </small>
                      {!activePaymentWalletIsConnected && (
                        <small>Reconnect your Privy wallet before sending.</small>
                      )}
                    </div>
                    <PrivyWalletButton
                      label="Use Privy wallet"
                      onWallet={(address) => {
                        setSendError("");
                        setSelectedWalletAddress(address);
                      }}
                      onStateChange={({ wallets, privyUserId: nextPrivyUserId }) => {
                        setPrivyConnectedWallets(wallets);
                        setPrivyUserId(nextPrivyUserId);
                      }}
                    />
                  </div>
                </div>

                <div className="recipient-entry">
                  <div className="recipient-entry-head">
                    <div>
                      <span className="section-label">Recipient</span>
                      <p className="muted-copy compact-copy">Choose a saved contact or enter a new PocketRail recipient below.</p>
                    </div>
                  </div>

                  <label>
                    Saved recipients
                    <select
                      value={selectedSavedRecipientValue}
                      onChange={(event) => {
                        if (event.target.value === "custom") {
                          setRecipient("");
                          return;
                        }
                        const nextRecipient = savedRecipients.find(
                          (savedRecipient) => String(savedRecipient.id) === event.target.value,
                        );
                        if (nextRecipient) {
                          setRecipient(`@${nextRecipient.username}`);
                        }
                      }}
                    >
                      <option value="custom">Create a new recipient</option>
                      {savedRecipients.map((savedRecipient) => (
                        <option key={savedRecipient.id} value={savedRecipient.id}>
                          {recipientDisplayName(savedRecipient)} (@{savedRecipient.username}) - {shortAddress(savedRecipient.walletAddress || "")}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Recipient username
                    <input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="@username"
                      required
                    />
                  </label>

                  {recipientPreview ? (
                    <div className="recipient-resolved-card">
                      <span className="section-label">Matched recipient</span>
                      <strong>{recipientPreview.name} (@{recipientPreview.username})</strong>
                      <small>{recipientPreview.walletAddress || "Wallet address unavailable"}</small>
                    </div>
                  ) : recipientPreviewStatus ? (
                    <p className="muted-copy compact-copy">{recipientPreviewStatus}</p>
                  ) : null}

                  <div className="action-list inline-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void saveCurrentRecipient()}
                      disabled={automationBusy || !recipient.trim()}
                    >
                      <UserPlus size={16} /> Save recipient
                    </button>
                  </div>
                </div>

                <label>
                  dNZD amount
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="25.00" required />
                </label>
                <p className="muted-copy compact-copy">
                  {Number.isFinite(sendAmountValue) && sendAmountValue > 0
                    ? `Displayed to you as ${formatCurrency(convertedSendAmount, displayCurrency, user.regionCode)} in ${displayRegion.label}.`
                    : `Transfers settle in dNZD while your dashboard displays ${displayCurrency}.`}
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
          </section>

          <section className={activeView === "topup" ? "view-panel active" : "view-panel"} aria-hidden={activeView !== "topup"}>
            <section className="surface-panel panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Add funds</p>
                  <h3>Top up your account</h3>
                </div>
                <ArrowUpRight size={20} />
              </div>
              <form className="stack">
                <section className="profile-box compact-box">
                  <div className="payment-wallet-head">
                    <span className="section-label">Top up</span>
                    <ArrowUpRight size={18} />
                  </div>
                  <p className="muted-copy compact-copy">
                    Demo flow: enter bank details, fake the payment, call New Money mint, then credit the amount to this PocketRail wallet for in-app use.
                  </p>
                  <div className="stack compact-stack">
                    <div className="settings-grid">
                      <label>
                        Account name
                        <input
                          value={topUpForm.accountName}
                          onChange={(event) => setTopUpForm((current) => ({ ...current, accountName: event.target.value }))}
                          placeholder="Ada Lovelace"
                        />
                      </label>
                      <label>
                        Bank name
                        <input
                          value={topUpForm.bankName}
                          onChange={(event) => setTopUpForm((current) => ({ ...current, bankName: event.target.value }))}
                          placeholder="ANZ"
                        />
                      </label>
                      <label>
                        Account number
                        <input
                          value={topUpForm.accountNumber}
                          onChange={(event) => setTopUpForm((current) => ({ ...current, accountNumber: event.target.value }))}
                          placeholder="12-1234-1234567-00"
                        />
                      </label>
                      <label>
                        Amount (NZD)
                        <input
                          value={topUpForm.amountNzd}
                          onChange={(event) => setTopUpForm((current) => ({ ...current, amountNzd: event.target.value }))}
                          inputMode="decimal"
                          placeholder="100.00"
                        />
                      </label>
                    </div>
                    <label>
                      Payment reference
                      <input
                        value={topUpForm.reference}
                        onChange={(event) => setTopUpForm((current) => ({ ...current, reference: event.target.value }))}
                        placeholder="PocketRail demo top-up"
                      />
                    </label>
                    {topUpError && <p className="error">{topUpError}</p>}
                    {topUpStatus && <p className="success">{topUpStatus}</p>}
                    {topUpResult && (
                      <div className="profile-box compact-box">
                        <strong>{topUpResult.message}</strong>
                        <small>{topUpResult.userName}</small>
                        <small>Mint wallet: {shortAddress(topUpResult.walletAddress)}</small>
                        <small>
                          Remaining New Money balance: {topUpResult.remainingBalance === null ? "Unknown" : topUpResult.remainingBalance}
                        </small>
                        <small>Demo dNZD available in PocketRail: {Number(fiatAccount?.nzdBalance || "0").toFixed(2)}</small>
                      </div>
                    )}
                    <button type="button" className="primary" disabled={topUpBusy} onClick={() => void submitNewMoneyTopUp()}>
                      {topUpBusy ? <Loader2 className="spin" size={18} /> : <ArrowUpRight size={18} />}
                      Mint dNZD
                    </button>
                  </div>
                </section>
              </form>
            </section>
          </section>

          <section className={activeView === "activity" ? "view-panel active" : "view-panel"} aria-hidden={activeView !== "activity"}>
            <section className="surface-panel panel">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Activity</p>
                  <h3>Latest activity</h3>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    void loadTransactions();
                    void loadBalances();
                  }}
                  aria-label="Refresh transactions"
                >
                  <History size={17} />
                </button>
              </div>
              {dataError && <p className="error inline-message">{dataError}</p>}
              <div className="tx-list">
                {transactions.length === 0 && (
                  <p className="muted-copy empty-state">No incoming or outgoing transactions found yet.</p>
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

          <section className={activeView === "profile" ? "view-panel active" : "view-panel"} aria-hidden={activeView !== "profile"}>
            <div className="profile-layout">
              <section className="surface-panel panel">
                <div className="panel-head">
                  <div>
                    <p className="eyebrow">Profile</p>
                    <h3>Account details</h3>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (profileEditMode) {
                        setProfileForm({
                          name: user.name,
                          username: user.username,
                          email: user.email,
                          regionCode: user.regionCode,
                        });
                        setProfileEditMode(false);
                        setProfileError("");
                        setProfileStatus("");
                        return;
                      }
                      setProfileEditMode(true);
                    }}
                  >
                    {profileEditMode ? <X size={16} /> : <Pencil size={16} />}
                    {profileEditMode ? "Cancel" : "Edit"}
                  </button>
                </div>
                <form className="profile-box profile-panel" onSubmit={saveProfileDetails}>
                  <label>
                    Display name
                    <input
                      value={profileForm.name}
                      onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                      disabled={!profileEditMode || profileBusy}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      value={profileForm.username}
                      onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
                      disabled={!profileEditMode || profileBusy}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                      disabled={!profileEditMode || profileBusy}
                    />
                  </label>
                  <label>
                    Region
                    <select
                      value={profileForm.regionCode}
                      onChange={(event) => setProfileForm((current) => ({ ...current, regionCode: event.target.value }))}
                      disabled={!profileEditMode || profileBusy}
                    >
                      {REGION_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label} ({option.currency})
                        </option>
                      ))}
                    </select>
                  </label>
                  {profileError && <p className="error">{profileError}</p>}
                  {profileStatus && <p className="success">{profileStatus}</p>}
                  {profileEditMode && (
                    <button className="primary" disabled={profileBusy}>
                      {profileBusy ? <Loader2 className="spin" size={18} /> : <BadgeCheck size={18} />}
                      Save account details
                    </button>
                  )}
                </form>

                <div className="settings-divider" />

                <div className="panel-head nested-head">
                  <div>
                    <p className="eyebrow">Wallet</p>
                    <h3>Privy wallet</h3>
                  </div>
                  <div className="action-list inline-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={walletExportBusy || !user.walletAddress}
                      onClick={() => void exportPrivyWalletToMetaMask()}
                    >
                      {walletExportBusy ? <Loader2 className="spin" size={18} /> : <ExternalLink size={18} />}
                      Export private key for MetaMask
                    </button>
                    <Wallet size={18} />
                  </div>
                </div>

                <div className="profile-box profile-panel">
                  <div className="wallet-summary">
                    <strong>{shortAddress(user.walletAddress || "")}</strong>
                    <small>Embedded Privy wallet</small>
                    {user.ensName && <small>{user.ensName}</small>}
                  </div>
                  <p className="muted-copy compact-copy">
                    PocketRail uses one automatically generated Privy wallet per account so transfers stay eligible for gas sponsorship.
                  </p>
                  <p className="muted-copy compact-copy">
                    To use this wallet in MetaMask, export its private key through Privy and import it into MetaMask as an imported account. This does not export a Secret Recovery Phrase.
                  </p>
                  {walletPanelStatus && <p className="success">{walletPanelStatus}</p>}
                  {walletExportError && <p className="error">{walletExportError}</p>}
                </div>

                <div className="settings-divider" />

                <div className="panel-head nested-head">
                  <div>
                    <p className="eyebrow">Automation</p>
                    <h3>AI guardrails</h3>
                  </div>
                  <ShieldCheck size={18} />
                </div>

                <form className="stack" onSubmit={saveAutomationSettings}>
                  <div className="toggle-row">
                    <div className="toggle-copy">
                      <strong>Enable AI access</strong>
                      <small>Allow an agent to read your guardrails and prepare transaction requests.</small>
                    </div>
                    <button
                      type="button"
                      className={automation.aiEnabled ? "toggle-button active" : "toggle-button"}
                      aria-pressed={automation.aiEnabled}
                      onClick={() => {
                        const nextAutomation = { ...automation, aiEnabled: !automation.aiEnabled };
                        setAutomation(nextAutomation);
                        void persistAutomationSettings(
                          nextAutomation,
                          nextAutomation.aiEnabled ? "AI access enabled." : "AI access disabled.",
                        );
                      }}
                      disabled={automationBusy}
                    >
                      <span className="toggle-knob" />
                    </button>
                  </div>

                  {automation.aiEnabled ? (
                    <div className="stack">
                      <div className="toggle-row">
                        <div className="toggle-copy">
                          <strong>Enable autopay</strong>
                          <small>Let approved requests move ahead without manual review when they stay under your limit.</small>
                        </div>
                        <button
                          type="button"
                          className={automation.autopayEnabled ? "toggle-button active" : "toggle-button"}
                          aria-pressed={automation.autopayEnabled}
                          onClick={() => {
                            const nextAutomation = { ...automation, autopayEnabled: !automation.autopayEnabled };
                            setAutomation(nextAutomation);
                            void persistAutomationSettings(
                              nextAutomation,
                              nextAutomation.autopayEnabled ? "Autopay enabled." : "Autopay disabled.",
                            );
                          }}
                          disabled={automationBusy}
                        >
                          <span className="toggle-knob" />
                        </button>
                      </div>

                      <label>
                        Recipient policy
                        <select
                          value={automation.recipientScope}
                          onChange={(event) =>
                            setAutomation((current) => ({
                              ...current,
                              recipientScope: event.target.value as RecipientScope,
                            }))
                          }
                          disabled={automationBusy}
                        >
                          <option value="saved_only">Only saved recipients</option>
                          <option value="any_registered">Any PocketRail user</option>
                        </select>
                      </label>

                      <div className="settings-grid">
                        <label>
                          Single transfer limit
                          <input
                            value={automation.maxSingleAmountNzd}
                            onChange={(event) =>
                              setAutomation((current) => ({
                                ...current,
                                maxSingleAmountNzd: event.target.value,
                              }))
                            }
                            inputMode="decimal"
                            placeholder="100.00"
                          />
                        </label>
                        <label>
                          Daily limit
                          <input
                            value={automation.dailyLimitAmountNzd}
                            onChange={(event) =>
                              setAutomation((current) => ({
                                ...current,
                                dailyLimitAmountNzd: event.target.value,
                              }))
                            }
                            inputMode="decimal"
                            placeholder="500.00"
                          />
                        </label>
                        <label>
                          Auto-approve under
                          <input
                            value={automation.autoApproveAmountNzd}
                            onChange={(event) =>
                              setAutomation((current) => ({
                                ...current,
                                autoApproveAmountNzd: event.target.value,
                              }))
                            }
                            inputMode="decimal"
                            placeholder="25.00"
                          />
                        </label>
                      </div>

                      <label>
                        Approved channels
                        <input
                          value={automation.allowedChannels.join(", ")}
                          onChange={(event) =>
                            setAutomation((current) => ({
                              ...current,
                              allowedChannels: event.target.value.split(","),
                            }))
                          }
                          placeholder="dashboard, slack, whatsapp"
                        />
                      </label>

                      <div className="profile-box compact-box">
                        <strong>{automationStateLabel}</strong>
                        <small>{automation.dailyUsedAmountNzd} dNZD already used in the last 24 hours</small>
                        <small>{automation.dailyRemainingAmountNzd} dNZD remaining before the daily cap</small>
                      </div>

                      <button className="primary" disabled={automationBusy}>
                        {automationBusy ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
                        Save automation settings
                      </button>
                    </div>
                  ) : null}

                  {automationError && <p className="error">{automationError}</p>}
                  {automationStatus && <p className="success">{automationStatus}</p>}
                </form>

                <div className="settings-divider" />

                <div className="panel-head nested-head">
                  <div>
                    <p className="eyebrow">Recipients</p>
                    <h3>Edit contact details</h3>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (contactEditMode) {
                        setRecipientNicknameDrafts(
                          Object.fromEntries(savedRecipients.map((savedRecipient) => [savedRecipient.id, savedRecipient.nickname || ""])),
                        );
                      }
                      setContactEditMode((current) => !current);
                    }}
                  >
                    {contactEditMode ? <X size={16} /> : <Pencil size={16} />}
                    {contactEditMode ? "Done" : "Edit"}
                  </button>
                </div>

                <div className="recipient-list">
                  {savedRecipients.length === 0 ? (
                    <p className="muted-copy empty-state">No saved recipients yet. Save a recipient from the pay screen to manage their contact details here.</p>
                  ) : (
                    savedRecipients.map((savedRecipient) => (
                      <div className="recipient-card" key={savedRecipient.id}>
                        <div>
                          {contactEditMode ? (
                            <label className="recipient-edit-field">
                              Nickname
                              <input
                                value={recipientNicknameDrafts[savedRecipient.id] || ""}
                                onChange={(event) =>
                                  setRecipientNicknameDrafts((current) => ({
                                    ...current,
                                    [savedRecipient.id]: event.target.value,
                                  }))
                                }
                                placeholder={savedRecipient.name}
                              />
                            </label>
                          ) : (
                            <strong>{recipientDisplayName(savedRecipient)}</strong>
                          )}
                          <small>@{savedRecipient.username}</small>
                          <small>{shortAddress(savedRecipient.walletAddress || "")}</small>
                        </div>
                        <div className="recipient-actions">
                          {contactEditMode && (
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => void updateRecipientNickname(savedRecipient.id)}
                              disabled={automationBusy}
                            >
                              <BadgeCheck size={15} /> Save
                            </button>
                          )}
                          <button
                            className="secondary"
                            type="button"
                            onClick={() => {
                              setRecipient(`@${savedRecipient.username}`);
                              setActiveView("pay");
                            }}
                          >
                            <Send size={15} /> Use
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            onClick={() => void removeRecipient(savedRecipient.id)}
                            aria-label={`Remove ${recipientDisplayName(savedRecipient)}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </section>
        </div>
      </section>

      <div className="ai-chat-shell">
        {chatOpen && (
          <section className="ai-chat-panel surface-panel" aria-label="PocketRail AI assistant">
            <div className="panel-head">
              <div>
                <p className="eyebrow">PocketRail AI</p>
                <h3>Transfer assistant</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setChatOpen(false)}
                aria-label="Close AI chat"
              >
                <X size={16} />
              </button>
            </div>

            <div className="ai-chat-messages" ref={chatMessagesRef}>
              {chatMessages.map((message) => (
                <article
                  key={message.id}
                  className={message.role === "assistant" ? "ai-chat-message assistant" : "ai-chat-message user"}
                >
                  <p>{message.content}</p>
                  {message.transferProposal && (
                    <div className="ai-transfer-card">
                      <strong>Transfer ready for review</strong>
                      <small>
                        {formatCurrency(Number(message.transferProposal.amountNzd), "NZD", "NZ")} to @
                        {message.transferProposal.prepared.recipient.username}
                      </small>
                      <small>{shortAddress(message.transferProposal.fromWalletAddress)} paying wallet</small>
                      <small>Confirmation is still required before wallet signing.</small>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void reviewAiTransfer(message.transferProposal as AiTransferProposal)}
                      >
                        <BadgeCheck size={15} /> Review transfer
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {chatBusy && (
                <div className="ai-chat-message assistant">
                  <p>Thinking through your transfer request...</p>
                </div>
              )}
            </div>

            {chatError && <p className="error">{chatError}</p>}

            <form className="ai-chat-composer" onSubmit={submitAiChat}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Send 25 dNZD to Mum"
                disabled={chatBusy}
              />
              <button type="submit" className="primary" disabled={chatBusy || !chatInput.trim()}>
                {chatBusy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                Ask AI
              </button>
            </form>
          </section>
        )}

        <button
          type="button"
          className="ai-chat-trigger primary"
          onClick={() => setChatOpen((current) => !current)}
          aria-label="Open PocketRail AI assistant"
        >
          <MessageCircle size={18} />
        </button>
      </div>

      {transferConfirmation && (
        <div className="confirmation-overlay" role="presentation">
          <div className="confirmation-modal surface-panel" role="dialog" aria-modal="true" aria-labelledby="transfer-confirmation-title">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Confirm transfer</p>
                <h3 id="transfer-confirmation-title">Review before sending money</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setTransferConfirmation(null);
                  setConfirmationError("");
                }}
                aria-label="Close transfer confirmation"
              >
                <X size={16} />
              </button>
            </div>

            <div className="confirmation-grid">
              <div className="profile-box">
                <span className="section-label">Recipient</span>
                <strong>{transferConfirmation.prepared.recipient.name}</strong>
                <small>@{transferConfirmation.prepared.recipient.username}</small>
                <small>{shortAddress(transferConfirmation.prepared.recipientWalletAddress)}</small>
              </div>

              <div className="profile-box">
                <span className="section-label">Amount</span>
                <strong>{formatCurrency(transferConfirmation.amountValue, "NZD", "NZ")} dNZD</strong>
                <small>{formatCurrency(confirmationDisplayAmount, displayCurrency, user.regionCode)} {displayCurrency}</small>
                <small>{transferConfirmation.source === "ai" ? "Prepared by AI assistant" : "Prepared manually"}</small>
              </div>

              <div className="profile-box">
                <span className="section-label">Pay from</span>
                <strong>{shortAddress(transferConfirmation.fromWalletAddress)}</strong>
                <small>Base Sepolia</small>
                <small>dNZD transfer with wallet signature</small>
              </div>
            </div>

            <p className="muted-copy">
              PocketRail will ask your selected Privy-connected wallet to sign this transfer after you confirm. This review step is shown for both manual and AI-assisted payments.
            </p>

            {confirmationError && <p className="error">{confirmationError}</p>}

            <div className="confirmation-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setTransferConfirmation(null);
                  setConfirmationError("");
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void confirmTransfer()} disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : <BadgeCheck size={18} />}
                Confirm and continue
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </>
  );
}

function dashboardTitle(view: DashboardView, name: string) {
  switch (view) {
    case "pay":
      return "Send a payment";
    case "activity":
      return "Transaction history";
    case "profile":
      return "Manage your account";
    default:
      return "Overview";
  }
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

function walletLabel(walletAddress: string, user: User) {
  const labels: string[] = [shortAddress(walletAddress)];

  if (user.walletAddress && walletAddress.toLowerCase() === user.walletAddress.toLowerCase()) {
    labels.push("Account");
  }

  return labels.join(" · ");
}

function recipientDisplayName(recipient: SavedRecipient) {
  return recipient.nickname || recipient.name;
}

function buildBalanceTimeline(
  transactions: WalletTransaction[],
  currentBalanceDisplay: number,
  rate: number,
) {
  const now = Date.now();
  const dnzdTransfers = [...transactions]
    .filter((transaction) => transaction.symbol === "dNZD" && Number.isFinite(Number(transaction.amount)))
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  const recentDnzTransfers = dnzdTransfers.slice(-8);

  if (recentDnzTransfers.length === 0) {
    const earlier = new Date(now - 1000 * 60 * 60 * 24).toISOString();
    const nowIso = new Date(now).toISOString();
    return [
      {
        id: `${earlier}-starting`,
        label: formatTimelineAxis(earlier, now),
        detail: formatTimelineDetail(earlier),
        balance: currentBalanceDisplay,
      },
      {
        id: "now",
        label: "Now",
        detail: formatTimelineDetail(nowIso),
        balance: currentBalanceDisplay,
      },
    ] satisfies BalanceTimelinePoint[];
  }

  let runningBalance = currentBalanceDisplay;
  const points: BalanceTimelinePoint[] = [
    {
      id: "now",
      label: "Now",
      detail: formatTimelineDetail(new Date(now).toISOString()),
      balance: currentBalanceDisplay,
    },
  ];

  for (let index = recentDnzTransfers.length - 1; index >= 0; index -= 1) {
    const transaction = recentDnzTransfers[index];
    const amount = Number(transaction.amount) * rate;
    if (transaction.direction === "incoming") {
      runningBalance -= amount;
    } else if (transaction.direction === "outgoing") {
      runningBalance += amount;
    }
    points.push({
      id: `${transaction.chainId}-${transaction.hash}-history`,
      label: formatTimelineAxis(transaction.timestamp, now),
      detail: formatTimelineDetail(transaction.timestamp),
      balance: runningBalance,
    });
  }

  points.push({
    id: `${recentDnzTransfers[0].hash}-starting`,
    label: "Start",
    detail: `Balance before ${formatTimelineDetail(recentDnzTransfers[0].timestamp)}`,
    balance: runningBalance,
  });

  return points.reverse();
}

function formatTimelineAxis(timestamp: string, now = Date.now()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Recent";
  if (now - date.getTime() <= 1000 * 60 * 60 * 24) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimelineDetail(timestamp: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Recent";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function BalanceChartTooltip({
  active,
  payload,
  regionCode,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: BalanceTimelinePoint }>;
  regionCode: string;
  currency: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="balance-chart-tooltip">
      <strong>{formatCurrency(point.balance, currency, regionCode)} {currency}</strong>
      <span>{point.detail}</span>
    </div>
  );
}

function uniqueAddresses(addresses: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const address of addresses) {
    if (!address) continue;
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(address);
  }

  return result;
}
