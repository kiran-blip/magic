/**
 * Portfolio Manager for Gold Digger AGI.
 *
 * Tracks positions, calculates P&L, manages allocations.
 * Works with both Alpaca-synced positions and manually recorded trades.
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { getBroker, type BrokerPosition } from "../broker";

// ============================================================================
// Types
// ============================================================================

export interface PortfolioPositionRow {
  id: string;
  account_id: string;
  symbol: string;
  asset_type: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  position_type: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  broker_position_id: string | null;
  stop_loss: number | null;
  take_profit: number | null;
  pnl_unrealized: number | null;
  pnl_realized: number | null;
  pnl_percent: number | null;
}

export interface PortfolioTransactionRow {
  id: string;
  account_id: string;
  symbol: string;
  transaction_type: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fees: number;
  transaction_date: string;
  broker_order_id: string | null;
  notes: string | null;
}

export interface PerformanceSnapshot {
  date: string;
  totalValue: number;
  cash: number;
  investedValue: number;
  pnlUnrealized: number;
  pnlRealized: number;
  totalReturnPercent: number;
  dayReturnPercent: number;
}

export interface PortfolioSummary {
  totalValue: number;
  cash: number;
  investedValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalReturnPercent: number;
  dayReturnPercent: number;
  positionCount: number;
  openPositions: PortfolioPositionRow[];
  winRate: number;
  bestPerformer: PortfolioPositionRow | null;
  worstPerformer: PortfolioPositionRow | null;
  allocationByAssetType: Record<string, { value: number; percent: number }>;
  concentrationRisk: number; // % of portfolio in top position
  lastSyncedAt: string | null;
}

// ============================================================================
// Database Access
// ============================================================================

function getDb(): Database.Database {
  const dataDir =
    process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "golddigger-memory.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

// ============================================================================
// Position Management
// ============================================================================

export function getOpenPositions(
  accountId: string = "default"
): PortfolioPositionRow[] {
  const db = getDb();
  try {
    return db
      .prepare(
        "SELECT * FROM portfolio_positions WHERE account_id = ? AND status = 'open' ORDER BY opened_at DESC"
      )
      .all(accountId) as PortfolioPositionRow[];
  } finally {
    db.close();
  }
}

export function getAllPositions(
  accountId: string = "default",
  limit: number = 100
): PortfolioPositionRow[] {
  const db = getDb();
  try {
    return db
      .prepare(
        "SELECT * FROM portfolio_positions WHERE account_id = ? ORDER BY opened_at DESC LIMIT ?"
      )
      .all(accountId, limit) as PortfolioPositionRow[];
  } finally {
    db.close();
  }
}

export function getPositionBySymbol(
  symbol: string,
  accountId: string = "default"
): PortfolioPositionRow | null {
  const db = getDb();
  try {
    return (
      (db
        .prepare(
          "SELECT * FROM portfolio_positions WHERE account_id = ? AND symbol = ? AND status = 'open'"
        )
        .get(accountId, symbol.toUpperCase()) as
        | PortfolioPositionRow
        | undefined) ?? null
    );
  } finally {
    db.close();
  }
}

export function upsertPosition(
  position: Omit<PortfolioPositionRow, "pnl_unrealized" | "pnl_realized" | "pnl_percent">
): string {
  const db = getDb();
  try {
    // Calculate P&L
    const currentPrice = position.current_price ?? position.entry_price;
    const isLong = position.position_type === "long";
    const pnlUnrealized = isLong
      ? (currentPrice - position.entry_price) * position.quantity
      : (position.entry_price - currentPrice) * position.quantity;
    const pnlPercent =
      position.entry_price > 0
        ? (pnlUnrealized / (position.entry_price * position.quantity)) * 100
        : 0;

    db.prepare(
      `INSERT INTO portfolio_positions
       (id, account_id, symbol, asset_type, quantity, entry_price, current_price, position_type, status, opened_at, closed_at, broker_position_id, stop_loss, take_profit, pnl_unrealized, pnl_realized, pnl_percent, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         current_price = excluded.current_price,
         quantity = excluded.quantity,
         status = excluded.status,
         closed_at = excluded.closed_at,
         stop_loss = excluded.stop_loss,
         take_profit = excluded.take_profit,
         pnl_unrealized = excluded.pnl_unrealized,
         pnl_percent = excluded.pnl_percent,
         updated_at = datetime('now')`
    ).run(
      position.id,
      position.account_id,
      position.symbol.toUpperCase(),
      position.asset_type,
      position.quantity,
      position.entry_price,
      currentPrice,
      position.position_type,
      position.status,
      position.opened_at,
      position.closed_at ?? null,
      position.broker_position_id ?? null,
      position.stop_loss ?? null,
      position.take_profit ?? null,
      pnlUnrealized,
      pnlPercent
    );

    return position.id;
  } finally {
    db.close();
  }
}

export function closePosition(
  positionId: string,
  closedPrice: number,
  closedAt?: string
): void {
  const db = getDb();
  try {
    const pos = db
      .prepare("SELECT * FROM portfolio_positions WHERE id = ?")
      .get(positionId) as PortfolioPositionRow | undefined;

    if (!pos) throw new Error(`Position ${positionId} not found`);

    const isLong = pos.position_type === "long";
    const pnlRealized = isLong
      ? (closedPrice - pos.entry_price) * pos.quantity
      : (pos.entry_price - closedPrice) * pos.quantity;

    db.prepare(
      `UPDATE portfolio_positions
       SET status = 'closed', closed_at = ?, current_price = ?, pnl_realized = ?, pnl_unrealized = 0, pnl_percent = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      closedAt ?? new Date().toISOString(),
      closedPrice,
      pnlRealized,
      pos.entry_price > 0
        ? (pnlRealized / (pos.entry_price * pos.quantity)) * 100
        : 0,
      positionId
    );
  } finally {
    db.close();
  }
}

// ============================================================================
// Transaction Logging
// ============================================================================

export function recordTransaction(
  tx: Omit<PortfolioTransactionRow, "id">
): string {
  const db = getDb();
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO portfolio_transactions
       (id, account_id, symbol, transaction_type, quantity, price, amount, fees, transaction_date, broker_order_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      tx.account_id,
      tx.symbol.toUpperCase(),
      tx.transaction_type,
      tx.quantity,
      tx.price,
      tx.amount,
      tx.fees,
      tx.transaction_date,
      tx.broker_order_id,
      tx.notes
    );
    return id;
  } finally {
    db.close();
  }
}

export function getRecentTransactions(
  accountId: string = "default",
  limit: number = 50
): PortfolioTransactionRow[] {
  const db = getDb();
  try {
    return db
      .prepare(
        "SELECT * FROM portfolio_transactions WHERE account_id = ? ORDER BY transaction_date DESC LIMIT ?"
      )
      .all(accountId, limit) as PortfolioTransactionRow[];
  } finally {
    db.close();
  }
}

// ============================================================================
// Performance Tracking
// ============================================================================

export function recordDailyPerformance(snapshot: PerformanceSnapshot): void {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO portfolio_performance
       (id, account_id, date, total_value, cash, invested_value, pnl_unrealized, pnl_realized, total_return_percent, day_return_percent)
       VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, date) DO UPDATE SET
         total_value = excluded.total_value,
         cash = excluded.cash,
         invested_value = excluded.invested_value,
         pnl_unrealized = excluded.pnl_unrealized,
         pnl_realized = excluded.pnl_realized,
         total_return_percent = excluded.total_return_percent,
         day_return_percent = excluded.day_return_percent`
    ).run(
      randomUUID(),
      snapshot.date,
      snapshot.totalValue,
      snapshot.cash,
      snapshot.investedValue,
      snapshot.pnlUnrealized,
      snapshot.pnlRealized,
      snapshot.totalReturnPercent,
      snapshot.dayReturnPercent
    );
  } finally {
    db.close();
  }
}

export function getPerformanceHistory(
  days: number = 30,
  accountId: string = "default"
): PerformanceSnapshot[] {
  const db = getDb();
  try {
    const rows = db
      .prepare(
        `SELECT * FROM portfolio_performance
         WHERE account_id = ? AND date >= date('now', '-' || ? || ' days')
         ORDER BY date ASC`
      )
      .all(accountId, days) as Array<{
      date: string;
      total_value: number;
      cash: number;
      invested_value: number;
      pnl_unrealized: number;
      pnl_realized: number;
      total_return_percent: number;
      day_return_percent: number;
    }>;

    return rows.map((r) => ({
      date: r.date,
      totalValue: r.total_value,
      cash: r.cash,
      investedValue: r.invested_value,
      pnlUnrealized: r.pnl_unrealized,
      pnlRealized: r.pnl_realized,
      totalReturnPercent: r.total_return_percent,
      dayReturnPercent: r.day_return_percent,
    }));
  } finally {
    db.close();
  }
}

// ============================================================================
// Broker Sync
// ============================================================================

export interface SyncResult {
  positions: PortfolioPositionRow[];
  totalValue: number;
  cash: number;
  syncedAt: string;
  newPositions: number;
  updatedPositions: number;
  closedPositions: number;
}

export async function syncFromBroker(): Promise<SyncResult> {
  const broker = getBroker();
  if (!broker || !broker.isConnected()) {
    throw new Error("Broker not connected");
  }

  const [account, brokerPositions] = await Promise.all([
    broker.getAccount(),
    broker.getPositions(),
  ]);

  const db = getDb();
  let newCount = 0;
  let updatedCount = 0;
  let closedCount = 0;

  try {
    // Get current open positions from DB
    const dbPositions = db
      .prepare(
        "SELECT * FROM portfolio_positions WHERE account_id = 'default' AND status = 'open'"
      )
      .all() as PortfolioPositionRow[];

    const dbSymbols = new Set(dbPositions.map((p) => p.symbol));
    const brokerSymbols = new Set(brokerPositions.map((p: BrokerPosition) => p.symbol));

    // Upsert broker positions
    for (const bp of brokerPositions) {
      const existing = dbPositions.find((p) => p.symbol === bp.symbol);
      const posId = existing?.id ?? randomUUID();

      const isNew = !dbSymbols.has(bp.symbol);
      if (isNew) newCount++;
      else updatedCount++;

      upsertPosition({
        id: posId,
        account_id: "default",
        symbol: bp.symbol,
        asset_type: bp.assetClass === "crypto" ? "crypto" : "stock",
        quantity: bp.quantity,
        entry_price: bp.entryPrice,
        current_price: bp.currentPrice,
        position_type: bp.side,
        status: "open",
        opened_at: existing?.opened_at ?? new Date().toISOString(),
        closed_at: null,
        broker_position_id: bp.assetId,
        stop_loss: existing?.stop_loss ?? null,
        take_profit: existing?.take_profit ?? null,
      });
    }

    // Close positions that are no longer in broker
    for (const dbPos of dbPositions) {
      if (!brokerSymbols.has(dbPos.symbol)) {
        closePosition(dbPos.id, dbPos.current_price ?? dbPos.entry_price);
        closedCount++;
      }
    }

    // Record daily performance snapshot
    const investedValue = brokerPositions.reduce(
      (sum: number, p: BrokerPosition) => sum + p.marketValue,
      0
    );
    const unrealizedPnl = brokerPositions.reduce(
      (sum: number, p: BrokerPosition) => sum + p.unrealizedPnl,
      0
    );

    const today = new Date().toISOString().split("T")[0];
    recordDailyPerformance({
      date: today,
      totalValue: account.portfolioValue,
      cash: account.cash,
      investedValue,
      pnlUnrealized: unrealizedPnl,
      pnlRealized: 0, // TODO: calculate from closed positions today
      totalReturnPercent:
        account.portfolioValue > 0
          ? ((account.portfolioValue - account.cash - investedValue + unrealizedPnl) /
              account.portfolioValue) *
            100
          : 0,
      dayReturnPercent: 0, // TODO: compare to yesterday's snapshot
    });

    const positions = getOpenPositions();
    return {
      positions,
      totalValue: account.portfolioValue,
      cash: account.cash,
      syncedAt: new Date().toISOString(),
      newPositions: newCount,
      updatedPositions: updatedCount,
      closedPositions: closedCount,
    };
  } finally {
    db.close();
  }
}

// ============================================================================
// Portfolio Summary
// ============================================================================

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const positions = getOpenPositions();
  const broker = getBroker();

  let totalValue = 0;
  let cash = 0;

  // Try to get live data from broker
  if (broker && broker.isConnected()) {
    try {
      const account = await broker.getAccount();
      totalValue = account.portfolioValue;
      cash = account.cash;
    } catch {
      // Fallback to calculated values
    }
  }

  const investedValue = positions.reduce(
    (sum, p) => sum + (p.current_price ?? p.entry_price) * p.quantity,
    0
  );
  if (totalValue === 0) totalValue = investedValue + cash;

  const unrealizedPnl = positions.reduce(
    (sum, p) => sum + (p.pnl_unrealized ?? 0),
    0
  );

  // Win rate from all closed positions
  const db = getDb();
  let winRate = 0;
  let realizedPnl = 0;
  try {
    const closed = db
      .prepare(
        "SELECT pnl_realized FROM portfolio_positions WHERE account_id = 'default' AND status = 'closed'"
      )
      .all() as Array<{ pnl_realized: number | null }>;

    if (closed.length > 0) {
      const wins = closed.filter((p) => (p.pnl_realized ?? 0) > 0).length;
      winRate = (wins / closed.length) * 100;
      realizedPnl = closed.reduce(
        (sum, p) => sum + (p.pnl_realized ?? 0),
        0
      );
    }
  } finally {
    db.close();
  }

  // Allocation by asset type
  const allocationByAssetType: Record<
    string,
    { value: number; percent: number }
  > = {};
  for (const pos of positions) {
    const value = (pos.current_price ?? pos.entry_price) * pos.quantity;
    const type = pos.asset_type || "stock";
    if (!allocationByAssetType[type]) {
      allocationByAssetType[type] = { value: 0, percent: 0 };
    }
    allocationByAssetType[type].value += value;
  }
  if (investedValue > 0) {
    for (const type of Object.keys(allocationByAssetType)) {
      allocationByAssetType[type].percent =
        (allocationByAssetType[type].value / investedValue) * 100;
    }
  }

  // Concentration risk (% of portfolio in top position)
  const sortedByValue = [...positions].sort(
    (a, b) =>
      (b.current_price ?? b.entry_price) * b.quantity -
      (a.current_price ?? a.entry_price) * a.quantity
  );
  const topPositionValue =
    sortedByValue.length > 0
      ? (sortedByValue[0].current_price ?? sortedByValue[0].entry_price) *
        sortedByValue[0].quantity
      : 0;
  const concentrationRisk =
    investedValue > 0 ? (topPositionValue / investedValue) * 100 : 0;

  // Best / worst performers
  const bestPerformer =
    positions.length > 0
      ? positions.reduce((best, p) =>
          (p.pnl_percent ?? 0) > (best.pnl_percent ?? 0) ? p : best
        )
      : null;
  const worstPerformer =
    positions.length > 0
      ? positions.reduce((worst, p) =>
          (p.pnl_percent ?? 0) < (worst.pnl_percent ?? 0) ? p : worst
        )
      : null;

  return {
    totalValue,
    cash,
    investedValue,
    unrealizedPnl,
    realizedPnl,
    totalReturnPercent:
      totalValue > 0
        ? ((unrealizedPnl + realizedPnl) / totalValue) * 100
        : 0,
    dayReturnPercent: 0, // TODO: calculate from daily snapshots
    positionCount: positions.length,
    openPositions: positions,
    winRate,
    bestPerformer,
    worstPerformer,
    allocationByAssetType,
    concentrationRisk,
    lastSyncedAt: null, // Set by caller after sync
  };
}

// ============================================================================
// Audit Log
// ============================================================================

export function logAuditEvent(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
): void {
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO audit_log (id, timestamp, user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, 'admin', ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      new Date().toISOString(),
      action,
      entityType ?? null,
      entityId ?? null,
      details ? JSON.stringify(details) : null
    );
  } finally {
    db.close();
  }
}
