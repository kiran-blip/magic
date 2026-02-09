"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────── */

interface UserProfile {
  riskTolerance: "conservative" | "moderate" | "aggressive";
  capitalRange: "under_5k" | "5k_50k" | "50k_500k" | "over_500k";
  focusAreas: Array<"stocks" | "crypto" | "business" | "real_estate" | "all">;
  experienceLevel: "beginner" | "intermediate" | "advanced";
}

interface PublicConfig {
  setupComplete: boolean;
  hasAnthropicKey: boolean;
  hasOpenrouterKey: boolean;
  anthropicKeyHint: string;
  openrouterKeyHint: string;
  routingMode: string;
  preferences: {
    defaultAgent: string;
    enableDisclaimers: boolean;
    enableSafetyGovernor: boolean;
    enablePersonality: boolean;
  };
  userProfile?: UserProfile;
  createdAt: string;
  updatedAt: string;
  envOnly: boolean;
}

interface BrokerAccount {
  id?: string;
  accountNumber?: string;
  status?: string;
  portfolioValue: number;
  buyingPower: number;
  cash: number;
  equity: number;
}

interface BrokerStatus {
  connected: boolean;
  tradingMode?: "paper" | "live";
  tradingEnabled?: boolean;
  hasCredentials?: boolean;
  account?: BrokerAccount;
  market?: { isOpen: boolean; nextOpen?: string; nextClose?: string };
  riskLimits?: {
    maxPositionPercent: number;
    maxDailyLossPercent: number;
    maxDailyTrades: number;
    requireApprovalAbove: number;
    allowShortSelling: boolean;
    allowMarginTrading: boolean;
  };
  error?: string;
}

/* ── Constants ──────────────────────────────────────────── */

type BrokerProvider =
  | "alpaca" | "ibkr" | "questrade" | "tradier" | "etoro"
  | "trading212" | "saxo" | "oanda" | "pepperstone" | "ig" | "simulator";

interface BrokerOption {
  id: BrokerProvider;
  name: string;
  desc: string;
  regions: string;
  status: "available" | "coming_soon";
  signupUrl?: string;
  note?: string;
  steps: Array<{ step: number; title: string; desc: string }>;
}

