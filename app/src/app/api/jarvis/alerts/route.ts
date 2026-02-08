/**
 * Gold Digger Proactive Alerts API
 *
 * GET /api/jarvis/alerts — Scan watchlist + market conditions, return alerts
 *
 * Alert types:
 * - price_move: Big 24h move on a watched symbol (>3%)
 * - market_shift: Major index movement (VIX spike, broad selloff/rally)
 * - opportunity: Previous analysis price target hit
 * - memory: Past investment decision needs review (30+ days old)
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";
import {
  recallInvestmentHistory,
} from "@/lib/jarvis/memory";

const DATA_DIR = process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
const WATCHLIST_FILE = path.join(DATA_DIR, "golddigger-watchlist.json");

interface Alert {
  id: string;
  type: "price_move" | "market_shift" | "opportunity" | "memory_review";
  severity: "info" | "warning" | "urgent";
  title: string;
  message: string;
  symbol?: string;
  timestamp: string;
  actionUrl?: string;
}

interface WatchlistData {
  symbols: string[];
  updatedAt: string;
}

function loadWatchlist(): WatchlistData {
  try {
    if (fs.existsSync(WATCHLIST_FILE)) {
      return JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf-8"));
    }
  } catch {
    // Fallback
  }
  return { symbols: [], updatedAt: new Date().toISOString() };
}

async function fetchQuote(symbol: string): Promise<{
  price: number | null;
  change: number | null;
  high52w: number | null;
  low52w: number | null;
}> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDigger/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return { price: null, change: null, high52w: null, low52w: null };

    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta ?? {};
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((c: number | null): c is number => c !== null);

    const currentPrice = meta.regularMarketPrice ?? validCloses[validCloses.length - 1] ?? null;
    const prevClose = meta.previousClose ?? (validCloses.length > 1 ? validCloses[validCloses.length - 2] : null);
    const change24h = currentPrice && prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : null;

    // 52-week from chart data (approximate with available range)
    const yearCloses = validCloses.slice(-252);
    const high52w = yearCloses.length > 0 ? Math.max(...yearCloses) : null;
    const low52w = yearCloses.length > 0 ? Math.min(...yearCloses) : null;

    return { price: currentPrice, change: change24h, high52w, low52w };
  } catch {
    return { price: null, change: null, high52w: null, low52w: null };
  }
}

async function authenticate() {
  const cookieStore = await cookies();
  const token = cookieStore.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET() {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const alerts: Alert[] = [];
  const now = new Date();

  try {
    // 1. Scan watchlist symbols for big moves
    const watchlist = loadWatchlist();
    if (watchlist.symbols.length > 0) {
      const quotes = await Promise.all(
        watchlist.symbols.map(async (symbol) => ({
          symbol,
          quote: await fetchQuote(symbol),
        }))
      );

      for (const { symbol, quote } of quotes) {
        if (quote.change !== null && Math.abs(quote.change) >= 3) {
          const direction = quote.change > 0 ? "up" : "down";
          const severity = Math.abs(quote.change) >= 7 ? "urgent" : "warning";

          alerts.push({
            id: `price_${symbol}_${now.toISOString()}`,
            type: "price_move",
            severity,
            title: `${symbol} ${direction} ${Math.abs(quote.change).toFixed(1)}%`,
            message: `${symbol} moved ${quote.change > 0 ? "+" : ""}${quote.change.toFixed(1)}% today. Current price: $${quote.price?.toFixed(2) ?? "N/A"}.`,
            symbol,
            timestamp: now.toISOString(),
            actionUrl: `/dashboard/gold-digger?q=Analyze+${symbol}`,
          });
        }

        // Near 52-week high or low
        if (quote.price && quote.high52w && quote.price >= quote.high52w * 0.97) {
          alerts.push({
            id: `high52_${symbol}_${now.toISOString()}`,
            type: "opportunity",
            severity: "info",
            title: `${symbol} near 52-week high`,
            message: `${symbol} is within 3% of its 52-week high ($${quote.high52w.toFixed(2)}). Consider whether to take profits or ride momentum.`,
            symbol,
            timestamp: now.toISOString(),
            actionUrl: `/dashboard/gold-digger?q=Analyze+${symbol}+near+52+week+high`,
          });
        } else if (quote.price && quote.low52w && quote.price <= quote.low52w * 1.05) {
          alerts.push({
            id: `low52_${symbol}_${now.toISOString()}`,
            type: "opportunity",
            severity: "warning",
            title: `${symbol} near 52-week low`,
            message: `${symbol} is within 5% of its 52-week low ($${quote.low52w.toFixed(2)}). Could be a buying opportunity or a warning signal.`,
            symbol,
            timestamp: now.toISOString(),
            actionUrl: `/dashboard/gold-digger?q=Analyze+${symbol}+near+52+week+low`,
          });
        }
      }
    }

    // 2. Check for major market moves
    const marketSymbols = ["SPY", "QQQ", "^VIX"];
    const marketQuotes = await Promise.all(
      marketSymbols.map(async (s) => ({ symbol: s, quote: await fetchQuote(s) }))
    );

    const spy = marketQuotes.find((m) => m.symbol === "SPY");
    const vix = marketQuotes.find((m) => m.symbol === "^VIX");

    if (spy?.quote.change && Math.abs(spy.quote.change) >= 1.5) {
      const direction = spy.quote.change > 0 ? "rally" : "selloff";
      alerts.push({
        id: `market_${now.toISOString()}`,
        type: "market_shift",
        severity: Math.abs(spy.quote.change) >= 3 ? "urgent" : "warning",
        title: `Market ${direction}: S&P 500 ${spy.quote.change > 0 ? "+" : ""}${spy.quote.change.toFixed(1)}%`,
        message: `Broad market ${direction} today. This affects all your positions. Consider reviewing your portfolio.`,
        timestamp: now.toISOString(),
        actionUrl: "/dashboard/gold-digger?q=What+is+happening+in+the+market+today",
      });
    }

    if (vix?.quote.price && vix.quote.price > 25) {
      alerts.push({
        id: `vix_${now.toISOString()}`,
        type: "market_shift",
        severity: vix.quote.price > 35 ? "urgent" : "warning",
        title: `VIX elevated: ${vix.quote.price.toFixed(1)}`,
        message: `Fear index (VIX) is at ${vix.quote.price.toFixed(1)} — market volatility is high. ${
          vix.quote.price > 35 ? "Extreme fear — potential buying opportunity for the brave." : "Elevated risk — consider reducing position sizes."
        }`,
        timestamp: now.toISOString(),
        actionUrl: "/dashboard/gold-digger?q=VIX+is+high+what+should+I+do",
      });
    }

    // 3. Check old investment decisions that need review
    const oldDecisions = recallInvestmentHistory(undefined, 20);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const decision of oldDecisions) {
      const decisionDate = new Date(decision.timestamp);
      if (decisionDate < thirtyDaysAgo) {
        alerts.push({
          id: `review_${decision.id}`,
          type: "memory_review",
          severity: "info",
          title: `Review: ${decision.action} ${decision.symbol} (${Math.floor((now.getTime() - decisionDate.getTime()) / 86400000)}d ago)`,
          message: `You got a ${decision.action} signal on ${decision.symbol} at ${decision.confidence}% confidence on ${decisionDate.toLocaleDateString()}. Time to check how it performed.`,
          symbol: decision.symbol,
          timestamp: now.toISOString(),
          actionUrl: `/dashboard/gold-digger?q=How+has+${decision.symbol}+performed+since+${decisionDate.toISOString().slice(0, 10)}`,
        });
      }
    }

    // Sort: urgent first, then warning, then info
    const severityOrder = { urgent: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return NextResponse.json({
      alerts,
      scannedSymbols: watchlist.symbols.length,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[Gold Digger Alerts] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate alerts", alerts: [] },
      { status: 500 }
    );
  }
}
