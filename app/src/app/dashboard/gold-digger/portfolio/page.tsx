"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTier } from "../components/TierProvider";
import type { UserTier } from "@/lib/golddigger/tier";

/* ── Interfaces ──────────────────────────────────────── */

interface BrokerAccount {
  portfolioValue: number;
  buyingPower: number;
  cash: number;
  equity: number;
}

interface BrokerPosition {
  symbol: string;
  quantity: number;
  side: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

interface BrokerStatus {
  connected: boolean;
  tradingMode?: "paper" | "live";
  account?: BrokerAccount;
  market?: { isOpen: boolean };
}

interface InvestmentDecision {
  id: string;
  timestamp: string;
  symbol: string;
  action: string;
  confidence: number;
  reasoning: string;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface ResearchFinding {
  id: string;
  timestamp: string;
  niche: string;
  opportunityScore: number;
  keyFindings: string;
  verdict: string;
}

interface MemoryStats {
  totalConversations: number;
  totalInvestments: number;
  totalResearch: number;
  oldestMemory: string | null;
  newestMemory: string | null;
}

/* ── Helpers ──────────────────────────────────────────── */

function fmt$(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Gentle language for P&L depending on tier */
function pnlLabel(pnl: number, tier: UserTier): string {
  if (tier === "newbie") {
    if (pnl > 0) return "Growing";
    if (pnl < 0) return "Adjusting";
    return "Steady";
  }
  return fmt$(pnl);
}

function pnlColor(pnl: number, tier: UserTier): string {
  if (tier === "newbie") {
    if (pnl > 0) return "text-emerald-400";
    if (pnl < 0) return "text-amber-400"; // gentle amber, not red
    return "text-muted";
  }
  // Intermediate/Expert get standard green/red
  if (pnl > 0) return "text-green-400";
  if (pnl < 0) return "text-red-400";
  return "text-muted";
}

function tradingModeLabel(mode: string | undefined, tier: UserTier): string {
  if (tier === "newbie") {
    return mode === "live" ? "Live Account" : "Practice Mode";
  }
  return mode === "live" ? "Live Trading" : "Paper Trading";
}

function tradingModeBadge(mode: string | undefined, tier: UserTier): string {
  if (tier === "newbie") {
    return mode === "live"
      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      : "bg-blue-500/10 text-blue-400 border-blue-500/20";
  }
  return mode === "live"
    ? "bg-green-500/10 text-green-400 border-green-500/20"
    : "bg-blue-500/10 text-blue-400 border-blue-500/20";
}

const ACTION_COLORS: Record<string, string> = {
  BUY: "bg-green-500/10 text-green-400 border-green-500/20",
  SELL: "bg-red-500/10 text-red-400 border-red-500/20",
  HOLD: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  AVOID: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const VERDICT_COLORS: Record<string, string> = {
  Strong: "text-green-400",
  Moderate: "text-yellow-400",
  Weak: "text-red-400",
};

interface FleetStatus {
  running: boolean;
  agents: Record<string, { role: string; status: string; lastActive: string; proposalsMade: number }>;
  pendingProposals: number;
  totalMessages: number;
  metrics: {
    totalProposals: number;
    approvedProposals: number;
    approvalRate: number;
    avgConfidence: number;
    messagesProcessed: number;
  };
}

interface RecentOrder {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  filledAvgPrice?: number;
  createdAt: string;
}

interface PortfolioHistory {
  timestamp: string[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
}

/* ── Simple SVG Line Chart ────────────────────────────────── */

interface PerformanceChartProps {
  data: PortfolioHistory;
  showPercent?: boolean;
  compact?: boolean;
}

function PerformanceChart({ data, showPercent = false, compact = false }: PerformanceChartProps) {
  if (!data.equity || data.equity.length === 0) {
    return null;
  }

  const values = showPercent ? data.profit_loss_pct : data.equity;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;

  // Chart dimensions
  const viewBox = compact ? "0 0 400 120" : "0 0 600 200";
  const [vbWidth, vbHeight] = compact ? [400, 120] : [600, 200];
  const padding = compact ? 20 : 40;
  const chartWidth = vbWidth - padding * 2;
  const chartHeight = vbHeight - padding * 2;

  // Calculate points
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * chartWidth + padding;
    const y = chartHeight - ((v - minValue) / range) * chartHeight + padding;
    return `${x},${y}`;
  }).join(" ");

  // Determine color based on trend
  const isPositive = values[values.length - 1] >= values[0];
  const lineColor = isPositive ? "#10b981" : "#f59e0b";
  const gradientColor = isPositive ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)";

  return (
    <svg viewBox={viewBox} className="w-full h-auto" style={{ minHeight: compact ? "100px" : "160px" }}>
      {/* Grid lines (light) */}
      {!compact && [0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
        const y = padding + (chartHeight * (1 - pct));
        return (
          <line
            key={i}
            x1={padding}
            y1={y}
            x2={vbWidth - padding}
            y2={y}
            stroke="#374151"
            strokeWidth="0.5"
            opacity="0.3"
          />
        );
      })}

      {/* Data line */}
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={compact ? "1.5" : "2"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Area under curve (very subtle) */}
      {!compact && (
        <polygon
          points={`${padding},${chartHeight + padding} ${points} ${vbWidth - padding},${chartHeight + padding}`}
          fill={lineColor}
          opacity="0.05"
        />
      )}
    </svg>
  );
}

/* ── Component ────────────────────────────────────────── */

export default function PortfolioPage() {
  const { tier, loading: tierLoading } = useTier();

  // Broker data
  const [broker, setBroker] = useState<BrokerStatus | null>(null);
  const [positions, setPositions] = useState<BrokerPosition[]>([]);

  // AI history data
  const [investments, setInvestments] = useState<InvestmentDecision[]>([]);
  const [research, setResearch] = useState<ResearchFinding[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);

  // Fleet & orders data
  const [fleet, setFleet] = useState<FleetStatus | null>(null);
  const [orders, setOrders] = useState<RecentOrder[]>([]);

  // Performance chart data
  const [history, setHistory] = useState<PortfolioHistory | null>(null);

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("overview");
  const [symbolFilter, setSymbolFilter] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [brokerRes, posRes, invRes, resRes, statsRes, fleetRes, ordersRes, historyRes] = await Promise.all([
        fetch("/api/golddigger/broker"),
        fetch("/api/golddigger/broker?view=positions"),
        fetch("/api/golddigger/history?type=investments&limit=50"),
        fetch("/api/golddigger/history?type=research&limit=50"),
        fetch("/api/golddigger/history?type=stats"),
        fetch("/api/golddigger/fleet?action=status").catch(() => null),
        fetch("/api/golddigger/broker?view=orders").catch(() => null),
        fetch("/api/golddigger/broker?view=history").catch(() => null),
      ]);

      if (brokerRes.ok) setBroker(await brokerRes.json());
      if (posRes.ok) {
        const d = await posRes.json();
        setPositions(d.positions ?? []);
      }
      if (invRes.ok) {
        const d = await invRes.json();
        setInvestments(d.data ?? []);
      }
      if (resRes.ok) {
        const d = await resRes.json();
        setResearch(d.data ?? []);
      }
      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.data ?? null);
      }
      if (fleetRes?.ok) setFleet(await fleetRes.json());
      if (ordersRes?.ok) {
        const d = await ordersRes.json();
        setOrders(d.orders ?? []);
      }
      if (historyRes?.ok) {
        const d = await historyRes.json();
        setHistory(d.history ?? null);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived values
  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalPnlPct = broker?.account?.equity && broker.account.equity > 0
    ? (totalPnl / (broker.account.equity - totalPnl)) * 100
    : 0;

  const filteredInvestments = symbolFilter
    ? investments.filter((i) => i.symbol.toLowerCase().includes(symbolFilter.toLowerCase()))
    : investments;

  const uniqueSymbols = [...new Set(investments.map((i) => i.symbol))].slice(0, 10);
  const buyCount = investments.filter((i) => i.action === "BUY").length;
  const sellCount = investments.filter((i) => i.action === "SELL").length;
  const holdCount = investments.filter((i) => i.action === "HOLD").length;
  const avgConfidence = investments.length > 0
    ? Math.round(investments.reduce((acc, i) => acc + i.confidence, 0) / investments.length)
    : 0;

  if (tierLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <div className="text-muted text-sm">Loading...</div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── NEWBIE VIEW: "My Money" ────────────────────────── */
  /* ══════════════════════════════════════════════════════ */

  if (tier === "newbie") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Money</h1>
            <p className="text-sm text-muted mt-0.5">
              {broker?.connected ? "Your AI is managing your investments" : "Connect an account to get started"}
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Not connected state */}
        {!broker?.connected && (
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
            <div className="text-4xl">🏦</div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Get Started</h2>
              <p className="text-sm text-muted mt-1 max-w-sm mx-auto">
                Connect a trading account or start with the practice simulator. Gold Digger will handle the investing for you.
              </p>
            </div>
            <Link
              href="/dashboard/gold-digger/settings"
              className="inline-block px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              Connect Account
            </Link>
          </div>
        )}

        {/* Connected — Hero card */}
        {broker?.connected && broker.account && (
          <>
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              {/* Mode badge */}
              <div className="flex items-center justify-between">
                <span className={`text-[11px] px-2.5 py-1 rounded-full border ${tradingModeBadge(broker.tradingMode, tier)}`}>
                  {tradingModeLabel(broker.tradingMode, tier)}
                </span>
                {broker.market?.isOpen && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Markets open
                  </span>
                )}
              </div>

              {/* Big portfolio value */}
              <div className="text-center py-4">
                <p className="text-xs text-muted mb-1">Your Portfolio</p>
                <p className="text-4xl font-bold text-foreground tracking-tight">
                  {fmt$(broker.account.portfolioValue)}
                </p>

                {/* P&L — gentle for newbies */}
                {positions.length > 0 && (
                  <div className={`mt-2 text-sm font-medium ${pnlColor(totalPnl, tier)}`}>
                    {totalPnl >= 0 ? "↑" : "↓"} {pnlLabel(totalPnl, tier)}
                    {totalPnl !== 0 && (
                      <span className="text-muted text-xs ml-1">
                        ({fmtPct(totalPnlPct)})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Simple stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-background rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Available Cash</p>
                  <p className="text-sm font-semibold text-foreground">{fmt$(broker.account.cash)}</p>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Active Positions</p>
                  <p className="text-sm font-semibold text-foreground">{positions.length}</p>
                </div>
              </div>
            </div>

            {/* Performance Chart */}
            {history && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">Your Growth</div>
                  <div className="text-xs text-muted">
                    {history.equity.length > 0 && (
                      <>
                        {fmt$(history.equity[history.equity.length - 1])}
                      </>
                    )}
                  </div>
                </div>
                <PerformanceChart data={history} compact={true} />
              </div>
            )}

            {/* AI Fleet Activity */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">Your AI Team</div>
                {fleet?.running && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                )}
              </div>

              {/* Agent status indicators */}
              {fleet && (
                <div className="grid grid-cols-3 gap-2">
                  {Object.values(fleet.agents).slice(0, 6).map((agent) => (
                    <div key={agent.role} className="bg-background rounded-lg p-2 text-center">
                      <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${
                        agent.status === "idle" ? "bg-muted" :
                        agent.status === "analyzing" ? "bg-blue-400 animate-pulse" :
                        agent.status === "proposing" ? "bg-amber-400 animate-pulse" :
                        "bg-emerald-400 animate-pulse"
                      }`} />
                      <p className="text-[9px] text-muted truncate">
                        {agent.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, l => l.toUpperCase()).split(" ").slice(0, 2).join(" ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Fleet stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-background rounded-lg p-3 text-center">
                  <p className="text-xs text-muted">Proposals</p>
                  <p className="text-lg font-bold text-foreground">{fleet?.metrics?.totalProposals ?? 0}</p>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <p className="text-xs text-muted">Trades Made</p>
                  <p className="text-lg font-bold text-foreground">{orders.length}</p>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <p className="text-xs text-muted">Research</p>
                  <p className="text-lg font-bold text-foreground">{research.length}</p>
                </div>
              </div>

              {!fleet?.running && (
                <p className="text-xs text-muted text-center">
                  Your AI team is starting up. It may take a moment to begin analyzing markets.
                </p>
              )}
            </div>

            {/* Recent trades */}
            {orders.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <div className="text-sm font-medium text-foreground">Recent Trades</div>
                </div>
                <div className="divide-y divide-border">
                  {orders.slice(0, 5).map((o) => (
                    <div key={o.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          o.side === "buy"
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}>
                          {o.side.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium text-foreground">{o.symbol}</span>
                        <span className="text-xs text-muted">{o.quantity} shares</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-foreground">
                          {o.filledAvgPrice ? fmt$(o.filledAvgPrice) : "Pending"}
                        </div>
                        <div className={`text-[10px] ${
                          o.status === "filled" ? "text-emerald-400" :
                          o.status === "cancelled" ? "text-red-400" :
                          "text-amber-400"
                        }`}>
                          {o.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Positions — simplified for newbies */}
            {positions.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <div className="text-sm font-medium text-foreground">Your Investments</div>
                </div>
                <div className="divide-y divide-border">
                  {positions.map((p) => (
                    <div key={p.symbol} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-foreground">{p.symbol}</span>
                        <span className="text-xs text-muted ml-2">{p.quantity} shares</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">{fmt$(p.marketValue)}</div>
                        <div className={`text-xs ${pnlColor(p.unrealizedPnl, tier)}`}>
                          {p.unrealizedPnl >= 0 ? "↑" : "↓"} {pnlLabel(p.unrealizedPnl, tier)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gentle reassurance for paper trading */}
            {broker.tradingMode === "paper" && (
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 text-center">
                <p className="text-xs text-blue-400">
                  You&apos;re in Practice Mode — learning with virtual money. No real money at risk.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════ */
  /* ── INTERMEDIATE / EXPERT: Full Portfolio ──────────── */
  /* ══════════════════════════════════════════════════════ */

  const tabs = tier === "expert"
    ? [
        { key: "overview", label: "Overview", icon: "📊" },
        { key: "positions", label: "Positions", icon: "💼" },
        { key: "decisions", label: "AI Decisions", icon: "📈" },
        { key: "research", label: "Research", icon: "🔍" },
        { key: "stats", label: "Memory", icon: "🧠" },
      ]
    : [
        { key: "overview", label: "Overview", icon: "📊" },
        { key: "positions", label: "Positions", icon: "💼" },
        { key: "decisions", label: "AI Decisions", icon: "📈" },
        { key: "research", label: "Research", icon: "🔍" },
      ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Portfolio <span className="text-accent text-sm font-normal">AGI</span>
          </h1>
          <p className="text-sm text-muted mt-0.5">
            {broker?.connected
              ? `${tradingModeLabel(broker.tradingMode, tier)} — Real-time broker data`
              : "Connect a broker to see live portfolio data"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
          >
            Refresh
          </button>
          <Link
            href="/dashboard/gold-digger"
            className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
          >
            Back to Chat
          </Link>
        </div>
      </div>

      {/* Account overview cards — always visible if broker connected */}
      {broker?.connected && broker.account && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted uppercase tracking-wider">Portfolio Value</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${tradingModeBadge(broker.tradingMode, tier)}`}>
                {broker.tradingMode === "live" ? "LIVE" : "PAPER"}
              </span>
            </div>
            <div className="text-xl font-bold text-foreground">{fmt$(broker.account.portfolioValue)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Unrealized P&L</div>
            <div className={`text-xl font-bold ${pnlColor(totalPnl, tier)}`}>
              {totalPnl >= 0 ? "+" : ""}{fmt$(totalPnl)}
            </div>
            <div className={`text-xs ${pnlColor(totalPnlPct, tier)}`}>{fmtPct(totalPnlPct)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Cash</div>
            <div className="text-xl font-bold text-foreground">{fmt$(broker.account.cash)}</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1">Buying Power</div>
            <div className="text-xl font-bold text-foreground">{fmt$(broker.account.buyingPower)}</div>
          </div>
        </div>
      )}

      {/* Not connected notice */}
      {(!broker || !broker.connected) && (
        <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">No broker connected</p>
            <p className="text-xs text-muted mt-0.5">Connect a broker to see live portfolio data, positions, and P&L</p>
          </div>
          <Link
            href="/dashboard/gold-digger/settings"
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors shrink-0"
          >
            Connect Broker
          </Link>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-accent/10 text-accent border border-accent/20"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Overview ─────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-4">
          {/* Performance Chart */}
          {history && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-medium text-foreground">Portfolio Performance</div>
                <div className="flex gap-4 text-xs">
                  {history.equity.length > 0 && (
                    <>
                      <div className="text-muted">
                        Current: <span className="text-foreground font-medium">{fmt$(history.equity[history.equity.length - 1])}</span>
                      </div>
                      {history.profit_loss[history.profit_loss.length - 1] !== undefined && (
                        <div className={pnlColor(history.profit_loss[history.profit_loss.length - 1], tier)}>
                          P&L: <span className="font-medium">{fmt$(history.profit_loss[history.profit_loss.length - 1])}</span>
                        </div>
                      )}
                      {history.profit_loss_pct[history.profit_loss_pct.length - 1] !== undefined && (
                        <div className={pnlColor(history.profit_loss_pct[history.profit_loss_pct.length - 1], tier)}>
                          Return: <span className="font-medium">{fmtPct(history.profit_loss_pct[history.profit_loss_pct.length - 1])}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <PerformanceChart data={history} showPercent={false} />
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Open Positions</div>
              <div className="text-2xl font-bold text-foreground">{positions.length}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">AI Analyses</div>
              <div className="text-2xl font-bold text-foreground">{investments.length}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Avg Confidence</div>
              <div className="text-2xl font-bold text-accent">{avgConfidence}%</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">BUY / SELL / HOLD</div>
              <div className="text-lg font-bold">
                <span className="text-green-400">{buyCount}</span>
                {" / "}
                <span className="text-red-400">{sellCount}</span>
                {" / "}
                <span className="text-yellow-400">{holdCount}</span>
              </div>
            </div>
          </div>

          {/* Top positions (if any) */}
          {positions.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Top Positions</span>
                <button onClick={() => setTab("positions")} className="text-xs text-accent hover:text-accent-hover transition-colors">
                  View all →
                </button>
              </div>
              <div className="divide-y divide-border">
                {positions.slice(0, 5).map((p) => (
                  <div key={p.symbol} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{p.symbol}</span>
                      <span className="text-[10px] text-muted">{p.quantity} × {fmt$(p.currentPrice)}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">{fmt$(p.marketValue)}</div>
                      <div className={`text-xs ${pnlColor(p.unrealizedPnl, tier)}`}>
                        {p.unrealizedPnl >= 0 ? "+" : ""}{fmt$(p.unrealizedPnl)} ({fmtPct(p.unrealizedPnlPercent)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No broker + no data */}
          {!broker?.connected && investments.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">📈</div>
              <div className="text-sm text-muted">No portfolio data yet</div>
              <div className="text-xs text-muted/50 mt-1">
                Connect a broker and ask Gold Digger to analyze stocks — data will appear here
              </div>
              <Link
                href="/dashboard/gold-digger"
                className="inline-block mt-3 px-4 py-2 bg-accent text-white rounded-lg text-xs"
              >
                Start Analyzing
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Positions ────────────────────────────── */}
      {tab === "positions" && (
        <div className="space-y-3">
          {!broker?.connected && (
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-sm text-muted">Connect a broker to see live positions</div>
            </div>
          )}

          {broker?.connected && positions.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">💼</div>
              <div className="text-sm text-muted">No open positions</div>
              <div className="text-xs text-muted/50 mt-1">
                Your AI fleet will open positions when it finds opportunities
              </div>
            </div>
          )}

          {positions.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="px-5 py-3 border-b border-border grid grid-cols-6 gap-2 text-[10px] text-muted uppercase tracking-wider">
                <span>Symbol</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Entry</span>
                <span className="text-right">Current</span>
                <span className="text-right">Value</span>
                <span className="text-right">P&L</span>
              </div>
              <div className="divide-y divide-border">
                {positions.map((p) => (
                  <div key={p.symbol} className="px-5 py-3 grid grid-cols-6 gap-2 items-center">
                    <div>
                      <span className="text-sm font-medium text-foreground">{p.symbol}</span>
                      <span className={`ml-1.5 text-[10px] ${p.side === "long" ? "text-green-400" : "text-red-400"}`}>
                        {p.side}
                      </span>
                    </div>
                    <span className="text-sm text-foreground text-right">{p.quantity}</span>
                    <span className="text-sm text-muted text-right">{fmt$(p.entryPrice)}</span>
                    <span className="text-sm text-foreground text-right">{fmt$(p.currentPrice)}</span>
                    <span className="text-sm text-foreground text-right">{fmt$(p.marketValue)}</span>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${pnlColor(p.unrealizedPnl, tier)}`}>
                        {p.unrealizedPnl >= 0 ? "+" : ""}{fmt$(p.unrealizedPnl)}
                      </div>
                      <div className={`text-[10px] ${pnlColor(p.unrealizedPnlPercent, tier)}`}>
                        {fmtPct(p.unrealizedPnlPercent)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Totals row */}
              <div className="px-5 py-3 border-t border-border bg-background grid grid-cols-6 gap-2 items-center text-sm font-medium">
                <span className="text-foreground">Total</span>
                <span></span>
                <span></span>
                <span></span>
                <span className="text-foreground text-right">
                  {fmt$(positions.reduce((s, p) => s + p.marketValue, 0))}
                </span>
                <div className="text-right">
                  <span className={pnlColor(totalPnl, tier)}>
                    {totalPnl >= 0 ? "+" : ""}{fmt$(totalPnl)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: AI Decisions ─────────────────────────── */}
      {tab === "decisions" && (
        <div className="space-y-3">
          {uniqueSymbols.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setSymbolFilter("")}
                className={`px-2.5 py-1 rounded-full text-[10px] border transition-colors ${
                  !symbolFilter ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"
                }`}
              >
                All
              </button>
              {uniqueSymbols.map((s) => (
                <button
                  key={s}
                  onClick={() => setSymbolFilter(s === symbolFilter ? "" : s)}
                  className={`px-2.5 py-1 rounded-full text-[10px] border transition-colors ${
                    symbolFilter === s ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {filteredInvestments.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">📈</div>
              <div className="text-sm text-muted">No investment decisions yet</div>
              <div className="text-xs text-muted/50 mt-1">
                Ask Gold Digger to analyze stocks, crypto, or ETFs — decisions will appear here
              </div>
              <Link href="/dashboard/gold-digger" className="inline-block mt-3 px-4 py-2 bg-accent text-white rounded-lg text-xs">
                Start Analyzing
              </Link>
            </div>
          )}

          {filteredInvestments.map((inv) => (
            <div key={inv.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{inv.symbol}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${ACTION_COLORS[inv.action] ?? "bg-border/50 text-muted"}`}>
                    {inv.action}
                  </span>
                  <span className="text-[10px] text-accent/70">{inv.confidence}% confidence</span>
                </div>
                <span className="text-[10px] text-muted/50">
                  {new Date(inv.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {(inv.entryPrice || inv.stopLoss || inv.takeProfit) && (
                <div className="flex gap-4 mb-2 text-xs">
                  {inv.entryPrice && (
                    <span className="text-muted">Entry: <span className="text-foreground">${inv.entryPrice.toLocaleString()}</span></span>
                  )}
                  {inv.stopLoss && (
                    <span className="text-muted">SL: <span className="text-red-400">${inv.stopLoss.toLocaleString()}</span></span>
                  )}
                  {inv.takeProfit && (
                    <span className="text-muted">TP: <span className="text-green-400">${inv.takeProfit.toLocaleString()}</span></span>
                  )}
                  {inv.entryPrice && inv.stopLoss && inv.takeProfit && (
                    <span className="text-muted">
                      R:R <span className="text-accent">
                        1:{((Math.abs(inv.takeProfit - inv.entryPrice) / Math.abs(inv.entryPrice - inv.stopLoss)) || 0).toFixed(1)}
                      </span>
                    </span>
                  )}
                </div>
              )}

              <div className="text-xs text-muted/70 leading-relaxed">{inv.reasoning}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: Research ─────────────────────────────── */}
      {tab === "research" && (
        <div className="space-y-3">
          {research.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm text-muted">No market research yet</div>
              <div className="text-xs text-muted/50 mt-1">
                Ask Gold Digger to research markets, niches, or industries
              </div>
              <Link href="/dashboard/gold-digger" className="inline-block mt-3 px-4 py-2 bg-accent text-white rounded-lg text-xs">
                Start Researching
              </Link>
            </div>
          )}

          {research.map((res) => (
            <div key={res.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{res.niche}</span>
                  <span className={`text-xs font-medium ${VERDICT_COLORS[res.verdict] ?? "text-muted"}`}>
                    {res.verdict}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-accent/70">Score: {res.opportunityScore}/100</span>
                  <span className="text-[10px] text-muted/50">
                    {new Date(res.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>

              <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    res.opportunityScore >= 70 ? "bg-green-400" :
                    res.opportunityScore >= 40 ? "bg-yellow-400" : "bg-red-400"
                  }`}
                  style={{ width: `${res.opportunityScore}%` }}
                />
              </div>

              <div className="text-xs text-muted/70 leading-relaxed">{res.keyFindings}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: Memory Stats (Expert only) ───────────── */}
      {tab === "stats" && stats && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="text-sm font-medium text-foreground">Memory Statistics</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-xs text-muted">Total Conversations</span>
              <span className="text-xs text-foreground font-medium">{stats.totalConversations}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-xs text-muted">Investment Decisions</span>
              <span className="text-xs text-foreground font-medium">{stats.totalInvestments}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-xs text-muted">Research Findings</span>
              <span className="text-xs text-foreground font-medium">{stats.totalResearch}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-xs text-muted">Memory Active Since</span>
              <span className="text-xs text-foreground font-medium">
                {stats.oldestMemory ? new Date(stats.oldestMemory).toLocaleDateString() : "Never"}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "stats" && !stats && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-sm text-muted">No memory data available</div>
        </div>
      )}
    </div>
  );
}
