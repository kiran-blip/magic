/**
 * Broker API — connect/disconnect Alpaca, fetch account, sync positions.
 *
 * GET  /api/golddigger/broker          → broker status + account info
 * POST /api/golddigger/broker          → connect broker (store credentials)
 * DELETE /api/golddigger/broker        → disconnect broker
 * POST /api/golddigger/broker?action=sync     → force sync positions
 * POST /api/golddigger/broker?action=test     → test connection
 * GET  /api/golddigger/broker?view=positions  → list open positions
 * GET  /api/golddigger/broker?view=orders     → list recent orders
 * GET  /api/golddigger/broker?view=history    → portfolio value history
 * GET  /api/golddigger/broker?view=readiness  → live trading readiness check
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import {
  getBroker,
  initBroker,
  disconnectBroker,
  getBrokerConfig,
  getBrokerCredentials,
  storeBrokerCredentials,
  removeBrokerCredentials,
  checkLiveReadiness,
  saveBrokerConfig,
  type TradingMode,
} from "@/lib/golddigger/broker";

// ── Auth helper ─────────────────────────────────────────────────────────

async function isAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("magic-token")?.value;
    if (!token) return false;
    return !!verifyToken(token);
  } catch {
    return false;
  }
}

// ── GET — Broker status ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const config = getBrokerConfig();
  const broker = getBroker();

  // Not connected yet — try to auto-init from stored credentials
  if (!broker) {
    const creds = getBrokerCredentials();
    if (creds) {
      const reconnected = initBroker(creds);
      const test = await reconnected.testConnection();
      if (!test.connected) {
        return NextResponse.json({
          connected: false,
          tradingMode: config.tradingMode,
          tradingEnabled: config.tradingEnabled,
          error: test.error,
        });
      }
      // Now connected — continue with the request
      return handleConnectedRequest(view, reconnected, config);
    }
    return NextResponse.json({
      connected: false,
      tradingMode: config.tradingMode,
      tradingEnabled: config.tradingEnabled,
      hasCredentials: false,
    });
  }

  return handleConnectedRequest(view, broker, config);
}

async function handleConnectedRequest(
  view: string | null,
  broker: NonNullable<ReturnType<typeof getBroker>>,
  config: ReturnType<typeof getBrokerConfig>
) {
  try {
    if (view === "positions") {
      const positions = await broker.getPositions();
      return NextResponse.json({ positions });
    }

    if (view === "orders") {
      const orders = await broker.getOrders("all", 50);
      return NextResponse.json({ orders });
    }

    if (view === "history") {
      const history = await broker.getPortfolioHistory("1M", "1D");
      return NextResponse.json({ history });
    }

    if (view === "readiness") {
      // TODO: Pull real stats from prediction tracking (Phase E)
      const readiness = checkLiveReadiness({
        totalPredictions: 0,
        winRate: 0,
      });
      return NextResponse.json({ readiness });
    }

    // Default: account status
    const account = await broker.getAccount();
    const clock = await broker.isMarketOpen();

    return NextResponse.json({
      connected: true,
      tradingMode: config.tradingMode,
      tradingEnabled: config.tradingEnabled,
      account,
      market: clock,
      riskLimits: config.riskLimits,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Broker request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — Connect broker or perform actions ────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // Force sync positions
  if (action === "sync") {
    const broker = getBroker();
    if (!broker) {
      return NextResponse.json(
        { error: "Broker not connected" },
        { status: 400 }
      );
    }
    try {
      const [account, positions] = await Promise.all([
        broker.getAccount(),
        broker.getPositions(),
      ]);
      return NextResponse.json({ account, positions, syncedAt: new Date().toISOString() });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sync failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Test connection
  if (action === "test") {
    const broker = getBroker();
    if (!broker) {
      return NextResponse.json(
        { error: "Broker not connected" },
        { status: 400 }
      );
    }
    const result = await broker.testConnection();
    return NextResponse.json(result);
  }

  // Update risk limits
  if (action === "risk-limits") {
    try {
      const body = await request.json();
      const updated = saveBrokerConfig({ riskLimits: body.riskLimits });
      return NextResponse.json({ riskLimits: updated.riskLimits });
    } catch {
      return NextResponse.json(
        { error: "Invalid risk limits" },
        { status: 400 }
      );
    }
  }

  // Connect broker — store credentials and initialize
  try {
    const body = await request.json();
    const { apiKey, apiSecret, tradingMode } = body as {
      apiKey: string;
      apiSecret: string;
      tradingMode?: TradingMode;
    };

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "API key and secret are required" },
        { status: 400 }
      );
    }

    // Always default to paper mode
    const mode: TradingMode = tradingMode === "live" ? "live" : "paper";

    // Store encrypted credentials
    storeBrokerCredentials(apiKey, apiSecret, mode);

    // Initialize broker
    const broker = initBroker({ apiKey, apiSecret, tradingMode: mode });

    // Test connection
    const test = await broker.testConnection();
    if (!test.connected) {
      // Remove credentials if they don't work
      removeBrokerCredentials();
      disconnectBroker();
      return NextResponse.json(
        { error: `Connection failed: ${test.error}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      connected: true,
      tradingMode: mode,
      account: test.account,
      message: `Connected to Alpaca (${mode} trading mode)`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect broker";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE — Disconnect broker ──────────────────────────────────────────

export async function DELETE() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  removeBrokerCredentials();
  disconnectBroker();

  return NextResponse.json({
    connected: false,
    message: "Broker disconnected and credentials removed",
  });
}
