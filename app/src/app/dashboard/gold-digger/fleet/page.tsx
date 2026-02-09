"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/* ── Types ─────────────────────────────────────────────── */

interface Agent {
  id: string; role: string; name: string; shortName: string;
  description: string; color: string; capabilities: string[];
  status: "idle" | "thinking" | "analyzing" | "proposing" | "waiting";
  lastActive: string; messagesProcessed: number; proposalsMade: number;
}
interface RiskAssessment { level: "low" | "medium" | "high"; factors: string[]; }
interface Proposal {
  id: string; timestamp: string; sender: string; senderName: string;
  senderShortName: string; senderColor: string; recipients: string[];
  type: "PROPOSAL"; priority: "high" | "medium" | "low"; subject: string;
  payload: Record<string, unknown>;
  proposalType: "trade" | "rebalance" | "research" | "alert" | "strategy_change";
  summary: string; reasoning: string; riskAssessment: RiskAssessment;
  neuralConfidence: number; expectedReturn: number;
  requiredApprovals: string[];
  approvals: Array<{ role: string; approved: boolean; timestamp?: string }>;
  ceoDecision: null | boolean; status: "pending" | "approved" | "rejected";
}
interface ActivityEntry {
  id: string; timestamp: string; sender: string; senderName: string;
  senderColor: string; recipients: string[]; type: string;
  priority: "high" | "medium" | "low"; subject: string;
  payload: Record<string, unknown>; status: string;
}
interface Directive {
  id: string; timestamp: string;
  type: "risk_tolerance" | "focus_sectors" | "max_position_size" | "trading_style" | "general";
  value: string; active: boolean;
}
interface Metrics {
  totalProposals: number; approvedProposals: number; rejectedProposals: number;
  approvalRate: number; avgConfidence: number; totalReturn: number;
  messagesProcessed: number; activeDirectives: number;
}
interface FleetData {
  running: boolean; agents: Agent[]; pendingProposals: Proposal[];
  allProposals: Proposal[]; activityLog: ActivityEntry[];
  directives: Directive[]; metrics: Metrics;
}
interface BrokerAccount {
  connected: boolean;
  account?: { portfolioValue: number; buyingPower: number; cash: number; equity: number };
  market?: { isOpen: boolean };
}

/* ── Helpers ────────────────────────────────────────────── */

function fmt$(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
}
function fmtPct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function timeAgo(ts: string) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000) return "now";
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  return `${Math.floor(d / 86400000)}d`;
}

const STATUS_STYLE: Record<string, string> = {
  idle: "text-muted",
  thinking: "text-accent",
  analyzing: "text-purple-400",
  proposing: "text-amber-400",
  waiting: "text-orange-400",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-red-500/10 text-red-400 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-success/10 text-success border-success/20",
};

const RISK_STYLE: Record<string, string> = {
  low: "text-success",
  medium: "text-amber-400",
  high: "text-red-400",
};

/* ── Component ─────────────────────────────────────────── */

