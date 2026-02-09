"use client";

import { useState, useEffect } from "react";
import { useTier } from "../components/TierProvider";

interface Prediction {
  id: string;
  symbol: string;
  predictionType: string;
  prediction: string;
  confidence: number;
  priceAtPrediction: number;
  targetPrice: number;
  direction: string;
  timeframeHours: number;
  createdAt: string;
  expiresAt: string;
  outcome?: "correct" | "incorrect" | "partiallyCorrect" | "pending" | "expired";
  priceAtResolution?: number;
  resolvedAt?: string;
  accuracyScore?: number;
  modelTier: string;
  source: string;
}

interface LiveReadiness {
  meetsMinPredictions: boolean;
  meetsWinRate: boolean;
  meetsMinDays: boolean;
  daysTracking: number;
  ready: boolean;
}

interface ByTypeStats {
  total: number;
  correct: number;
  accuracy: number;
}

interface StatsData {
  totalPredictions: number;
  resolved: number;
  pending: number;
  correct: number;
  incorrect: number;
  partiallyCorrect: number;
  expired: number;
  accuracy: number;
  weightedAccuracy: number;
  avgConfidenceCorrect: number;
  avgConfidenceIncorrect: number;
  calibrationScore: number;
  byType: Record<string, ByTypeStats>;
  byTier: Record<string, ByTypeStats>;
  recentAccuracy: number;
  currentStreak: number;
  bestStreak: number;
  liveReadiness: LiveReadiness;
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 0.7) return "text-success";
  if (accuracy >= 0.55) return "text-warning";
  return "text-danger";
}

function getAccuracyBgColor(accuracy: number): string {
  if (accuracy >= 0.7) return "bg-success/10";
  if (accuracy >= 0.55) return "bg-warning/10";
  return "bg-danger/10";
}

function formatPercent(value: number): string {
  return (value * 100).toFixed(1);
}

