"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface OrderProposal {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  orderType: string;
  limitPrice?: number;
  riskLevel: string;
  governorWarnings: string[];
  status: "pending_approval" | "approved" | "rejected" | "executed" | "cancelled";
  rejectionReason?: string;
  createdAt: string;
  approvedAt?: string;
  executedAt?: string;
}

interface BrokerOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  status: "filled" | "cancelled" | "pending" | "partial";
  filled_price?: number;
  created_at: string;
}

interface PositionSizeResult {
  recommended_shares: number;
  estimated_cost: number;
  position_percent: number;
  risk_assessment: string;
}

export default function TradingDashboard() {
  const [activeTab, setActiveTab] = useState<"proposals" | "orders" | "position-sizer">("proposals");

  // Proposals tab state
  const [proposals, setProposals] = useState<OrderProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Orders tab state
  const [orders, setOrders] = useState<BrokerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Position Sizer tab state
  const [positionSymbol, setPositionSymbol] = useState("");
  const [positionSide, setPositionSide] = useState<"buy" | "sell">("buy");
  const [positionResult, setPositionResult] = useState<PositionSizeResult | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);

  // Alerts
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load proposals
  const loadProposals = useCallback(async () => {
    setProposalsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/golddigger/trading?action=proposals");
      if (res.ok) {
        const data = await res.json();
        setProposals(data.proposals ?? []);
      } else {
        setError("Failed to load proposals");
      }
    } catch {
      setError("Connection error loading proposals");
    } finally {
      setProposalsLoading(false);
    }
  }, []);

  // Load orders
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/golddigger/broker?action=orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      } else {
        setError("Failed to load orders");
      }
    } catch {
      setError("Connection error loading orders");
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  // Load data when tabs change
  useEffect(() => {
    if (activeTab === "proposals") {
      loadProposals();
    } else if (activeTab === "orders") {
      loadOrders();
    }
  }, [activeTab, loadProposals, loadOrders]);

  // Approve proposal
  async function handleApprove(proposalId: string) {
    setActionLoading(proposalId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          proposal_id: proposalId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProposals((prev) =>
          prev.map((p) => (p.id === proposalId ? { ...p, status: "approved", approvedAt: data.proposal?.approvedAt ?? data.approvedAt ?? new Date().toISOString() } : p))
        );
        setSuccess("Proposal approved");
        setTimeout(() => setSuccess(null), 2000);
        loadProposals();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to approve proposal");
      }
    } catch {
      setError("Failed to approve proposal");
    } finally {
      setActionLoading(null);
    }
  }

  // Reject proposal
  async function handleReject(proposalId: string) {
    const reason = rejectionReasons[proposalId]?.trim();
    if (!reason) {
      setError("Please provide a rejection reason");
      return;
    }

    setActionLoading(proposalId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          proposal_id: proposalId,
          rejection_reason: reason,
        }),
      });

      if (res.ok) {
        setProposals((prev) =>
          prev.map((p) =>
            p.id === proposalId ? { ...p, status: "rejected", rejectionReason: reason } : p
          )
        );
        setRejectingId(null);
        setRejectionReasons((prev) => {
          const next = { ...prev };
          delete next[proposalId];
          return next;
        });
        setSuccess("Proposal rejected");
        setTimeout(() => setSuccess(null), 2000);
        loadProposals();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to reject proposal");
      }
    } catch {
      setError("Failed to reject proposal");
    } finally {
      setActionLoading(null);
    }
  }

  // Execute proposal
  async function handleExecute(proposalId: string) {
    setActionLoading(proposalId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          proposal_id: proposalId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProposals((prev) =>
          prev.map((p) => (p.id === proposalId ? { ...p, status: "executed", executedAt: data.executedAt ?? new Date().toISOString() } : p))
        );
        setSuccess("Proposal executed successfully");
        setTimeout(() => setSuccess(null), 2000);
        loadProposals();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to execute proposal");
      }
    } catch {
      setError("Failed to execute proposal");
    } finally {
      setActionLoading(null);
    }
  }

  // Calculate position size
  async function handleCalculatePosition() {
    if (!positionSymbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setPositionLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/golddigger/trading?action=position-size&symbol=${encodeURIComponent(
          positionSymbol.toUpperCase()
        )}&side=${positionSide}`
      );

      if (res.ok) {
        const data = await res.json();
        setPositionResult(data.result);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to calculate position size");
      }
    } catch {
      setError("Failed to calculate position size");
    } finally {
      setPositionLoading(false);
    }
  }

  // Get status badge colors
  function getStatusBadge(status: string) {
    switch (status) {
      case "pending_approval":
        return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
      case "approved":
        return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      case "rejected":
        return "bg-red-500/10 text-red-400 border border-red-500/20";
      case "executed":
        return "bg-success/10 text-success border border-success/20";
      case "cancelled":
        return "bg-muted/10 text-muted border border-muted/20";
      case "filled":
        return "bg-success/10 text-success border border-success/20";
      case "partial":
        return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
      default:
        return "bg-border/50 text-muted/60";
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Trading Dashboard <span className="text-accent text-sm font-normal">AGI</span>
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Manage order proposals, review broker orders, and calculate position sizes
          </p>
        </div>
        <Link
          href="/dashboard/gold-digger"
          className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
        >
          Back to chat
        </Link>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-3 text-xs text-success">
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("proposals")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "proposals"
              ? "border-accent text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Proposals
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "orders"
              ? "border-accent text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Orders
        </button>
        <button
          onClick={() => setActiveTab("position-sizer")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "position-sizer"
              ? "border-accent text-foreground"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          Position Sizer
        </button>
      </div>

      {/* Proposals Tab */}
      {activeTab === "proposals" && (
        <div className="space-y-4">
          {proposalsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-xl p-4 animate-pulse"
                >
                  <div className="h-5 bg-border/30 rounded w-32 mb-4" />
                  <div className="h-4 bg-border/30 rounded w-48 mb-2" />
                  <div className="h-3 bg-border/30 rounded w-64" />
                </div>
              ))}
            </div>
          ) : proposals.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">📋</div>
              <div className="text-sm text-muted mb-2">No proposals yet</div>
              <div className="text-xs text-muted/60">
                Ask Gold Digger to analyze a stock and make a recommendation.
              </div>
            </div>
          ) : (
            proposals.map((proposal) => (
              <div
                key={proposal.id}
                className={`bg-card border border-border rounded-xl p-5 space-y-4 ${
                  proposal.riskLevel === "high"
                    ? "border-l-4 border-l-red-500 bg-red-500/[0.02]"
                    : proposal.riskLevel === "medium"
                      ? "border-l-4 border-l-amber-500"
                      : proposal.riskLevel === "low"
                        ? "border-l-4 border-l-green-500"
                        : ""
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-3 mb-2">
                      <span className="text-lg font-bold text-foreground">
                        {proposal.symbol}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          proposal.side === "buy"
                            ? "bg-success/10 text-success border border-success/20"
                            : "bg-red-500/10 text-red-400 border border-red-500/20"
                        }`}
                      >
                        {proposal.side.toUpperCase()}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${getStatusBadge(proposal.status)}`}>
                        {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                      </span>
                    </div>
                    <div className="text-sm text-muted">
                      {proposal.quantity} shares @ {proposal.orderType}
                      {proposal.limitPrice ? ` $${proposal.limitPrice.toFixed(2)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted/60">
                      {new Date(proposal.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-t border-b border-border">
                  <div>
                    <div className="text-xs text-muted mb-1">Risk Level</div>
                    <div className="text-sm font-medium text-foreground capitalize">
                      {proposal.riskLevel}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted mb-1">Order Type</div>
                    <div className="text-sm font-medium text-foreground capitalize">
                      {proposal.orderType}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted mb-1">Quantity</div>
                    <div className="text-sm font-medium text-foreground">
                      {proposal.quantity}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted mb-1">Limit Price</div>
                    <div className="text-sm font-medium text-foreground">
                      {proposal.limitPrice ? `$${proposal.limitPrice.toFixed(2)}` : "—"}
                    </div>
                  </div>
                </div>

                {/* Governor Warnings */}
                {proposal.governorWarnings.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-warning font-medium">Governor Warnings:</div>
                    <div className="space-y-1">
                      {proposal.governorWarnings.map((warning, idx) => (
                        <div
                          key={idx}
                          className="text-xs text-warning/80 flex gap-2 items-start"
                        >
                          <span className="text-warning/60 mt-0.5">⚠</span>
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejection Reason */}
                {proposal.status === "rejected" && proposal.rejectionReason && (
                  <div className="space-y-2">
                    <div className="text-xs text-red-400 font-medium">Rejection Reason:</div>
                    <div className="text-xs text-red-400/80">{proposal.rejectionReason}</div>
                  </div>
                )}

                {/* Actions */}
                {proposal.status === "pending_approval" && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(proposal.id)}
                        disabled={actionLoading === proposal.id}
                        className="flex-1 px-4 py-2 bg-success hover:bg-success/90 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {actionLoading === proposal.id ? "Approving..." : "Approve"}
                      </button>
                      <button
                        onClick={() => setRejectingId(rejectingId === proposal.id ? null : proposal.id)}
                        className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-lg text-xs font-medium transition-colors"
                      >
                        Reject
                      </button>
                    </div>

                    {/* Rejection Input */}
                    {rejectingId === proposal.id && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={rejectionReasons[proposal.id] || ""}
                          onChange={(e) =>
                            setRejectionReasons((prev) => ({
                              ...prev,
                              [proposal.id]: e.target.value,
                            }))
                          }
                          placeholder="Why are you rejecting this proposal?"
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                        />
                        <button
                          onClick={() => handleReject(proposal.id)}
                          disabled={actionLoading === proposal.id}
                          className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {actionLoading === proposal.id ? "..." : "Send"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {proposal.status === "approved" && (
                  <button
                    onClick={() => handleExecute(proposal.id)}
                    disabled={actionLoading === proposal.id}
                    className="w-full px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading === proposal.id ? "Executing..." : "Execute Order"}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {ordersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-xl p-4 animate-pulse"
                >
                  <div className="h-5 bg-border/30 rounded w-32 mb-4" />
                  <div className="h-4 bg-border/30 rounded w-48 mb-2" />
                  <div className="h-3 bg-border/30 rounded w-64" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <div className="text-3xl mb-2">📦</div>
              <div className="text-sm text-muted">No orders yet</div>
              <div className="text-xs text-muted/60">
                Your broker order history will appear here.
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted">Symbol</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted">Side</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted">Quantity</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted">Filled Price</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-muted">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border/50 hover:bg-background/50 transition-colors"
                    >
                      <td className="py-3 px-4 text-foreground font-medium">{order.symbol}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            order.side === "buy"
                              ? "bg-success/10 text-success border border-success/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {order.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground">{order.quantity}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${getStatusBadge(order.status)}`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        {order.filled_price ? `$${order.filled_price.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3 px-4 text-muted text-xs">
                        {new Date(order.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Position Sizer Tab */}
      {activeTab === "position-sizer" && (
        <div className="space-y-4 max-w-2xl">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <div className="text-sm font-medium text-foreground mb-4">Calculate Position Size</div>
              <div className="space-y-3">
                {/* Symbol Input */}
                <div>
                  <label className="text-xs text-muted mb-1.5 block">Symbol</label>
                  <input
                    type="text"
                    value={positionSymbol}
                    onChange={(e) => setPositionSymbol(e.target.value.toUpperCase())}
                    placeholder="e.g., AAPL, TSLA, BTC-USD"
                    maxLength={10}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                  />
                </div>

                {/* Side Selection */}
                <div>
                  <label className="text-xs text-muted mb-1.5 block">Side</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPositionSide("buy")}
                      className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                        positionSide === "buy"
                          ? "bg-success/10 text-success border-success/30"
                          : "bg-background border-border text-muted hover:text-foreground"
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      onClick={() => setPositionSide("sell")}
                      className={`flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                        positionSide === "sell"
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : "bg-background border-border text-muted hover:text-foreground"
                      }`}
                    >
                      Sell
                    </button>
                  </div>
                </div>

                {/* Calculate Button */}
                <button
                  onClick={handleCalculatePosition}
                  disabled={!positionSymbol.trim() || positionLoading}
                  className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {positionLoading ? "Calculating..." : "Calculate"}
                </button>
              </div>
            </div>

            {/* Results */}
            {positionResult && (
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="text-sm font-medium text-foreground mb-3">Results</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-xs text-muted mb-1">Recommended Shares</div>
                    <div className="text-lg font-bold text-foreground">
                      {positionResult.recommended_shares.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-xs text-muted mb-1">Estimated Cost</div>
                    <div className="text-lg font-bold text-foreground">
                      ${positionResult.estimated_cost.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-xs text-muted mb-1">Position %</div>
                    <div className="text-lg font-bold text-foreground">
                      {positionResult.position_percent.toFixed(2)}%
                    </div>
                  </div>
                  <div className="bg-background rounded-lg p-3 border border-border">
                    <div className="text-xs text-muted mb-1">Risk Assessment</div>
                    <div className={`text-xs font-medium capitalize ${
                      positionResult.risk_assessment === "low"
                        ? "text-success"
                        : positionResult.risk_assessment === "medium"
                        ? "text-yellow-400"
                        : "text-red-400"
                    }`}>
                      {positionResult.risk_assessment}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
