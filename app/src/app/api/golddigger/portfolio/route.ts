/**
 * Portfolio API — positions, P&L, performance, sync.
 *
 * GET  /api/golddigger/portfolio               → portfolio summary
 * GET  /api/golddigger/portfolio?view=positions → open positions
 * GET  /api/golddigger/portfolio?view=history   → all positions (open + closed)
 * GET  /api/golddigger/portfolio?view=transactions → recent transactions
 * GET  /api/golddigger/portfolio?view=performance  → performance history
 * POST /api/golddigger/portfolio?action=sync    → sync from broker
 * POST /api/golddigger/portfolio?action=record  → record manual trade
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import {
  getOpenPositions,
  getAllPositions,
  getRecentTransactions,
  getPerformanceHistory,
  syncFromBroker,
  getPortfolioSummary,
  recordTransaction,
  logAuditEvent,
} from "@/lib/golddigger/portfolio";

// ── Auth ────────────────────────────────────────────────────────────────

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

// ── GET ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");

  try {
    if (view === "positions") {
      const positions = getOpenPositions();
      return NextResponse.json({ positions });
    }

    if (view === "history") {
      const limit = parseInt(searchParams.get("limit") || "100");
      const positions = getAllPositions("default", limit);
      return NextResponse.json({ positions });
    }

    if (view === "transactions") {
      const limit = parseInt(searchParams.get("limit") || "50");
      const transactions = getRecentTransactions("default", limit);
      return NextResponse.json({ transactions });
    }

    if (view === "performance") {
      const days = parseInt(searchParams.get("days") || "30");
      const performance = getPerformanceHistory(days);
      return NextResponse.json({ performance });
    }

    // Default: full portfolio summary
    const summary = await getPortfolioSummary();
    return NextResponse.json({ summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Portfolio request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    // Sync from broker
    if (action === "sync") {
      const result = await syncFromBroker();
      logAuditEvent("portfolio_sync", "portfolio", undefined, {
        newPositions: result.newPositions,
        updatedPositions: result.updatedPositions,
        closedPositions: result.closedPositions,
      });
      return NextResponse.json(result);
    }

    // Record manual trade
    if (action === "record") {
      const body = await request.json();
      const { symbol, transactionType, quantity, price, notes } = body as {
        symbol: string;
        transactionType: string;
        quantity: number;
        price: number;
        notes?: string;
      };

      if (!symbol || !transactionType || !quantity || !price) {
        return NextResponse.json(
          { error: "symbol, transactionType, quantity, and price are required" },
          { status: 400 }
        );
      }

      const txId = recordTransaction({
        account_id: "default",
        symbol,
        transaction_type: transactionType,
        quantity,
        price,
        amount: quantity * price,
        fees: 0,
        transaction_date: new Date().toISOString(),
        broker_order_id: null,
        notes: notes ?? null,
      });

      logAuditEvent("manual_trade_recorded", "transaction", txId, {
        symbol,
        transactionType,
        quantity,
        price,
      });

      return NextResponse.json({
        id: txId,
        message: `Recorded ${transactionType} of ${quantity} ${symbol} @ $${price}`,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: sync, record" },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Portfolio action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
