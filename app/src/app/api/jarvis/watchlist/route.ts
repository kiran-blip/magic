/**
 * Gold Digger Watchlist API
 *
 * GET  /api/jarvis/watchlist — Returns all watched symbols with latest quotes
 * POST /api/jarvis/watchlist — Add a symbol to watchlist (body: { symbol: string })
 * DELETE /api/jarvis/watchlist — Remove a symbol from watchlist (body: { symbol: string })
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import * as fs from "fs";
import * as path from "path";

interface WatchlistData {
  symbols: string[];
  updatedAt: string;
}

interface QuoteData {
  symbol: string;
  currentPrice: number | null;
  change24h: number | null;
  trend: "up" | "down" | "neutral";
  lastUpdated: string;
}

const DATA_DIR = process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
const WATCHLIST_FILE = path.join(DATA_DIR, "golddigger-watchlist.json");
const MAX_SYMBOLS = 20;

// Ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Load watchlist from file
function loadWatchlist(): WatchlistData {
  try {
    ensureDataDir();
    if (fs.existsSync(WATCHLIST_FILE)) {
      const content = fs.readFileSync(WATCHLIST_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // If file is corrupted, return empty
  }
  return { symbols: [], updatedAt: new Date().toISOString() };
}

// Save watchlist to file
function saveWatchlist(data: WatchlistData): void {
  ensureDataDir();
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(data, null, 2));
}

// Authenticate request
async function authenticate() {
  const cookieStore = await cookies();
  const token = cookieStore.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Fetch quote from Yahoo Finance
async function fetchQuote(symbol: string): Promise<QuoteData> {
  const timestamp = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GoldDigger/1.0)",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        symbol,
        currentPrice: null,
        change24h: null,
        trend: "neutral",
        lastUpdated: timestamp,
      };
    }

    const data = await response.json() as any;

    // Extract latest close price and previous close
    const results = data.chart?.result?.[0];
    if (!results || !results.timestamp || !results.indicators?.quote?.[0]) {
      return {
        symbol,
        currentPrice: null,
        change24h: null,
        trend: "neutral",
        lastUpdated: timestamp,
      };
    }

    const quotes = results.indicators.quote[0];
    const closes = quotes.close || [];

    if (closes.length < 2) {
      return {
        symbol,
        currentPrice: null,
        change24h: null,
        trend: "neutral",
        lastUpdated: timestamp,
      };
    }

    // Get latest close and previous close
    const currentPrice = closes[closes.length - 1];
    const previousClose = closes[closes.length - 2];

    if (!currentPrice || !previousClose) {
      return {
        symbol,
        currentPrice: null,
        change24h: null,
        trend: "neutral",
        lastUpdated: timestamp,
      };
    }

    const change24h = ((currentPrice - previousClose) / previousClose) * 100;
    const trend = change24h > 0 ? "up" : change24h < 0 ? "down" : "neutral";

    return {
      symbol,
      currentPrice: Math.round(currentPrice * 100) / 100,
      change24h: Math.round(change24h * 100) / 100,
      trend,
      lastUpdated: timestamp,
    };
  } catch {
    return {
      symbol,
      currentPrice: null,
      change24h: null,
      trend: "neutral",
      lastUpdated: timestamp,
    };
  }
}

/** GET — Return all watched symbols with current quotes */
export async function GET() {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const watchlist = loadWatchlist();

    // Fetch quotes for all symbols in parallel with 8s timeout each
    const quotePromises = watchlist.symbols.map((symbol) => fetchQuote(symbol));
    const quotes = await Promise.all(quotePromises);

    return NextResponse.json({
      success: true,
      count: watchlist.symbols.length,
      quotes,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Watchlist] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 });
  }
}

/** POST — Add a symbol to watchlist */
export async function POST(req: NextRequest) {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as { symbol?: string };
    const { symbol } = body;

    // Validate symbol
    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const normalizedSymbol = symbol.trim().toUpperCase();

    // Validate format: 1-5 uppercase letters
    if (!/^[A-Z]{1,5}$/.test(normalizedSymbol)) {
      return NextResponse.json(
        { error: "Symbol must be 1-5 uppercase letters" },
        { status: 400 }
      );
    }

    const watchlist = loadWatchlist();

    // Check if already in watchlist
    if (watchlist.symbols.includes(normalizedSymbol)) {
      return NextResponse.json(
        { error: "Symbol already in watchlist" },
        { status: 400 }
      );
    }

    // Check max limit
    if (watchlist.symbols.length >= MAX_SYMBOLS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SYMBOLS} symbols allowed` },
        { status: 400 }
      );
    }

    // Add symbol
    watchlist.symbols.push(normalizedSymbol);
    watchlist.updatedAt = new Date().toISOString();

    saveWatchlist(watchlist);

    // Fetch initial quote
    const quote = await fetchQuote(normalizedSymbol);

    return NextResponse.json({
      success: true,
      symbol: normalizedSymbol,
      quote,
      totalSymbols: watchlist.symbols.length,
    });
  } catch (err) {
    console.error("[Watchlist] POST error:", err);
    return NextResponse.json({ error: "Failed to add symbol" }, { status: 500 });
  }
}

/** DELETE — Remove a symbol from watchlist */
export async function DELETE(req: NextRequest) {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as { symbol?: string };
    const { symbol } = body;

    // Validate symbol
    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
    }

    const normalizedSymbol = symbol.trim().toUpperCase();

    const watchlist = loadWatchlist();

    // Check if symbol exists
    const index = watchlist.symbols.indexOf(normalizedSymbol);
    if (index === -1) {
      return NextResponse.json({ error: "Symbol not in watchlist" }, { status: 404 });
    }

    // Remove symbol
    watchlist.symbols.splice(index, 1);
    watchlist.updatedAt = new Date().toISOString();

    saveWatchlist(watchlist);

    return NextResponse.json({
      success: true,
      symbol: normalizedSymbol,
      totalSymbols: watchlist.symbols.length,
    });
  } catch (err) {
    console.error("[Watchlist] DELETE error:", err);
    return NextResponse.json({ error: "Failed to remove symbol" }, { status: 500 });
  }
}
