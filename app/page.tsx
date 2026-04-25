"use client";

import { BrowserProvider, Contract, parseUnits } from "ethers";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
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

type WalletFormState = {
  walletAddress: string;
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

type DashboardView = "overview" | "pay" | "activity" | "profile";

const BASE_SEPOLIA_CHAIN_ID = 84532;
const BASE_SEPOLIA_CHAIN_HEX = "0x14a34";
const BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";
const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org/tx/";
const erc20BalanceAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];
const DASHBOARD_VIEWS: { id: DashboardView; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Balance and shortcuts" },
  { id: "pay", label: "Pay", hint: "Send dNZD" },
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
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [availableWallets, setAvailableWallets] = useState<string[]>([]);
  const [selectedWalletAddress, setSelectedWalletAddress] = useState("");
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
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [contactEditMode, setContactEditMode] = useState(false);
  const [walletEditMode, setWalletEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    name: "",
    username: "",
    email: "",
    regionCode: "NZ",
  });
  const [walletForm, setWalletForm] = useState<WalletFormState>({ walletAddress: "" });
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletStatus, setWalletStatus] = useState("");
  const [walletError, setWalletError] = useState("");
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
    void loadBrowserWallets();

    const ethereum = window.ethereum;
    if (!ethereum?.on) return;

    const onAccountsChanged = (accounts: string[]) => {
      const nextWallets = uniqueAddresses(accounts);
      setAvailableWallets(nextWallets);
      setSelectedWalletAddress((current) => {
        if (current && nextWallets.some((address) => address.toLowerCase() === current.toLowerCase())) {
          return current;
        }
        return nextWallets[0] || current;
      });
    };

    ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void loadFx(user.regionCode);
  }, [user?.regionCode]);

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
    setWalletForm({
      walletAddress: user.linkedWalletAddress || user.walletAddress || "",
    });
    setWalletEditMode(false);
    void loadAutomation();
  }, [user?.id]);

  useEffect(() => {
    setRecipientNicknameDrafts(
      Object.fromEntries(savedRecipients.map((savedRecipient) => [savedRecipient.id, savedRecipient.nickname || ""])),
    );
  }, [savedRecipients]);

  useEffect(() => {
    if (!selectedWalletAddress && walletOptions.length > 0) {
      setSelectedWalletAddress(walletOptions[0]);
    }
  }, [selectedWalletAddress, user?.linkedWalletAddress, user?.walletAddress, availableWallets]);

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
      setActiveView("overview");
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

  async function loadBrowserWallets(prompt = false) {
    try {
      if (!window.ethereum?.request) {
        setAvailableWallets([]);
        return;
      }
      const accounts = (await window.ethereum.request({
        method: prompt ? "eth_requestAccounts" : "eth_accounts",
      })) as string[];
      const nextWallets = uniqueAddresses(accounts);
      setAvailableWallets(nextWallets);
      setSelectedWalletAddress((current) => current || nextWallets[0] || current);
    } catch (err) {
      if (prompt) {
        setSendError(err instanceof Error ? err.message : "Could not connect wallet");
      }
    }
  }

  async function connectWalletForProfile() {
    setWalletError("");
    setWalletStatus("");
    try {
      if (!window.ethereum?.request) {
        throw new Error("No browser wallet found. Paste your wallet address instead.");
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.[0]) {
        throw new Error("No wallet account selected.");
      }
      setWalletForm({ walletAddress: accounts[0] });
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Could not connect wallet");
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
      setAutomationError("Enter a username or wallet address to save a recipient.");
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

  async function saveLinkedWallet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWalletBusy(true);
    setWalletError("");
    setWalletStatus("");
    try {
      const data = await api<{ user: User }>("/api/wallet/link", {
        walletAddress: walletForm.walletAddress,
      });
      setUser(data.user);
      setWalletEditMode(false);
      setWalletStatus("Linked wallet updated.");
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Could not update linked wallet");
    } finally {
      setWalletBusy(false);
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
    if (!window.ethereum?.request) {
      throw new Error("No browser wallet found. Open this app in a wallet browser or install MetaMask.");
    }
    const prepared = confirmation.prepared;

    await switchToBaseSepolia();
    const provider = new BrowserProvider(window.ethereum);
    const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
    const selected = accounts.find((account) => account.toLowerCase() === walletAddress.toLowerCase());
    if (!selected) {
      throw new Error(`Connect or switch to ${shortAddress(walletAddress)} in your browser wallet first.`);
    }

    const signer = await provider.getSigner(selected);
    const token = new Contract(prepared.token.address, erc20BalanceAbi, signer);
    const amountRaw = parseUnits(confirmation.amountNzd, prepared.token.decimals);
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
      recipient: confirmation.recipientInput,
      amountNzd: confirmation.amountNzd,
      txHash: receipt.hash,
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
      await Promise.all([loadTransactions(), loadBalances()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send money";
      setConfirmationError(message);
      setSendError(message);
    } finally {
      setBusy(false);
    }
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
    setProfileEditMode(false);
    setContactEditMode(false);
    setWalletEditMode(false);
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
    setWalletError("");
    setWalletStatus("");
    setConfirmationError("");
    setActiveView("overview");
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
  const walletOptions = uniqueAddresses([
    user?.linkedWalletAddress || "",
    user?.walletAddress || "",
    ...availableWallets,
  ]);
  const activePaymentWallet = selectedWalletAddress || walletOptions[0] || "";
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

  if (loadingUser) {
    return (
      <main className="center-screen app-background">
        <div className="loading-orb">
          <Loader2 className="spin" />
        </div>
        <span>Loading PocketRail...</span>
      </main>
    );
  }

  if (!user) {
    return (
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
          <div className="showcase-metrics">
            <div>
              <strong>dNZD</strong>
              <span>Settlement asset</span>
            </div>
            <div>
              <strong>Base</strong>
              <span>Sepolia testnet</span>
            </div>
            <div>
              <strong>Live FX</strong>
              <span>Localized display</span>
            </div>
          </div>
        </section>

        <section className="auth-card surface-panel">
          <div className="auth-card-head">
            <div>
              <p className="eyebrow">Access PocketRail</p>
              <h2>{authMode === "register" ? "Create your account" : "Welcome back"}</h2>
            </div>
            <div className="segmented">
              <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
              <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Log in</button>
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
                    <strong>{shortAmount(gasBalanceEth)} ETH</strong>
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
                        <option value="">Connect a browser wallet</option>
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
                      <small>{shortAmount(gasBalanceEth)} ETH gas balance</small>
                    </div>
                    <button className="secondary" type="button" onClick={() => void loadBrowserWallets(true)}>
                      <Wallet size={16} /> Connect browser wallet
                    </button>
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
                          {recipientDisplayName(savedRecipient)} (@{savedRecipient.username})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Recipient name or Wallet address
                    <input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="@username or wallet address"
                      required
                    />
                  </label>

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
                    <h3>Edit wallet</h3>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (walletEditMode) {
                        setWalletForm({
                          walletAddress: user.linkedWalletAddress || user.walletAddress || "",
                        });
                        setWalletEditMode(false);
                        setWalletError("");
                        setWalletStatus("");
                        return;
                      }
                      setWalletEditMode(true);
                    }}
                  >
                    {walletEditMode ? <X size={16} /> : <Pencil size={16} />}
                    {walletEditMode ? "Cancel" : "Edit"}
                  </button>
                </div>

                <form className="profile-box profile-panel" onSubmit={saveLinkedWallet}>
                  <div className="wallet-summary">
                    <strong>{shortAddress(user.linkedWalletAddress || user.walletAddress || "")}</strong>
                    <small>Currently linked wallet</small>
                    {user.ensName && <small>{user.ensName}</small>}
                  </div>

                  {walletEditMode && (
                    <div className="stack compact-stack">
                      <button className="secondary" type="button" onClick={() => void connectWalletForProfile()}>
                        <Wallet size={16} /> Connect browser wallet
                      </button>
                      <label>
                        Wallet address
                        <input
                          value={walletForm.walletAddress}
                          onChange={(event) => setWalletForm({ walletAddress: event.target.value })}
                          placeholder="0x..."
                          disabled={walletBusy}
                        />
                      </label>
                    </div>
                  )}

                  {walletError && <p className="error">{walletError}</p>}
                  {walletStatus && <p className="success">{walletStatus}</p>}

                  {walletEditMode && (
                    <button className="primary" disabled={walletBusy}>
                      {walletBusy ? <Loader2 className="spin" size={18} /> : <BadgeCheck size={18} />}
                      Save linked wallet
                    </button>
                  )}
                </form>

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
              PocketRail will ask your linked wallet to sign this transfer after you confirm. This review step is shown for both manual and AI-assisted payments.
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

  if (user.linkedWalletAddress && walletAddress.toLowerCase() === user.linkedWalletAddress.toLowerCase()) {
    labels.push("Linked");
  }
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