export default function FleetDashboard() {
  const router = useRouter();
  const [fleet, setFleet] = useState<FleetData | null>(null);
  const [broker, setBroker] = useState<BrokerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [deciding, setDeciding] = useState<string | null>(null);
  const [activityLimit, setActivityLimit] = useState(8);

  const load = useCallback(async () => {
    try {
      const [f, b] = await Promise.all([
        fetch("/api/golddigger/fleet").then(r => r.ok ? r.json() : null),
        fetch("/api/golddigger/broker").then(r => r.ok ? r.json() : null),
      ]);
      if (f) setFleet(f);
      if (b) setBroker(b);
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh || deciding) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, deciding, load]);

  const decide = useCallback(async (pid: string, approved: boolean) => {
    setDeciding(pid);
    try {
      await fetch("/api/golddigger/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "decide", proposalId: pid, approved, notes: notes[pid] || "" }),
      });
      setNotes(p => { const u = { ...p }; delete u[pid]; return u; });
      setExpanded(null);
      await load();
    } catch { /* */ }
    setDeciding(null);
  }, [notes, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  const activeCount = fleet?.agents.filter(a => a.status !== "idle").length ?? 0;

  return (
    <div className="h-full overflow-auto space-y-4">

      {/* ── Header Row ──────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Fleet Overview</h2>
          <p className="text-xs text-muted mt-0.5">
            {activeCount} of {fleet?.agents.length ?? 6} agents active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              autoRefresh
                ? "bg-accent/10 text-accent border-accent/20"
                : "text-muted border-border hover:text-foreground hover:bg-card"
            }`}
          >
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg text-xs text-muted border border-border hover:text-foreground hover:bg-card transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Account Strip ───────────────────────────────── */}
      {broker?.connected && broker.account && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Portfolio</p>
              <p className="text-sm font-semibold text-foreground">{fmt$(broker.account.portfolioValue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Buying Power</p>
              <p className="text-sm font-semibold text-foreground">{fmt$(broker.account.buyingPower)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Cash</p>
              <p className="text-sm font-semibold text-success">{fmt$(broker.account.cash)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Market</p>
              <p className={`text-sm font-semibold ${broker.market?.isOpen ? "text-success" : "text-muted"}`}>
                {broker.market?.isOpen ? "Open" : "Closed"}
              </p>
            </div>
          </div>
        </div>
      )}

      {broker && !broker.connected && (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">No broker connected — set up in Settings to start trading</p>
            {(broker as BrokerAccount & { error?: string }).error && (
              <p className="text-xs text-red-400 mt-1">
                {(broker as BrokerAccount & { error?: string }).error}
              </p>
            )}
          </div>
          <button
            onClick={() => router.push("/dashboard/gold-digger/settings")}
            className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors"
          >
            Connect Broker
          </button>
        </div>
      )}

      {fleet && (
        <>
          {/* ── Metrics Row ───────────────────────────────── */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Proposals", value: String(fleet.metrics.totalProposals) },
              { label: "Approved", value: fmtPct(fleet.metrics.approvalRate), color: "text-success" },
              { label: "Confidence", value: fmtPct(fleet.metrics.avgConfidence) },
              { label: "Return", value: `${fleet.metrics.totalReturn >= 0 ? "+" : ""}${fmtPct(fleet.metrics.totalReturn)}`, color: fleet.metrics.totalReturn >= 0 ? "text-success" : "text-red-400" },
              { label: "Directives", value: String(fleet.metrics.activeDirectives) },
              { label: "Messages", value: fleet.metrics.messagesProcessed.toLocaleString() },
            ].map(m => (
              <div key={m.label} className="bg-card border border-border rounded-lg p-3">
                <p className="text-[10px] text-muted uppercase tracking-wider">{m.label}</p>
                <p className={`text-lg font-bold ${m.color || "text-foreground"}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* ── Agent Grid ────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">Agents</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {fleet.agents.map(a => (
                <div
                  key={a.id}
                  className="bg-card border border-border rounded-xl p-3 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: a.color }}
                    >
                      {a.shortName}
                    </div>
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        a.status === "idle" ? "bg-border" : "bg-success animate-pulse"
                      }`}
                    />
                  </div>
                  <p className="text-xs font-medium text-foreground truncate">{a.name}</p>
                  <p className={`text-[10px] capitalize ${STATUS_STYLE[a.status] || "text-muted"}`}>
                    {a.status}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-muted">
                    <span>{a.proposalsMade}p</span>
                    <span className="text-border">|</span>
                    <span>{timeAgo(a.lastActive)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Proposals ─────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-medium text-foreground mb-3">
              Pending Proposals
              {fleet.pendingProposals.length > 0 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  {fleet.pendingProposals.length}
                </span>
              )}
            </h3>

            {fleet.pendingProposals.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center">
                <p className="text-sm text-muted">No proposals awaiting review</p>
                <p className="text-xs text-muted/60 mt-1">Fleet is scanning for opportunities</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fleet.pendingProposals.map(p => (
                  <div
                    key={p.id}
                    className={`bg-card border rounded-xl overflow-hidden hover:border-accent/40 transition-colors border-l-4 ${
                      p.riskAssessment.level === "high"
                        ? "border-l-red-500 border-border bg-red-500/[0.02]"
                        : p.riskAssessment.level === "medium"
                          ? "border-l-amber-500 border-border"
                          : "border-l-green-500 border-border"
                    }`}
                  >
                    {/* Collapsed header */}
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: p.senderColor }}
                        >
                          {p.senderShortName}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{p.senderName}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[p.priority]}`}>
                              {p.priority}
                            </span>
                            <span className="text-[10px] text-muted bg-background px-1.5 py-0.5 rounded">
                              {p.proposalType.replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-1 truncate">{p.summary}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          <span className={RISK_STYLE[p.riskAssessment.level]}>
                            {p.riskAssessment.level}
                          </span>
                          <span className="text-muted">{fmtPct(p.neuralConfidence)}</span>
                          <span className={p.expectedReturn >= 0 ? "text-success" : "text-red-400"}>
                            {p.expectedReturn >= 0 ? "+" : ""}{fmtPct(p.expectedReturn)}
                          </span>
                          <svg
                            width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                            className={`text-muted/50 transition-transform ${expanded === p.id ? "rotate-180" : ""}`}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expanded === p.id && (
                      <div className="border-t border-border p-4 space-y-4 bg-background/30">
                        <p className="text-sm text-muted leading-relaxed">{p.reasoning}</p>

                        {/* Risk factors */}
                        {p.riskAssessment.factors.length > 0 && (
                          <div>
                            <p className="text-xs text-muted mb-1.5">Risk factors</p>
                            <div className="space-y-1">
                              {p.riskAssessment.factors.map((f, i) => (
                                <p key={i} className="text-xs text-muted/80 flex gap-2">
                                  <span className="text-accent shrink-0">-</span>{f}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Approvals */}
                        <div className="flex items-center gap-3">
                          {p.requiredApprovals.map(r => {
                            const ok = p.approvals.find(a => a.role === r)?.approved ?? false;
                            return (
                              <div key={r} className="flex items-center gap-1.5 text-[10px]">
                                <div className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold ${
                                  ok ? "bg-success/20 text-success" : "bg-border text-muted/50"
                                }`}>
                                  {ok ? "✓" : "○"}
                                </div>
                                <span className="text-muted">{r.split("_").pop()}</span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Notes + Actions */}
                        <textarea
                          value={notes[p.id] || ""}
                          onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Notes (optional)..."
                          rows={2}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent transition-colors resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => decide(p.id, true)}
                            disabled={deciding === p.id}
                            className="flex-1 px-3 py-2 bg-success/10 text-success border border-success/20 rounded-lg text-xs font-medium hover:bg-success/20 transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => decide(p.id, false)}
                            disabled={deciding === p.id}
                            className="flex-1 px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Activity ──────────────────────────────────── */}
          {fleet.activityLog.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Recent Activity</h3>
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {fleet.activityLog.slice(0, activityLimit).map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                      style={{ backgroundColor: e.senderColor }}
                    >
                      {e.senderName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{e.subject}</p>
                    </div>
                    <span className="text-[10px] text-muted shrink-0">{timeAgo(e.timestamp)}</span>
                  </div>
                ))}
                {fleet.activityLog.length > 8 && (
                  <div className="px-4 py-2 text-center">
                    <button
                      onClick={() => setActivityLimit(prev => prev <= 8 ? 20 : 8)}
                      className="text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      {activityLimit > 8 ? "Show less" : `Show more (${fleet.activityLog.length - 8} more)`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Directives ────────────────────────────────── */}
          {fleet.directives.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Active Directives</h3>
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {fleet.directives.filter(d => d.active).map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground capitalize">
                        {d.type.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-muted truncate">{d.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
