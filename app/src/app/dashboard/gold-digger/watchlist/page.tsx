"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface QuoteData {
  symbol: string;
  currentPrice: number | null;
  change24h: number | null;
  trend: "up" | "down" | "neutral";
  lastUpdated: string;
}

const SUGGESTION_SYMBOLS = ["AAPL", "TSLA", "BTC-USD", "ETH-USD", "NVDA", "SPY", "GOOGL", "AMZN"];

export default function WatchlistPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load watchlist
  const loadWatchlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/golddigger/watchlist");
      if (res.ok) {
        const data = await res.json();
        setQuotes(data.quotes ?? []);
      } else {
        setError("Failed to load watchlist");
      }
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  // Add symbol to watchlist
  async function handleAddSymbol(e: React.FormEvent) {
    e.preventDefault();
    if (!newSymbol.trim()) return;

    const symbol = newSymbol.trim().toUpperCase();

    // Validate format
    if (!/^[A-Z]{1,5}(-[A-Z]{1,5})?$/.test(symbol)) {
      setError("Invalid symbol format (e.g., AAPL or BTC-USD)");
      return;
    }

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });

      if (res.ok) {
        const data = await res.json();
        setQuotes((prev) => [...prev, data.quote]);
        setNewSymbol("");
        setSuccess(`Added ${symbol} to watchlist`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add symbol");
      }
    } catch {
      setError("Failed to add symbol");
    } finally {
      setAdding(false);
    }
  }

  // Remove symbol from watchlist
  async function handleRemoveSymbol(symbol: string) {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });

      if (res.ok) {
        setQuotes((prev) => prev.filter((q) => q.symbol !== symbol));
        setSuccess(`Removed ${symbol} from watchlist`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to remove symbol");
      }
    } catch {
      setError("Failed to remove symbol");
    }
  }

  // Navigate to chat with pre-filled query
  function handleCardClick(symbol: string) {
    router.push(`/dashboard/gold-digger?q=Analyze+${symbol}`);
  }

  // Add suggestion symbol
  async function handleSuggestion(symbol: string) {
    if (quotes.some((q) => q.symbol === symbol)) {
      setError(`${symbol} is already in your watchlist`);
      return;
    }

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/golddigger/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });

      if (res.ok) {
        const data = await res.json();
        setQuotes((prev) => [...prev, data.quote]);
        setSuccess(`Added ${symbol} to watchlist`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add symbol");
      }
    } catch {
      setError("Failed to add symbol");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Watchlist <span className="text-accent text-sm font-normal">AGI</span>
          </h1>
          <p className="text-sm text-muted mt-0.5">
            Track your favorite stocks and crypto in real-time
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadWatchlist}
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

      {/* Add Symbol Form */}
      {adding || quotes.length > 0 ? (
        <form onSubmit={handleAddSymbol} className="bg-card border border-border rounded-xl p-4 flex gap-2">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            placeholder="Enter symbol (e.g., AAPL, BTC-USD)"
            maxLength={10}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
            disabled={adding}
          />
          <button
            type="submit"
            disabled={!newSymbol.trim() || adding}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </form>
      ) : null}

      {/* Empty State */}
      {!loading && quotes.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">📊</div>
          <div className="text-sm text-muted mb-4">No symbols on your watchlist yet</div>
          <div className="text-xs text-muted/60 mb-6">
            Add your first symbol to get started with real-time price tracking
          </div>

          {/* Suggestion Chips */}
          <div className="flex flex-wrap gap-2 justify-center mb-4">
            {SUGGESTION_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                onClick={() => handleSuggestion(symbol)}
                disabled={adding}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-border bg-background text-muted hover:text-foreground hover:border-accent/40 transition-colors disabled:opacity-50"
              >
                + {symbol}
              </button>
            ))}
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleAddSymbol} className="flex gap-2 max-w-xs mx-auto">
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="Or type a symbol"
              maxLength={5}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-accent"
              disabled={adding}
            />
            <button
              type="submit"
              disabled={!newSymbol.trim() || adding}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
          </form>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-xl p-4 animate-pulse"
            >
              <div className="h-6 bg-border/30 rounded w-16 mb-4" />
              <div className="h-4 bg-border/30 rounded w-24 mb-2" />
              <div className="h-3 bg-border/30 rounded w-32" />
            </div>
          ))}
        </div>
      )}

      {/* Watchlist Cards */}
      {!loading && quotes.length > 0 && (
        <div className="space-y-3">
          {/* Quick Add */}
          <div className="flex gap-2 flex-wrap">
            {SUGGESTION_SYMBOLS.filter((s) => !quotes.some((q) => q.symbol === s)).map(
              (symbol) => (
                <button
                  key={symbol}
                  onClick={() => handleSuggestion(symbol)}
                  disabled={adding}
                  className="px-2.5 py-1 rounded-full text-[10px] border border-border bg-background text-muted hover:text-foreground hover:border-accent/40 transition-colors disabled:opacity-50"
                >
                  + {symbol}
                </button>
              )
            )}
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quotes.map((quote) => (
              <div
                key={quote.symbol}
                className="bg-card border border-border rounded-xl p-4 hover:border-accent/40 transition-colors cursor-pointer relative group"
              >
                {/* Remove Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveSymbol(quote.symbol);
                  }}
                  className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                  title="Remove from watchlist"
                >
                  ×
                </button>

                {/* Main Content */}
                <div
                  onClick={() => handleCardClick(quote.symbol)}
                  className="cursor-pointer"
                >
                  {/* Symbol & Trend */}
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-lg font-bold text-foreground">
                      {quote.symbol}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        quote.trend === "up"
                          ? "bg-green-500/10 text-green-400"
                          : quote.trend === "down"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-border/30 text-muted/60"
                      }`}
                    >
                      {quote.trend === "up"
                        ? "↑"
                        : quote.trend === "down"
                          ? "↓"
                          : "→"}
                    </span>
                  </div>

                  {/* Price */}
                  {quote.currentPrice !== null ? (
                    <div className="mb-2">
                      <div className="text-2xl font-bold text-foreground">
                        ${quote.currentPrice.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`text-sm font-medium ${
                          quote.change24h !== null && quote.change24h > 0
                            ? "text-green-400"
                            : quote.change24h !== null && quote.change24h < 0
                              ? "text-red-400"
                              : "text-muted"
                        }`}
                      >
                        {quote.change24h !== null ? (
                          <>
                            {quote.change24h > 0 ? "+" : ""}
                            {quote.change24h.toFixed(2)}%
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-2">
                      <div className="text-lg text-muted/60">Loading...</div>
                    </div>
                  )}

                  {/* Last Updated */}
                  <div className="text-[10px] text-muted/50">
                    {new Date(quote.lastUpdated).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