export default function PredictionsPage() {
  const { tier } = useTier();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Newbies shouldn't see this page, but add check anyway
  const isNewbie = tier === "newbie";
  const isIntermediate = tier === "intermediate";
  const isExpert = tier === "expert";

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        // Fetch stats
        const statsRes = await fetch("/api/golddigger/predictions?action=stats");
        if (!statsRes.ok) throw new Error("Failed to load stats");
        const statsData = await statsRes.json();
        setStats(statsData.stats ?? statsData);

        // Fetch predictions list
        const predsRes = await fetch("/api/golddigger/predictions?action=list&limit=50");
        if (!predsRes.ok) throw new Error("Failed to load predictions");
        const predsData = await predsRes.json();
        setPredictions(predsData.predictions ?? predsData ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto flex items-center justify-center py-20">
        <div className="text-muted text-sm">Loading prediction analytics...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Prediction Analytics</h1>
            <p className="text-muted mt-1">Track prediction accuracy and live trading readiness</p>
          </div>
        </div>

        {/* Empty State */}
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">📊</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-3">No Predictions Tracked Yet</h2>
          <p className="text-muted max-w-md mx-auto">
            Use Gold Digger chat to get investment analysis — predictions are tracked automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prediction Analytics</h1>
        <p className="text-muted mt-1">Track prediction accuracy and live trading readiness</p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Live Readiness Gate */}
      {!isNewbie && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Live Trading Readiness</h2>
              <p className="text-xs text-muted mt-1">Progress toward paper trading graduation</p>
            </div>
            <div
              className={`px-4 py-1.5 rounded-full text-sm font-medium ${
                stats?.liveReadiness?.ready
                  ? "bg-success/10 text-success border border-success/20"
                  : "bg-warning/10 text-warning border border-warning/20"
              }`}
            >
              {stats?.liveReadiness?.ready ? "READY FOR LIVE" : "PAPER TRADING"}
            </div>
          </div>

          <p className="text-xs text-muted">
            {stats?.liveReadiness?.ready
              ? "You have met all requirements for live trading. Congratulations!"
              : "Complete the requirements below to graduate from paper trading to live predictions."}
          </p>

          {isExpert && (
            // Detailed 3-column view for experts
            <div className="grid grid-cols-3 gap-4">
              {/* Predictions Needed */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Predictions</span>
                  <span className="text-xs text-muted">
                    {stats?.totalPredictions ?? 0} / 50
                  </span>
                </div>
                <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ((stats?.totalPredictions ?? 0) / 50) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted mt-1">50 predictions needed</div>
              </div>

              {/* Accuracy Needed */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Accuracy</span>
                  <span className="text-xs text-muted">
                    {formatPercent(stats?.accuracy ?? 0)}% / 55%
                  </span>
                </div>
                <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ((stats?.accuracy ?? 0) / 0.55) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted mt-1">55% win rate needed</div>
              </div>

              {/* Days Needed */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Time</span>
                  <span className="text-xs text-muted">
                    {stats?.liveReadiness?.daysTracking ?? 0} / 30 days
                  </span>
                </div>
                <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-300"
                    style={{
                      width: `${Math.min(100, ((stats?.liveReadiness?.daysTracking ?? 0) / 30) * 100)}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-muted mt-1">30 days tracking needed</div>
              </div>
            </div>
          )}

          {isIntermediate && (
            // Simplified single-row view for intermediate
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Predictions tracked</span>
                <span className="font-semibold text-foreground">{stats?.totalPredictions ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Accuracy</span>
                <span className={`font-semibold ${getAccuracyColor(stats?.accuracy ?? 0)}`}>
                  {formatPercent(stats?.accuracy ?? 0)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Days tracking</span>
                <span className="font-semibold text-foreground">
                  {stats?.liveReadiness?.daysTracking ?? 0} / 30
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Overview Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Total Predictions */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">Total Predictions</div>
          <div className="text-3xl font-bold text-foreground">{stats?.totalPredictions ?? 0}</div>
          <div className="space-y-1 text-xs text-muted">
            <div className="flex items-center justify-between">
              <span>Resolved:</span>
              <span className="text-foreground font-medium">{stats?.resolved ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Pending:</span>
              <span className="text-warning font-medium">{stats?.pending ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Expired:</span>
              <span className="text-muted font-medium">{stats?.expired ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Overall Accuracy */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">Overall Accuracy</div>
          <div className={`text-3xl font-bold ${getAccuracyColor(stats?.accuracy ?? 0)}`}>
            {formatPercent(stats?.accuracy ?? 0)}%
          </div>
          <div className={`text-xs px-2 py-1 rounded-lg ${getAccuracyBgColor(stats?.accuracy ?? 0)}`}>
            {(stats?.accuracy ?? 0) >= 0.7
              ? "Excellent"
              : (stats?.accuracy ?? 0) >= 0.55
                ? "Acceptable"
                : "Needs improvement"}
          </div>
        </div>

        {/* Streaks */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">Streaks</div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-muted mb-1">Current</div>
              <div className="text-2xl font-bold text-accent">{stats?.currentStreak ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted mb-1">Best</div>
              <div className="text-2xl font-bold text-foreground">{stats?.bestStreak ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Calibration Score */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-muted font-medium uppercase tracking-wider">Calibration Score</div>
          <div className="text-3xl font-bold text-foreground">{((stats?.calibrationScore ?? 0) * 100).toFixed(2)}%</div>
          <div className="text-xs text-muted">Lower is better</div>
        </div>
      </div>

      {/* Accuracy by Type — Expert only */}
      {isExpert && stats?.byType && Object.keys(stats.byType).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="text-lg font-semibold text-foreground">Accuracy by Prediction Type</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Object.entries(stats.byType).map(([type, data]) => (
              <div key={type} className="bg-background border border-border rounded-lg p-4 space-y-2">
                <div className="text-xs text-muted font-medium uppercase tracking-wider">{type}</div>
                <div className="flex items-baseline gap-2">
                  <div className={`text-2xl font-bold ${getAccuracyColor(data.accuracy)}`}>
                    {formatPercent(data.accuracy)}%
                  </div>
                  <div className="text-xs text-muted">({data.correct}/{data.total})</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accuracy by Model Tier — Expert only */}
      {isExpert && stats?.byTier && Object.keys(stats.byTier).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="text-lg font-semibold text-foreground">Accuracy by Model Tier</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(stats.byTier).map(([tier, data]) => (
              <div key={tier} className="bg-background border border-border rounded-lg p-5 space-y-3">
                <div className="text-sm font-semibold text-foreground capitalize">{tier}</div>
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted">Accuracy</span>
                    <span className={`text-xl font-bold ${getAccuracyColor(data.accuracy)}`}>
                      {formatPercent(data.accuracy)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs text-muted">
                    <span>Predictions</span>
                    <span>{data.correct} / {data.total}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Predictions */}
      {predictions && predictions.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="text-lg font-semibold text-foreground">Recent Predictions</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-foreground">Symbol</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Prediction</th>
                  <th className="text-right px-4 py-3 font-medium text-foreground">Confidence</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Outcome</th>
                  <th className="text-right px-4 py-3 font-medium text-foreground">Entry</th>
                  <th className="text-right px-4 py-3 font-medium text-foreground">Exit</th>
                  <th className="text-left px-4 py-3 font-medium text-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred) => (
                  <tr key={pred.id} className="border-b border-border hover:bg-background transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{pred.symbol}</td>
                    <td className="px-4 py-3 text-muted text-xs">{pred.predictionType}</td>
                    <td className="px-4 py-3 text-muted text-xs max-w-xs truncate" title={pred.prediction}>
                      {pred.prediction}
                    </td>
                    <td className="text-right px-4 py-3 text-foreground font-medium">{formatPercent(pred.confidence)}%</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          pred.outcome === "correct"
                            ? "bg-success/10 text-success"
                            : pred.outcome === "incorrect"
                              ? "bg-danger/10 text-danger"
                              : pred.outcome === "partiallyCorrect"
                                ? "bg-warning/10 text-warning"
                                : pred.outcome === "expired"
                                  ? "bg-muted/10 text-muted"
                                  : "bg-accent/10 text-accent"
                        }`}
                      >
                        {pred.outcome
                          ? pred.outcome === "partiallyCorrect"
                            ? "Partial"
                            : pred.outcome.charAt(0).toUpperCase() + pred.outcome.slice(1)
                          : "Pending"}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3 text-muted">
                      ${pred.priceAtPrediction?.toFixed(2) || "—"}
                    </td>
                    <td className="text-right px-4 py-3 text-muted">
                      ${pred.priceAtResolution?.toFixed(2) || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {new Date(pred.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
