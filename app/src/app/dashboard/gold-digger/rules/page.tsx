"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type RuleType = "price_alert" | "dca" | "rebalance" | "stop_loss" | "take_profit" | "trailing_stop";

interface Rule {
  id: string;
  name: string;
  type: RuleType;
  symbol: string;
  status: "active" | "paused" | "triggered";
  config: Record<string, string | number | boolean | null>;
  trigger_count: number;
  last_triggered_at?: string;
  created_at: string;
}

interface Summary {
  total: number;
  active: number;
  paused: number;
  triggered: number;
}

const RULE_TYPES: Record<RuleType, { label: string; description: string }> = {
  price_alert: {
    label: "Price Alert",
    description: "Get notified when price reaches a target",
  },
  dca: {
    label: "Dollar Cost Averaging",
    description: "Automatically buy at regular intervals",
  },
  rebalance: {
    label: "Rebalance",
    description: "Maintain target portfolio allocations",
  },
  stop_loss: {
    label: "Stop Loss",
    description: "Automatically sell if price drops below target",
  },
  take_profit: {
    label: "Take Profit",
    description: "Automatically sell if price rises above target",
  },
  trailing_stop: {
    label: "Trailing Stop",
    description: "Sell if price drops by a percentage from peak",
  },
};

const TYPE_COLORS: Record<RuleType, string> = {
  price_alert: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  dca: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  rebalance: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  stop_loss: "bg-red-500/10 text-red-400 border-red-500/20",
  take_profit: "bg-green-500/10 text-green-400 border-green-500/20",
  trailing_stop: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    active: 0,
    paused: 0,
    triggered: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create rule form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "price_alert" as RuleType,
    symbol: "",
    target_price: "",
    direction: "above",
    amount: "",
    frequency: "weekly",
    target_allocations: "",
    stop_price: "",
    stop_percentage: "",
    target_percentage: "",
    trail_percent: "",
  });

  const [creating, setCreating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [operatingRuleId, setOperatingRuleId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Load rules
  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/golddigger/rules?action=list");
      if (res.ok) {
        const data = await res.json();
        const rulesList = data.rules ?? [];
        setRules(rulesList);

        // Calculate summary
        setSummary({
          total: rulesList.length,
          active: rulesList.filter((r: Rule) => r.status === "active").length,
          paused: rulesList.filter((r: Rule) => r.status === "paused").length,
          triggered: rulesList.filter((r: Rule) => r.status === "triggered").length,
        });
      } else {
        setError("Failed to load rules");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Create rule
  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim() || !formData.symbol.trim()) {
      setError("Name and symbol are required");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    const config: Record<string, unknown> = {};

    switch (formData.type) {
      case "price_alert":
        if (!formData.target_price) {
          setError("Target price is required");
          setCreating(false);
          return;
        }
        config.target_price = parseFloat(formData.target_price);
        config.direction = formData.direction;
        break;
      case "dca":
        if (!formData.amount) {
          setError("Amount is required");
          setCreating(false);
          return;
        }
        config.amount = parseFloat(formData.amount);
        config.frequency = formData.frequency;
        break;
      case "rebalance":
        if (!formData.target_allocations.trim()) {
          setError("Target allocations are required");
          setCreating(false);
          return;
        }
        try {
          const parsed = JSON.parse(formData.target_allocations);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            setError("Allocations must be a JSON object, e.g., {\"AAPL\": 0.5, \"MSFT\": 0.5}");
            setCreating(false);
            return;
          }
          const values = Object.values(parsed) as number[];
          if (values.some(v => typeof v !== "number" || v < 0 || v > 1)) {
            setError("Each allocation must be a number between 0 and 1");
            setCreating(false);
            return;
          }
          const sum = values.reduce((a, b) => a + b, 0);
          if (Math.abs(sum - 1) > 0.01) {
            setError(`Allocations must sum to 1.0 (currently ${sum.toFixed(2)})`);
            setCreating(false);
            return;
          }
          config.target_allocations = parsed;
        } catch {
          setError("Invalid JSON format. Example: {\"AAPL\": 0.5, \"MSFT\": 0.5}");
          setCreating(false);
          return;
        }
        break;
      case "stop_loss":
        if (!formData.stop_price && !formData.stop_percentage) {
          setError("Stop price or percentage is required");
          setCreating(false);
          return;
        }
        if (formData.stop_price) config.stop_price = parseFloat(formData.stop_price);
        if (formData.stop_percentage) config.percentage = parseFloat(formData.stop_percentage);
        break;
      case "take_profit":
        if (!formData.target_price && !formData.target_percentage) {
          setError("Target price or percentage is required");
          setCreating(false);
          return;
        }
        if (formData.target_price) config.target_price = parseFloat(formData.target_price);
        if (formData.target_percentage) config.percentage = parseFloat(formData.target_percentage);
        break;
      case "trailing_stop":
        if (!formData.trail_percent) {
          setError("Trail percent is required");
          setCreating(false);
          return;
        }
        config.trail_percent = parseFloat(formData.trail_percent);
        break;
    }

    try {
      const res = await fetch("/api/golddigger/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: formData.name.trim(),
          type: formData.type,
          symbol: formData.symbol.trim().toUpperCase(),
          config,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRules((prev) => [...prev, data.rule]);
        setSummary((prev) => ({ ...prev, total: prev.total + 1, active: prev.active + 1 }));
        setSuccess(`Rule "${formData.name}" created successfully`);
        setShowCreateForm(false);
        // Reset form
        setFormData({
          name: "",
          type: "price_alert",
          symbol: "",
          target_price: "",
          direction: "above",
          amount: "",
          frequency: "weekly",
          target_allocations: "",
          stop_price: "",
          stop_percentage: "",
          target_percentage: "",
          trail_percent: "",
        });
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create rule");
      }
    } catch {
      setError("Failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  // Pause rule
  async function handlePauseRule(id: string) {
    setOperatingRuleId(id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pause",
          id,
        }),
      });

      if (res.ok) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: "paused" as const } : r
          )
        );
        setSummary((prev) => ({
          ...prev,
          active: prev.active - 1,
          paused: prev.paused + 1,
        }));
        setSuccess("Rule paused");
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to pause rule");
      }
    } catch {
      setError("Failed to pause rule");
    } finally {
      setOperatingRuleId(null);
    }
  }

  // Resume rule
  async function handleResumeRule(id: string) {
    setOperatingRuleId(id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resume",
          id,
        }),
      });

      if (res.ok) {
        setRules((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: "active" as const } : r
          )
        );
        setSummary((prev) => ({
          ...prev,
          paused: prev.paused - 1,
          active: prev.active + 1,
        }));
        setSuccess("Rule resumed");
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to resume rule");
      }
    } catch {
      setError("Failed to resume rule");
    } finally {
      setOperatingRuleId(null);
    }
  }

  // Delete rule
  async function handleDeleteRule(id: string) {
    setConfirmDeleteId(null);

    setOperatingRuleId(id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/golddigger/rules?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        const rule = rules.find((r) => r.id === id);
        setRules((prev) => prev.filter((r) => r.id !== id));
        if (rule) {
          setSummary((prev) => {
            const newSummary = { ...prev, total: prev.total - 1 };
            if (rule.status === "active") newSummary.active--;
            if (rule.status === "paused") newSummary.paused--;
            if (rule.status === "triggered") newSummary.triggered--;
            return newSummary;
          });
        }
        setSuccess("Rule deleted");
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete rule");
      }
    } catch {
      setError("Failed to delete rule");
    } finally {
      setOperatingRuleId(null);
    }
  }

  // Evaluate all rules
  async function handleEvaluateNow() {
    setEvaluating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(`Evaluated ${data.evaluated ?? rules.length} rules`);
        setTimeout(() => setSuccess(null), 2000);
        // Reload rules to get updated state
        setTimeout(() => loadRules(), 500);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to evaluate rules");
      }
    } catch {
      setError("Failed to evaluate rules");
    } finally {
      setEvaluating(false);
    }
  }

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "paused":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
      case "triggered":
        return "bg-red-500/10 text-red-400 border-red-500/20";
      default:
        return "bg-border/30 text-muted";
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Automation Rules
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Create and manage trading automation rules
          </p>
        </div>
        <Link
          href="/dashboard/gold-digger"
          className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
        >
          Back to Chat
        </Link>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-xs text-green-400">
          {success}
        </div>
      )}

      {/* Summary Bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted/60 font-medium mb-1">Total Rules</div>
          <div className="text-2xl font-bold text-foreground">{summary.total}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted/60 font-medium mb-1">Active</div>
          <div className="text-2xl font-bold text-green-400">{summary.active}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted/60 font-medium mb-1">Paused</div>
          <div className="text-2xl font-bold text-yellow-400">{summary.paused}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted/60 font-medium mb-1">Triggered</div>
          <div className="text-2xl font-bold text-red-400">{summary.triggered}</div>
        </div>
      </div>

      {/* Create Rule Section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="w-full p-4 flex items-center justify-between hover:bg-background/50 transition-colors"
        >
          <div className="text-left">
            <div className="text-sm font-medium text-foreground">Create New Rule</div>
            <div className="text-xs text-muted mt-0.5">
              {showCreateForm ? "Hide form" : "Add a new automation rule"}
            </div>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-muted transition-transform ${
              showCreateForm ? "rotate-180" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showCreateForm && (
          <form
            onSubmit={handleCreateRule}
            className="border-t border-border p-4 space-y-4"
          >
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">
                Rule Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Buy AAPL below $150"
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                disabled={creating}
              />
            </div>

            {/* Type */}
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">
                Rule Type
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as RuleType })
                }
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
                disabled={creating}
              >
                {Object.entries(RULE_TYPES).map(([key, { label, description }]) => (
                  <option key={key} value={key}>
                    {label} — {description}
                  </option>
                ))}
              </select>
            </div>

            {/* Symbol */}
            <div>
              <label className="text-xs font-medium text-muted mb-1.5 block">
                Symbol
              </label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) =>
                  setFormData({ ...formData, symbol: e.target.value })
                }
                placeholder="e.g., AAPL, BTC-USD"
                className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                disabled={creating}
              />
            </div>

            {/* Dynamic fields based on type */}
            {formData.type === "price_alert" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Target Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.target_price}
                      onChange={(e) =>
                        setFormData({ ...formData, target_price: e.target.value })
                      }
                      placeholder="e.g., 150.00"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Direction
                    </label>
                    <select
                      value={formData.direction}
                      onChange={(e) =>
                        setFormData({ ...formData, direction: e.target.value })
                      }
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
                      disabled={creating}
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {formData.type === "dca" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Amount (USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) =>
                        setFormData({ ...formData, amount: e.target.value })
                      }
                      placeholder="e.g., 100"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Frequency
                    </label>
                    <select
                      value={formData.frequency}
                      onChange={(e) =>
                        setFormData({ ...formData, frequency: e.target.value })
                      }
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
                      disabled={creating}
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {formData.type === "rebalance" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted mb-1.5 block">
                    Target Allocations (JSON or text)
                  </label>
                  <textarea
                    value={formData.target_allocations}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        target_allocations: e.target.value,
                      })
                    }
                    placeholder={`e.g., {"AAPL": 0.3, "MSFT": 0.3, "GOOGL": 0.4}`}
                    rows={3}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent resize-none"
                    disabled={creating}
                  />
                </div>
              </>
            )}

            {formData.type === "stop_loss" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Stop Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.stop_price}
                      onChange={(e) =>
                        setFormData({ ...formData, stop_price: e.target.value })
                      }
                      placeholder="Optional"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Stop Percentage
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.stop_percentage}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stop_percentage: e.target.value,
                        })
                      }
                      placeholder="e.g., 10 for 10%"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                      disabled={creating}
                    />
                  </div>
                </div>
              </>
            )}

            {formData.type === "take_profit" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Target Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.target_price}
                      onChange={(e) =>
                        setFormData({ ...formData, target_price: e.target.value })
                      }
                      placeholder="Optional"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                      disabled={creating}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted mb-1.5 block">
                      Target Percentage
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.target_percentage}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          target_percentage: e.target.value,
                        })
                      }
                      placeholder="e.g., 20 for 20% gain"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                      disabled={creating}
                    />
                  </div>
                </div>
              </>
            )}

            {formData.type === "trailing_stop" && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted mb-1.5 block">
                    Trail Percent
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.trail_percent}
                    onChange={(e) =>
                      setFormData({ ...formData, trail_percent: e.target.value })
                    }
                    placeholder="e.g., 5 for 5% trailing stop"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
                    disabled={creating}
                  />
                </div>
              </>
            )}

            {/* Create Button */}
            <button
              type="submit"
              disabled={creating}
              className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Rule"}
            </button>
          </form>
        )}
      </div>

      {/* Evaluate Now Button */}
      {rules.length > 0 && (
        <button
          onClick={handleEvaluateNow}
          disabled={evaluating}
          className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {evaluating ? "Evaluating..." : "Evaluate All Rules Now"}
        </button>
      )}

      {/* Empty State */}
      {!loading && rules.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">⚙️</div>
          <div className="text-sm text-foreground font-medium mb-1">
            No rules yet
          </div>
          <div className="text-xs text-muted/60">
            Create your first automation rule above to get started
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-4 animate-pulse"
            >
              <div className="h-5 bg-border/30 rounded w-40 mb-3" />
              <div className="flex gap-2 mb-3">
                <div className="h-5 bg-border/30 rounded w-20" />
                <div className="h-5 bg-border/30 rounded w-16" />
              </div>
              <div className="h-4 bg-border/30 rounded w-32" />
            </div>
          ))}
        </div>
      )}

      {/* Rules List */}
      {!loading && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-card border border-border rounded-xl p-4 hover:border-accent/40 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-foreground">
                      {rule.name}
                    </h3>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border ${TYPE_COLORS[rule.type]}`}
                    >
                      {RULE_TYPES[rule.type].label}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border ${statusBadgeColor(rule.status)}`}
                    >
                      {rule.status.charAt(0).toUpperCase() + rule.status.slice(1)}
                    </span>
                  </div>
                  <div className="text-xs text-muted/60">
                    Symbol: <span className="font-medium text-foreground">{rule.symbol}</span>
                  </div>
                </div>
              </div>

              {/* Config Details */}
              <div className="bg-background/50 border border-border/50 rounded-lg p-2.5 mb-3 text-xs">
                <div className="space-y-1 text-muted">
                  {rule.type === "price_alert" && (
                    <>
                      <div>
                        Target: ${Number(rule.config.target_price || 0).toFixed(2)} {String(rule.config.direction || "")}
                      </div>
                    </>
                  )}
                  {rule.type === "dca" && (
                    <>
                      <div>
                        Amount: ${String(rule.config.amount || 0)} {String(rule.config.frequency || "")}
                      </div>
                    </>
                  )}
                  {rule.type === "rebalance" && (
                    <>
                      <div>
                        Allocations:{" "}
                        {String(rule.config.target_allocations || "{}").slice(0, 40) + "..."}
                      </div>
                    </>
                  )}
                  {rule.type === "stop_loss" && (
                    <>
                      {rule.config.stop_price && (
                        <div>
                          Stop Price: ${Number(rule.config.stop_price).toFixed(2)}
                        </div>
                      )}
                      {rule.config.percentage && (
                        <div>
                          Stop: {String(rule.config.percentage)}%
                        </div>
                      )}
                    </>
                  )}
                  {rule.type === "take_profit" && (
                    <>
                      {rule.config.target_price && (
                        <div>
                          Target: ${Number(rule.config.target_price).toFixed(2)}
                        </div>
                      )}
                      {rule.config.percentage && (
                        <div>
                          Target: {String(rule.config.percentage)}% gain
                        </div>
                      )}
                    </>
                  )}
                  {rule.type === "trailing_stop" && (
                    <>
                      <div>
                        Trail: {String(rule.config.trail_percent || 0)}%
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Stats and Actions */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted/60 space-y-0.5">
                  <div>
                    Triggered: <span className="font-medium text-foreground">{rule.trigger_count}</span> times
                  </div>
                  {rule.last_triggered_at && (
                    <div>
                      Last:{" "}
                      <span className="font-medium text-foreground">
                        {new Date(rule.last_triggered_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1.5">
                  {rule.status === "active" ? (
                    <button
                      onClick={() => handlePauseRule(rule.id)}
                      disabled={operatingRuleId === rule.id}
                      className="px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border border-yellow-500/20"
                    >
                      {operatingRuleId === rule.id ? "..." : "Pause"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResumeRule(rule.id)}
                      disabled={operatingRuleId === rule.id}
                      className="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border border-green-500/20"
                    >
                      {operatingRuleId === rule.id ? "..." : "Resume"}
                    </button>
                  )}
                  {confirmDeleteId === rule.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted">Delete?</span>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        disabled={operatingRuleId === rule.id}
                        className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                      >
                        {operatingRuleId === rule.id ? "..." : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 bg-card border border-border text-muted rounded text-xs hover:text-foreground transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(rule.id)}
                      disabled={operatingRuleId === rule.id}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 border border-red-500/20"
                    >
                      {operatingRuleId === rule.id ? "..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
