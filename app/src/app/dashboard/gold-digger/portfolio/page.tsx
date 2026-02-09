"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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
  priceAtTime?: number;
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

export default function PortfolioPage() {
  const [tab, setTab] = useState<"investments" | "research" | "stats">("investments");
  const [investments, setInvestments] = useState<InvestmentDecision[]>([]);
  const [research, setResearch] = useState<ResearchFinding[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [symbolFilter, setSymbolFilter] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, resRes, statsRes] = await Promise.all([
        fetch("/api/golddigger/history?type=investments&limit=50"),
        fetch("/api/golddigger/history?type=research&limit=50"),
        fetch("/api/golddigger/history?type=stats"),
      ]);

      if (invRes.ok) {
        const data = await invRes.json();
        setInvestments(data.data ?? []);
      }
      if (resRes.ok) {
        const data = await resRes.json();
        setResearch(data.data ?? []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.data ?? null);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered investments
  const filteredInvestments = symbolFilter
    ? investments.filter((i) => i.symbol.toLowerCase().includes(symbolFilter.toLowerCase()))
    : investments;

  // Unique symbols for quick filters
  const uniqueSymbols = [...new Set(investments.map((i) => i.symbol))].slice(0, 10);

  // Stats calculations
  const buyCount = investments.filter((i) => i.action === "BUY").length;
  const sellCount = investments.filter((i) => i.action === "SELL").length;
  const holdCount = investments.filter((i) => i.action === "HOLD").length;
  const avgConfidence = investments.length > 0
    ? Math.round(investments.reduce((acc, i) => acc + i.confidence, 0) / investments.length)
    : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Portfolio Tracker <span className="text-accent text-sm font-normal">AGI</span>
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Your investment decisions and market research history
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <Link
            href="/dashboard/gold-digger"
            className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
          >
            Back to Chat
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted mb-1">Total Analyses</div>
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
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted mb-1">Research Done</div>
          <div className="text-2xl font-bold text-foreground">{research.length}</div>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
        {([
          { key: "investments" as const, label: "Investment Decisions", icon: "📈" },
          { key: "research" as const, label: "Market Research", icon: "🔍" },
          { key: "stats" as const, label: "Memory Stats", icon: "📊" },
        ]).map((t) => (
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

      {/* Tab content */}
      {tab === "investments" && (
        <div className="space-y-3">
          {/* Symbol filters */}
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

          {filteredInvestments.length === 0 && !loading && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">📈</div>
              <div className="text-sm text-muted">No investment decisions yet</div>
              <div className="text-xs text-muted/50 mt-1">
                Ask Gold Digger to analyze stocks, crypto, or ETFs — decisions will appear here
              </div>
              <Link
                href="/dashboard/gold-digger"
                className="inline-block mt-3 px-4 py-2 bg-accent text-white rounded-lg text-xs"
              >
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

              {/* Price levels */}
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

      {tab === "research" && (
        <div className="space-y-3">
          {research.length === 0 && !loading && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm text-muted">No market research yet</div>
              <div className="text-xs text-muted/50 mt-1">
                Ask Gold Digger to research markets, niches, or industries
              </div>
              <Link
                href="/dashboard/gold-digger"
                className="inline-block mt-3 px-4 py-2 bg-accent text-white rounded-lg text-xs"
              >
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

              {/* Score bar */}
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

      {tab === "stats" && !stats && !loading && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-sm text-muted">No memory data available</div>
        </div>
      )}
    </div>
  );
}
