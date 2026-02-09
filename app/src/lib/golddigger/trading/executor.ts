/**
 * Trade Executor for Gold Digger AGI.
 *
 * Converts AI recommendations into order proposals, runs them through
 * the trading governor, and executes approved orders on the broker.
 *
 * Flow: Recommendation → Proposal → Governor Check → User Approval → Execution
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import {
  getBroker,
  getBrokerConfig,
  type OrderParams,
  type BrokerOrder,
} from "../broker";
import { checkTradingOrder, type TradingCheckResult } from "../governor/trading-governor";
import { logAuditEvent, upsertPosition, recordTransaction } from "../portfolio/manager";

// ============================================================================
// Types
// ============================================================================

export interface OrderProposal {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  orderType: "market" | "limit";
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  status:
    | "pending_approval"
    | "approved"
    | "rejected"
    | "executed"
    | "failed"
    | "cancelled";
  createdBy: "ai" | "user";
  createdAt: string;
  estimatedCost: number;
  riskLevel: string;
  riskAssessment: string;
  governorWarnings: string[];
  recommendationId?: string;
  notes?: string;
  // Filled after execution
  executedOrderId?: string;
  executedAt?: string;
  rejectionReason?: string;
  approvedAt?: string;
}

export interface CreateProposalInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  orderType?: "market" | "limit";
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  confidence?: number;
  recommendationId?: string;
  notes?: string;
  createdBy?: "ai" | "user";
}

// ============================================================================
// Database
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
// Proposal CRUD
// ============================================================================

export async function createOrderProposal(
  input: CreateProposalInput
): Promise<{ proposal: OrderProposal; governorCheck: TradingCheckResult }> {
  const broker = getBroker();
  const config = getBrokerConfig();

  // Get current portfolio state for governor check
  let availableCash = 0;
  let portfolioValue = 0;

  if (broker && broker.isConnected()) {
    try {
      const account = await broker.getAccount();
      availableCash = account.buyingPower;
      portfolioValue = account.portfolioValue;
    } catch {
      // Use defaults
    }
  }

  const estimatedPrice = input.limitPrice ?? 0; // TODO: fetch current price if not provided
  const estimatedCost = input.quantity * estimatedPrice;

  // Run governor check
  const governorCheck = checkTradingOrder({
    symbol: input.symbol,
    side: input.side,
    quantity: input.quantity,
    estimatedPrice,
    confidence: input.confidence,
    availableCash,
    portfolioValue: portfolioValue || estimatedCost * 10, // Assume reasonable portfolio if unknown
  });

  const proposal: OrderProposal = {
    id: randomUUID(),
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    orderType: input.orderType ?? "market",
    limitPrice: input.limitPrice,
    stopLoss: input.stopLoss,
    takeProfit: input.takeProfit,
    status: governorCheck.approved ? "pending_approval" : "rejected",
    createdBy: input.createdBy ?? "ai",
    createdAt: new Date().toISOString(),
    estimatedCost,
    riskLevel: governorCheck.riskLevel,
    riskAssessment: governorCheck.violations.length > 0
      ? governorCheck.violations.map((v) => v.message).join("; ")
      : governorCheck.warnings.length > 0
        ? governorCheck.warnings.map((w) => w.message).join("; ")
        : "All safety checks passed",
    governorWarnings: [
      ...governorCheck.violations.map((v) => `[${v.severity.toUpperCase()}] ${v.message}`),
      ...governorCheck.warnings.map((w) => `[${w.severity.toUpperCase()}] ${w.message}`),
    ],
    recommendationId: input.recommendationId,
    notes: input.notes,
    rejectionReason: !governorCheck.approved
      ? governorCheck.violations.map((v) => v.message).join("; ")
      : undefined,
  };

  // Store in DB
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO order_proposals
       (id, account_id, symbol, side, quantity, order_type, limit_price, stop_loss, take_profit,
        status, created_by, created_at, governor_warnings, estimated_cost, risk_level,
        risk_assessment, recommendation_id, notes, rejection_reason)
       VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      proposal.id,
      proposal.symbol,
      proposal.side,
      proposal.quantity,
      proposal.orderType,
      proposal.limitPrice ?? null,
      proposal.stopLoss ?? null,
      proposal.takeProfit ?? null,
      proposal.status,
      proposal.createdBy,
      proposal.createdAt,
      JSON.stringify(proposal.governorWarnings),
      proposal.estimatedCost,
      proposal.riskLevel,
      proposal.riskAssessment,
      proposal.recommendationId ?? null,
      proposal.notes ?? null,
      proposal.rejectionReason ?? null
    );
  } finally {
    db.close();
  }

  logAuditEvent("order_proposed", "order_proposal", proposal.id, {
    symbol: proposal.symbol,
    side: proposal.side,
    quantity: proposal.quantity,
    status: proposal.status,
    riskLevel: proposal.riskLevel,
    governorApproved: governorCheck.approved,
  });

  return { proposal, governorCheck };
}

export function getOrderProposals(
  status?: string,
  limit: number = 50
): OrderProposal[] {
  const db = getDb();
  try {
    let query = "SELECT * FROM order_proposals WHERE account_id = 'default'";
    const params: unknown[] = [];
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToProposal);
  } finally {
    db.close();
  }
}

export function getOrderProposal(id: string): OrderProposal | null {
  const db = getDb();
  try {
    const row = db
      .prepare("SELECT * FROM order_proposals WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToProposal(row) : null;
  } finally {
    db.close();
  }
}

function rowToProposal(row: Record<string, unknown>): OrderProposal {
  return {
    id: String(row.id ?? ""),
    symbol: String(row.symbol ?? ""),
    side: String(row.side ?? "buy") as "buy" | "sell",
    quantity: Number(row.quantity ?? 0),
    orderType: String(row.order_type ?? "market") as "market" | "limit",
    limitPrice: row.limit_price ? Number(row.limit_price) : undefined,
    stopLoss: row.stop_loss ? Number(row.stop_loss) : undefined,
    takeProfit: row.take_profit ? Number(row.take_profit) : undefined,
    status: String(row.status ?? "pending_approval") as OrderProposal["status"],
    createdBy: String(row.created_by ?? "ai") as "ai" | "user",
    createdAt: String(row.created_at ?? ""),
    estimatedCost: Number(row.estimated_cost ?? 0),
    riskLevel: String(row.risk_level ?? "medium"),
    riskAssessment: String(row.risk_assessment ?? ""),
    governorWarnings: JSON.parse(String(row.governor_warnings ?? "[]")),
    recommendationId: row.recommendation_id ? String(row.recommendation_id) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    executedOrderId: row.executed_order_id ? String(row.executed_order_id) : undefined,
    executedAt: row.executed_at ? String(row.executed_at) : undefined,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    approvedAt: row.user_approved_at ? String(row.user_approved_at) : undefined,
  };
}

// ============================================================================
// Approval / Rejection
// ============================================================================

export function approveProposal(proposalId: string): OrderProposal {
  const db = getDb();
  try {
    db.prepare(
      `UPDATE order_proposals SET status = 'approved', user_approved_at = ? WHERE id = ? AND status = 'pending_approval'`
    ).run(new Date().toISOString(), proposalId);
  } finally {
    db.close();
  }

  logAuditEvent("order_approved", "order_proposal", proposalId);
  return getOrderProposal(proposalId)!;
}

export function rejectProposal(
  proposalId: string,
  reason: string
): OrderProposal {
  const db = getDb();
  try {
    db.prepare(
      `UPDATE order_proposals SET status = 'rejected', rejection_reason = ? WHERE id = ? AND status = 'pending_approval'`
    ).run(reason, proposalId);
  } finally {
    db.close();
  }

  logAuditEvent("order_rejected", "order_proposal", proposalId, { reason });
  return getOrderProposal(proposalId)!;
}

// ============================================================================
// Execution
// ============================================================================

export async function executeApprovedProposal(
  proposalId: string
): Promise<{ success: boolean; order?: BrokerOrder; error?: string }> {
  const proposal = getOrderProposal(proposalId);
  if (!proposal) {
    return { success: false, error: "Proposal not found" };
  }
  if (proposal.status !== "approved") {
    return {
      success: false,
      error: `Cannot execute proposal with status: ${proposal.status}`,
    };
  }

  const broker = getBroker();
  if (!broker || !broker.isConnected()) {
    return { success: false, error: "Broker not connected" };
  }

  try {
    const orderParams: OrderParams = {
      symbol: proposal.symbol,
      quantity: proposal.quantity,
      side: proposal.side,
      type: proposal.orderType,
      timeInForce: "day",
      limitPrice: proposal.limitPrice,
      clientOrderId: `gd-${proposal.id.slice(0, 8)}`,
    };

    const order = await broker.createOrder(orderParams);

    // Update proposal
    const db = getDb();
    try {
      db.prepare(
        `UPDATE order_proposals SET status = 'executed', executed_order_id = ?, executed_at = ? WHERE id = ?`
      ).run(order.id, new Date().toISOString(), proposalId);
    } finally {
      db.close();
    }

    // Record transaction
    recordTransaction({
      account_id: "default",
      symbol: proposal.symbol,
      transaction_type: proposal.side,
      quantity: proposal.quantity,
      price: order.filledAvgPrice ?? proposal.limitPrice ?? 0,
      amount: proposal.estimatedCost,
      fees: 0,
      transaction_date: new Date().toISOString(),
      broker_order_id: order.id,
      notes: `Executed from proposal ${proposal.id}`,
    });

    // If it's a buy, create/update position
    if (proposal.side === "buy") {
      upsertPosition({
        id: randomUUID(),
        account_id: "default",
        symbol: proposal.symbol,
        asset_type: "stock", // TODO: detect asset type
        quantity: proposal.quantity,
        entry_price: order.filledAvgPrice ?? proposal.limitPrice ?? 0,
        current_price: order.filledAvgPrice ?? proposal.limitPrice ?? null,
        position_type: "long",
        status: "open",
        opened_at: new Date().toISOString(),
        closed_at: null,
        broker_position_id: order.id,
        stop_loss: proposal.stopLoss ?? null,
        take_profit: proposal.takeProfit ?? null,
      });
    }

    logAuditEvent("order_executed", "order_proposal", proposalId, {
      brokerOrderId: order.id,
      status: order.status,
      filledPrice: order.filledAvgPrice,
    });

    return { success: true, order };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Execution failed";

    // Mark as failed
    const db = getDb();
    try {
      db.prepare(
        `UPDATE order_proposals SET status = 'failed', rejection_reason = ? WHERE id = ?`
      ).run(message, proposalId);
    } finally {
      db.close();
    }

    logAuditEvent("order_execution_failed", "order_proposal", proposalId, {
      error: message,
    });

    return { success: false, error: message };
  }
}

// ============================================================================
// Position Sizing Helper
// ============================================================================

/**
 * Calculate recommended position size based on risk tolerance and portfolio.
 */
export function calculatePositionSize(
  currentPrice: number,
  portfolioValue: number,
  riskPercent?: number
): {
  recommendedQuantity: number;
  recommendedValue: number;
  maxQuantity: number;
  maxValue: number;
} {
  const config = getBrokerConfig();
  const maxPercent = config.riskLimits.maxPositionPercent;
  const risk = riskPercent ?? maxPercent / 2; // Default to half the max

  const recommendedValue = (portfolioValue * risk) / 100;
  const maxValue = (portfolioValue * maxPercent) / 100;

  return {
    recommendedQuantity: Math.floor(recommendedValue / currentPrice),
    recommendedValue,
    maxQuantity: Math.floor(maxValue / currentPrice),
    maxValue,
  };
}