const BROKER_OPTIONS: BrokerOption[] = [
  // ── Available now ──────────────────────────────────────
  {
    id: "alpaca",
    name: "Alpaca",
    desc: "Commission-free API-first broker with instant paper trading",
    regions: "US, AU, DE, HK, IN, JP, MY, SG, ZA, AE, UK + paper globally",
    status: "available",
    signupUrl: "https://app.alpaca.markets/signup",
    note: "Live trading in select countries. Paper trading API available globally — best for getting started.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up free at Alpaca — no deposit needed for paper trading" },
      { step: 2, title: "Get API keys", desc: "Go to Paper Trading dashboard → API Keys → Generate New Key" },
      { step: 3, title: "Paste below", desc: "Enter your API key & secret — they're encrypted before storage" },
    ],
  },
  // ── Coming soon — Global ───────────────────────────────
  {
    id: "ibkr",
    name: "Interactive Brokers",
    desc: "Institutional-grade broker — 170 markets across 40 countries",
    regions: "Global — US, Canada, EU, UK, Asia, AU, 200+ countries",
    status: "coming_soon",
    signupUrl: "https://www.interactivebrokers.com/en/trading/free-trial.php",
    note: "Best for Canada. IBKR Canada (CIRO member). API works for US stocks. Canadian equities have API restrictions (IIROC DMR 3200).",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up for an IBKR paper trading account (free)" },
      { step: 2, title: "Enable API", desc: "In TWS/IB Gateway → Edit → Global Config → API → Settings" },
      { step: 3, title: "Connect", desc: "Gold Digger connects via TWS API on localhost" },
    ],
  },
  {
    id: "oanda",
    name: "OANDA",
    desc: "Forex & CFD broker with REST API — divisions in 6+ regions",
    regions: "US, Canada, EU, UK, AU, Japan, Singapore, Africa, Middle East, Latin America, SE Asia",
    status: "coming_soon",
    signupUrl: "https://www.oanda.com/apply/",
    note: "One of the widest global footprints. Covers Africa (Kenya, Egypt, South Africa+), Middle East (UAE), and Latin America. REST v20 API with streaming.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up via your regional OANDA division (demo account free)" },
      { step: 2, title: "Get API token", desc: "Go to Manage API Access in your account settings" },
      { step: 3, title: "Connect", desc: "Enter your API token and account ID below" },
    ],
  },
  {
    id: "etoro",
    name: "eToro",
    desc: "Social trading platform with public API — stocks, crypto, ETFs",
    regions: "76+ countries — US, UK, EU, UAE, Latin America, SE Asia, AU",
    status: "coming_soon",
    signupUrl: "https://www.etoro.com/",
    note: "Public APIs launched 2025. Supports algo trading, social analytics, CopyTrader. Not available in Canada, China, India, Japan, Russia.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up at eToro (76+ countries supported)" },
      { step: 2, title: "Get API access", desc: "Apply for Public API access via developer portal" },
      { step: 3, title: "Connect", desc: "Enter your API credentials to connect" },
    ],
  },
  {
    id: "saxo",
    name: "Saxo Bank",
    desc: "Premium multi-asset broker with OpenAPI — 40,000+ instruments",
    regions: "EU, UK, Switzerland, Middle East (UAE, Saudi, Qatar, Israel), Asia (HK, JP, SG, MY, TH)",
    status: "coming_soon",
    signupUrl: "https://www.home.saxo/",
    note: "OpenAPI with streaming quotes, order placement, and portfolio management. 40,000+ tradeable instruments across all asset classes.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up at Saxo Bank (demo account available)" },
      { step: 2, title: "Register app", desc: "Register your application on the Saxo Developer Portal" },
      { step: 3, title: "Authorize", desc: "Complete OAuth flow to connect Gold Digger" },
    ],
  },
  {
    id: "ig",
    name: "IG Group",
    desc: "World's largest CFD & spread betting broker with REST/streaming API",
    regions: "UK, EU, AU, Singapore, Japan, South Africa, UAE, US (limited)",
    status: "coming_soon",
    signupUrl: "https://www.ig.com/",
    note: "Highest trust score globally. 17,000+ markets. REST API with streaming. Demo account available for testing.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up at IG (demo account free in most regions)" },
      { step: 2, title: "Get API key", desc: "Generate an API key from your account settings" },
      { step: 3, title: "Connect", desc: "Enter your API key and account credentials" },
    ],
  },
  {
    id: "pepperstone",
    name: "Pepperstone",
    desc: "Low-latency forex/CFD broker — FIX & cTrader Open API",
    regions: "AU, UK, EU, Middle East, Kenya, South Africa",
    status: "coming_soon",
    signupUrl: "https://pepperstone.com/",
    note: "ASIC regulated. ~30ms execution latency. Razor account with raw spreads from 0.0 pips. FIX protocol for institutional-grade automation.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up at Pepperstone (demo account free)" },
      { step: 2, title: "Choose platform", desc: "Select cTrader (Open API) or MT4/MT5 (Expert Advisors)" },
      { step: 3, title: "Connect", desc: "Configure API access via cTrader or FIX protocol" },
    ],
  },
  // ── Coming soon — Regional ─────────────────────────────
  {
    id: "tradier",
    name: "Tradier",
    desc: "Developer-focused US equities & options broker with OAuth API",
    regions: "US-based, accounts from 120+ countries (not Canada/UK/AU)",
    status: "coming_soon",
    signupUrl: "https://brokerage.tradier.com/signup",
    note: "REST API with OAuth 2.0. No minimum deposit. Commission-free equity trades. EU residents cannot trade US ETFs.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up at Tradier (sandbox account free for testing)" },
      { step: 2, title: "Get API token", desc: "Generate an access token from the developer portal" },
      { step: 3, title: "Connect", desc: "Enter your OAuth token to connect" },
    ],
  },
  {
    id: "questrade",
    name: "Questrade",
    desc: "Canadian broker with free API — account data and market data",
    regions: "Canada",
    status: "coming_soon",
    signupUrl: "https://www.questrade.com/self-directed-investing",
    note: "API trade execution limited to partner developers. Account data and market data APIs are open to all users.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up for a Questrade account (Canadian residents)" },
      { step: 2, title: "Register API app", desc: "Visit questrade.com/api and register your application" },
      { step: 3, title: "Authorize", desc: "Generate an OAuth token to connect Gold Digger" },
    ],
  },
  {
    id: "trading212",
    name: "Trading 212",
    desc: "Commission-free investing platform with public API (beta)",
    regions: "63 countries — EU, UK, AU",
    status: "coming_soon",
    signupUrl: "https://www.trading212.com/",
    note: "Public API in beta. Supports Invest and Stocks ISA accounts. Market orders only via API during beta. Commission-free stock and ETF trading.",
    steps: [
      { step: 1, title: "Create account", desc: "Sign up at Trading 212 (available in 63 countries)" },
      { step: 2, title: "Generate API key", desc: "Go to Settings → API → Generate key pair" },
      { step: 3, title: "Connect", desc: "Enter your API key and secret to connect" },
    ],
  },
  // ── Built-in — Everywhere ──────────────────────────────
  {
    id: "simulator",
    name: "Built-in Simulator",
    desc: "No account needed — simulated trading with real market data",
    regions: "Available everywhere",
    status: "coming_soon",
    note: "Perfect for learning, testing, or regions without broker API access. Uses real-time market data with simulated order execution.",
    steps: [
      { step: 1, title: "Set capital", desc: "Choose your starting virtual balance (default: $100,000)" },
      { step: 2, title: "Start trading", desc: "Fleet uses real market data with simulated order execution" },
      { step: 3, title: "Track results", desc: "Performance tracked internally — migrate to live broker anytime" },
    ],
  },
];

/* ── Component ──────────────────────────────────────────── */

export default function GoldDiggerSettings() {
  const router = useRouter();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // LLM keys
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [routingMode, setRoutingMode] = useState("auto");
  const [enableDisclaimers, setEnableDisclaimers] = useState(true);
  const [enableSafety, setEnableSafety] = useState(true);
  const [enablePersonality, setEnablePersonality] = useState(true);

  // Investor profile
  const [riskTolerance, setRiskTolerance] = useState<UserProfile["riskTolerance"]>("moderate");
  const [capitalRange, setCapitalRange] = useState<UserProfile["capitalRange"]>("5k_50k");
  const [focusAreas, setFocusAreas] = useState<UserProfile["focusAreas"]>(["stocks"]);
  const [experienceLevel, setExperienceLevel] = useState<UserProfile["experienceLevel"]>("beginner");

  // Broker state
  const [brokerProvider, setBrokerProvider] = useState<BrokerProvider>("alpaca");
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatus | null>(null);
  const [alpacaKey, setAlpacaKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [brokerConnecting, setBrokerConnecting] = useState(false);
  const [brokerDisconnecting, setBrokerDisconnecting] = useState(false);
  const [brokerError, setBrokerError] = useState("");
  const [brokerSuccess, setBrokerSuccess] = useState("");

  // General save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  function toggleFocusArea(area: UserProfile["focusAreas"][number]) {
    if (area === "all") { setFocusAreas(["all"]); return; }
    setFocusAreas((prev) => {
      const without = prev.filter((a) => a !== "all");
      if (without.includes(area)) {
        const result = without.filter((a) => a !== area);
        return result.length === 0 ? ["stocks"] : result;
      }
      return [...without, area];
    });
  }

  /* ── Load config + broker status ─────────────────────── */

  const loadBroker = useCallback(async () => {
    try {
      const res = await fetch("/api/golddigger/broker");
      if (res.ok) {
        const data = await res.json();
        setBrokerStatus(data);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/golddigger/settings");
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setRoutingMode(data.routingMode || "auto");
          setEnableDisclaimers(data.preferences?.enableDisclaimers ?? true);
          setEnableSafety(data.preferences?.enableSafetyGovernor ?? true);
          setEnablePersonality(data.preferences?.enablePersonality ?? true);
          if (data.userProfile) {
            setRiskTolerance(data.userProfile.riskTolerance ?? "moderate");
            setCapitalRange(data.userProfile.capitalRange ?? "5k_50k");
            setFocusAreas(data.userProfile.focusAreas ?? ["stocks"]);
            setExperienceLevel(data.userProfile.experienceLevel ?? "beginner");
          }
        }
      } catch { setError("Failed to load settings"); }
      setLoading(false);
    }
    load();
    loadBroker();
  }, [loadBroker]);

  /* ── Key validation ──────────────────────────────────── */

  function validateKeyLocally(provider: "anthropic" | "openrouter", key: string): string | null {
    const trimmed = key.trim();
    if (!trimmed) return null;
    if (trimmed.length < 20) return `Key is too short — did you paste the full ${provider === "anthropic" ? "Anthropic" : "OpenRouter"} key?`;
    if (provider === "anthropic" && !trimmed.startsWith("sk-ant-")) return "Anthropic keys start with 'sk-ant-'. Check you pasted the right key.";
    if (provider === "openrouter" && !trimmed.startsWith("sk-or-")) return "OpenRouter keys start with 'sk-or-'. Check you pasted the right key.";
    if (/\s{2,}/.test(trimmed) || trimmed.split(" ").length > 3) return "This doesn't look like an API key — API keys don't contain spaces.";
    return null;
  }

  /* ── Broker connect / disconnect ─────────────────────── */

  async function connectBroker() {
    if (!alpacaKey.trim() || !alpacaSecret.trim()) {
      setBrokerError("Both API key and secret are required");
      return;
    }
    setBrokerConnecting(true);
    setBrokerError("");
    setBrokerSuccess("");

    try {
      const res = await fetch("/api/golddigger/broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: alpacaKey.trim(),
          apiSecret: alpacaSecret.trim(),
          tradingMode: "paper",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBrokerError(data.error || "Connection failed");
      } else {
        setBrokerSuccess(`Connected to Alpaca paper trading`);
        setAlpacaKey("");
        setAlpacaSecret("");
        await loadBroker();
        setTimeout(() => setBrokerSuccess(""), 5000);
      }
    } catch {
      setBrokerError("Failed to connect — check your network");
    }
    setBrokerConnecting(false);
  }

  async function disconnectBrokerAction() {
    setBrokerDisconnecting(true);
    setBrokerError("");
    setBrokerSuccess("");
    try {
      const res = await fetch("/api/golddigger/broker", { method: "DELETE" });
      if (res.ok) {
        setBrokerSuccess("Broker disconnected");
        await loadBroker();
        setTimeout(() => setBrokerSuccess(""), 3000);
      }
    } catch {
      setBrokerError("Failed to disconnect");
    }
    setBrokerDisconnecting(false);
  }

  /* ── Save general settings ───────────────────────────── */

  async function saveSettings() {
    setSaving(true);
    setError("");
    setSaved(false);
    setWarning("");

    if (anthropicKey.trim()) {
      const err = validateKeyLocally("anthropic", anthropicKey);
      if (err) { setError(err); setSaving(false); return; }
    }
    if (openrouterKey.trim()) {
      const err = validateKeyLocally("openrouter", openrouterKey);
      if (err) { setError(err); setSaving(false); return; }
    }

    try {
      const body: Record<string, unknown> = {
        routingMode,
        preferences: {
          defaultAgent: "auto",
          enableDisclaimers,
          enableSafetyGovernor: enableSafety,
          enablePersonality,
        },
        userProfile: { riskTolerance, capitalRange, focusAreas, experienceLevel },
      };
      if (anthropicKey.trim()) body.anthropicApiKey = anthropicKey.trim();
      if (openrouterKey.trim()) body.openrouterApiKey = openrouterKey.trim();

      const res = await fetch("/api/golddigger/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        setSaved(true);
        setConfig(data.config);
        setAnthropicKey("");
        setOpenrouterKey("");
        if (data.warning) { setWarning(data.warning); setTimeout(() => setWarning(""), 8000); }
        setTimeout(() => setSaved(false), 5000);
      }
    } catch { setError("Failed to save settings"); }
    setSaving(false);
  }

  /* ── Helpers ─────────────────────────────────────────── */

  function fmt$(v: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
  }

  /* ── Render ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
        <div className="text-muted text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gold Digger Settings</h1>
          <p className="text-sm text-muted mt-1">Configure your AI fleet, broker, and preferences</p>
        </div>
        <Link
          href="/dashboard/gold-digger"
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Back to chat
        </Link>
      </div>

      {/* ── Railway env-only notice ────────────────────── */}
      {config?.envOnly && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm">
          <div className="font-medium text-warning mb-1">Environment Variable Mode</div>
          <div className="text-muted text-xs">
            Config changes {"won't"} persist across deploys. To make settings permanent, set environment variables in your Railway dashboard
            or attach a Railway Volume at /app/data.
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ── BROKER CONNECTION ─────────────────────────── */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">

        {/* Section header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">Trading Broker</div>
            <p className="text-xs text-muted mt-0.5">
              Connect a brokerage account to enable autonomous paper trading
            </p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
            brokerStatus?.connected
              ? "bg-success/10 text-success border-success/20"
              : "bg-muted/10 text-muted border-border"
          }`}>
            {brokerStatus?.connected ? `${brokerStatus.tradingMode} connected` : "not connected"}
          </span>
        </div>

        {/* Connected state — account info */}
        {brokerStatus?.connected && brokerStatus.account && (
          <div className="px-5 py-4 border-b border-border">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider">Portfolio</p>
                <p className="text-sm font-semibold text-foreground">{fmt$(brokerStatus.account.portfolioValue)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider">Buying Power</p>
                <p className="text-sm font-semibold text-foreground">{fmt$(brokerStatus.account.buyingPower)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider">Cash</p>
                <p className="text-sm font-semibold text-success">{fmt$(brokerStatus.account.cash)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider">Market</p>
                <p className={`text-sm font-semibold ${brokerStatus.market?.isOpen ? "text-success" : "text-muted"}`}>
                  {brokerStatus.market?.isOpen ? "Open" : "Closed"}
                </p>
              </div>
            </div>

            {/* Risk limits summary */}
            {brokerStatus.riskLimits && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Risk Limits</p>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] px-2 py-1 rounded bg-background border border-border text-muted">
                    Max position: {brokerStatus.riskLimits.maxPositionPercent}%
                  </span>
                  <span className="text-[10px] px-2 py-1 rounded bg-background border border-border text-muted">
                    Daily loss cap: {brokerStatus.riskLimits.maxDailyLossPercent}%
                  </span>
                  <span className="text-[10px] px-2 py-1 rounded bg-background border border-border text-muted">
                    Max trades/day: {brokerStatus.riskLimits.maxDailyTrades}
                  </span>
                  <span className="text-[10px] px-2 py-1 rounded bg-background border border-border text-muted">
                    Approval: All orders
                  </span>
                </div>
              </div>
            )}

            {/* Disconnect */}
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <div className="text-xs text-muted">
                Mode: <span className="text-foreground font-medium capitalize">{brokerStatus.tradingMode}</span>
                {brokerStatus.account.accountNumber && (
                  <span className="ml-2 text-muted/60">Account: ...{brokerStatus.account.accountNumber.slice(-4)}</span>
                )}
              </div>
              <button
                onClick={disconnectBrokerAction}
                disabled={brokerDisconnecting}
                className="px-3 py-1.5 text-xs text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {brokerDisconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        )}

        {/* Not connected — provider selector + connect form */}
        {(!brokerStatus || !brokerStatus.connected) && (
          <div className="px-5 py-4 space-y-5">

            {/* Provider selector */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-foreground">
                  Choose your broker — each user needs their own trading account
                </p>
                <span className="text-[10px] text-muted">{BROKER_OPTIONS.length} providers</span>
              </div>

              {/* Available now */}
              <div className="mb-3">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Available now</p>
                <div className="grid grid-cols-1 gap-2">
                  {BROKER_OPTIONS.filter(b => b.status === "available").map(b => (
                    <button
                      key={b.id}
                      onClick={() => setBrokerProvider(b.id)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        brokerProvider === b.id
                          ? "border-accent bg-accent/5"
                          : "border-border bg-background hover:border-accent/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">{b.name}</span>
                        {brokerProvider === b.id && <div className="w-2 h-2 rounded-full bg-accent" />}
                      </div>
                      <p className="text-[10px] text-muted leading-relaxed">{b.desc}</p>
                      <p className="text-[10px] text-muted/60 mt-1">{b.regions}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Coming soon — scrollable grid */}
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Coming soon</p>
                <div className="max-h-64 overflow-y-auto pr-1 space-y-2 scrollbar-thin">
                  {BROKER_OPTIONS.filter(b => b.status === "coming_soon").map(b => (
                    <div
                      key={b.id}
                      className="p-3 rounded-lg border border-border bg-background/50 opacity-70"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">{b.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                          soon
                        </span>
                      </div>
                      <p className="text-[10px] text-muted leading-relaxed">{b.desc}</p>
                      <p className="text-[10px] text-muted/60 mt-1">{b.regions}</p>
                      {b.note && (
                        <p className="text-[10px] text-amber-400/70 mt-1.5 leading-relaxed">{b.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Setup guide for selected provider */}
            {(() => {
              const selected = BROKER_OPTIONS.find(b => b.id === brokerProvider);
              if (!selected || selected.status === "coming_soon") return null;
              return (
                <div className="bg-background border border-border rounded-lg p-4">
                  <p className="text-xs font-medium text-foreground mb-3">
                    Set up {selected.name} paper trading:
                  </p>
                  <div className="space-y-3">
                    {selected.steps.map(s => (
                      <div key={s.step} className="flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-[10px] font-bold text-accent shrink-0 mt-0.5">
                          {s.step}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{s.title}</p>
                          <p className="text-[11px] text-muted">{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selected.signupUrl && (
                    <a
                      href={selected.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      Open {selected.name} signup
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  )}
                </div>
              );
            })()}

            {/* Alpaca connection form */}
            {brokerProvider === "alpaca" && (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Alpaca API Key</label>
                    <input
                      type="password"
                      value={alpacaKey}
                      onChange={e => { setAlpacaKey(e.target.value); setBrokerError(""); }}
                      placeholder="PK... (from your Alpaca paper trading dashboard)"
                      className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Alpaca Secret Key</label>
                    <input
                      type="password"
                      value={alpacaSecret}
                      onChange={e => { setAlpacaSecret(e.target.value); setBrokerError(""); }}
                      placeholder="Your Alpaca secret key"
                      className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                  Paper trading mode — uses simulated funds, no real money at risk
                </div>
              </>
            )}

            {/* Error / success */}
            {brokerError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-xs text-red-400">
                {brokerError}
              </div>
            )}
            {brokerSuccess && (
              <div className="bg-success/10 border border-success/20 rounded-lg px-4 py-2.5 text-xs text-success">
                {brokerSuccess}
              </div>
            )}

            {/* Connect button */}
            {brokerProvider === "alpaca" && (
              <button
                onClick={connectBroker}
                disabled={brokerConnecting || !alpacaKey.trim() || !alpacaSecret.trim()}
                className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {brokerConnecting ? "Testing connection..." : "Connect to Alpaca Paper Trading"}
              </button>
            )}

            {/* Coming soon notice for other providers */}
            {brokerProvider !== "alpaca" && (
              <div className="bg-accent/5 border border-accent/20 rounded-lg px-4 py-3 text-center">
                <p className="text-xs text-accent font-medium">
                  {BROKER_OPTIONS.find(b => b.id === brokerProvider)?.name} integration coming soon
                </p>
                <p className="text-[11px] text-muted mt-1">
                  Use Alpaca for now, or switch when this provider is available
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error from auto-reconnect */}
        {brokerStatus?.error && !brokerStatus.connected && (
          <div className="px-5 pb-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-xs text-red-400">
              Last connection error: {brokerStatus.error}
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* ── LLM CONNECTION STATUS ────────────────────── */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-foreground">AI Connection Status</div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
            config?.hasAnthropicKey || config?.hasOpenrouterKey
              ? "bg-success/10 text-success border-success/20"
              : "bg-warning/10 text-warning border-warning/20"
          }`}>
            {config?.hasAnthropicKey || config?.hasOpenrouterKey ? "configured" : "no keys"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">Anthropic</span>
            <span className={`text-xs ${config?.hasAnthropicKey ? "text-success" : "text-muted/50"}`}>
              {config?.hasAnthropicKey ? config.anthropicKeyHint : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">OpenRouter</span>
            <span className={`text-xs ${config?.hasOpenrouterKey ? "text-success" : "text-muted/50"}`}>
              {config?.hasOpenrouterKey ? config.openrouterKeyHint : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">Routing Mode</span>
            <span className="text-xs text-foreground">{config?.routingMode || "auto"}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">Last Updated</span>
            <span className="text-xs text-foreground">
              {config?.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : "Never"}
            </span>
          </div>
        </div>
      </div>

      {/* ── API Keys ──────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-foreground">Update LLM API Keys</div>
        <p className="text-xs text-muted">These power the fleet&apos;s AI brain. Leave blank to keep existing key.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Anthropic API Key</label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => { setAnthropicKey(e.target.value); setError(""); }}
              placeholder={config?.hasAnthropicKey ? `Current: ${config.anthropicKeyHint}` : "sk-ant-api03-..."}
              className={`w-full bg-background border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent ${
                anthropicKey.trim() && validateKeyLocally("anthropic", anthropicKey) ? "border-danger/50" : "border-border"
              }`}
            />
            {anthropicKey.trim() && validateKeyLocally("anthropic", anthropicKey) && (
              <p className="text-[11px] text-danger mt-1">{validateKeyLocally("anthropic", anthropicKey)}</p>
            )}
            {anthropicKey.trim() && !validateKeyLocally("anthropic", anthropicKey) && (
              <p className="text-[11px] text-success mt-1">Format looks valid</p>
            )}
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">OpenRouter API Key</label>
            <input
              type="password"
              value={openrouterKey}
              onChange={(e) => { setOpenrouterKey(e.target.value); setError(""); }}
              placeholder={config?.hasOpenrouterKey ? `Current: ${config.openrouterKeyHint}` : "sk-or-v1-..."}
              className={`w-full bg-background border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent ${
                openrouterKey.trim() && validateKeyLocally("openrouter", openrouterKey) ? "border-danger/50" : "border-border"
              }`}
            />
            {openrouterKey.trim() && validateKeyLocally("openrouter", openrouterKey) && (
              <p className="text-[11px] text-danger mt-1">{validateKeyLocally("openrouter", openrouterKey)}</p>
            )}
            {openrouterKey.trim() && !validateKeyLocally("openrouter", openrouterKey) && (
              <p className="text-[11px] text-success mt-1">Format looks valid</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Routing Mode ─────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-foreground">Routing Mode</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "auto", label: "Auto", disabled: false },
            { value: "hybrid", label: "Hybrid", disabled: !config?.hasAnthropicKey || !config?.hasOpenrouterKey },
            { value: "anthropic_only", label: "Anthropic Only", disabled: !config?.hasAnthropicKey },
            { value: "openrouter_only", label: "OpenRouter Only", disabled: !config?.hasOpenrouterKey },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => !opt.disabled && setRoutingMode(opt.value)}
              disabled={opt.disabled || !!config?.envOnly}
              className={`px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                opt.disabled
                  ? "border-border bg-background text-muted/30 cursor-not-allowed"
                  : routingMode === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:text-foreground hover:border-accent/40"
              } ${config?.envOnly ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {opt.label}
              {opt.disabled && <span className="block text-[10px] text-muted/40">No key</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Feature Toggles ──────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-foreground">Features</div>
        {([
          { key: "disclaimers", label: "Financial Disclaimers", desc: "Auto-append disclaimers to investment analysis", value: enableDisclaimers, setter: setEnableDisclaimers },
          { key: "safety", label: "Safety Governor", desc: "Content guard, credential detection, PII filtering", value: enableSafety, setter: setEnableSafety },
          { key: "personality", label: "Gold Digger Personality", desc: "Warm, witty AI personality in responses", value: enablePersonality, setter: setEnablePersonality },
        ] as const).map((t) => (
          <div key={t.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div>
              <div className="text-sm text-foreground">{t.label}</div>
              <div className="text-xs text-muted">{t.desc}</div>
            </div>
            <button
              onClick={() => t.setter(!t.value)}
              className={`w-10 h-5 rounded-full transition-colors relative ${t.value ? "bg-accent" : "bg-border"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${t.value ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Investor Profile ─────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <div className="text-sm font-medium text-foreground">Investor Profile</div>
          <p className="text-xs text-muted mt-0.5">These shape how your fleet tailors analysis and recommendations</p>
        </div>

        {/* Risk Tolerance */}
        <div>
          <div className="text-xs text-muted mb-2">Risk Tolerance</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "conservative" as const, label: "Conservative" },
              { value: "moderate" as const, label: "Moderate" },
              { value: "aggressive" as const, label: "Aggressive" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRiskTolerance(opt.value)}
                className={`px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                  riskTolerance === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Capital Range */}
        <div>
          <div className="text-xs text-muted mb-2">Investment Capital</div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "under_5k" as const, label: "Under $5K" },
              { value: "5k_50k" as const, label: "$5K – $50K" },
              { value: "50k_500k" as const, label: "$50K – $500K" },
              { value: "over_500k" as const, label: "$500K+" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCapitalRange(opt.value)}
                className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                  capitalRange === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus Areas */}
        <div>
          <div className="text-xs text-muted mb-2">Focus Areas <span className="text-muted/40">(multi-select)</span></div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "stocks" as const, label: "Stocks & ETFs" },
              { value: "crypto" as const, label: "Crypto & Web3" },
              { value: "business" as const, label: "Business & Side Income" },
              { value: "real_estate" as const, label: "Real Estate" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleFocusArea(opt.value)}
                className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                  focusAreas.includes(opt.value) || focusAreas.includes("all")
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Experience Level */}
        <div>
          <div className="text-xs text-muted mb-2">Experience Level</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "beginner" as const, label: "Beginner" },
              { value: "intermediate" as const, label: "Intermediate" },
              { value: "advanced" as const, label: "Advanced" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setExperienceLevel(opt.value)}
                className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                  experienceLevel === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Actions ───────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/dashboard/gold-digger/setup")}
          className="px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted hover:text-foreground transition-colors"
        >
          Re-run Setup Wizard
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-success">Settings saved &amp; keys verified</span>}
          {warning && <span className="text-sm text-warning">{warning}</span>}
          {error && <span className="text-sm text-danger max-w-xs text-right">{error}</span>}
          <button
            onClick={saveSettings}
            disabled={saving}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
              saved
                ? "bg-success hover:bg-success text-white"
                : "bg-accent hover:bg-accent-hover text-white"
            }`}
          >
            {saving ? "Testing & saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
