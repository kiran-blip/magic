/**
 * Smart Automation Rules Engine for Gold Digger AGI.
 *
 * Supports rule types:
 *  - price_alert      : trigger when asset hits price target
 *  - dca              : dollar-cost averaging on schedule
 *  - rebalance        : rebalance portfolio to target allocation
 *  - stop_loss        : auto-sell when position drops below threshold
 *  - take_profit      : auto-sell when position reaches profit target
 *  - trailing_stop    : dynamic stop that follows price up
 *
 * All rules go through the governor and require user approval before execution.
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { logAuditEvent } from "../portfolio/manager";

// ============================================================================
// Types
// ============================================================================

export type RuleType =
  | "price_alert"
  | "dca"
  | "rebalance"
  | "stop_loss"
  | "take_profit"
  | "trailing_stop";

export type RuleStatus = "active" | "paused" | "triggered" | "expired" | "completed";

export interface TradingRule {
  id: string;
  name: string;
  type: RuleType;
  status: RuleStatus;
  symbol?: string;
  /** JSON config specific to the rule type */
  config: RuleConfig;
  /** How often to evaluate (cron-like or interval) */
  schedule?: string;
  /** ISO timestamp of last evaluation */
  lastEvaluatedAt?: string;
  /** ISO timestamp of last trigger */
  lastTriggeredAt?: string;
  /** Number of times triggered */
  triggerCount: number;
  /** Max triggers before auto-pause (0 = unlimited) */
  maxTriggers: number;
  createdAt: string;
  updatedAt: string;
  /** Optional expiry */
  expiresAt?: string;
  notes?: string;
}

// ── Rule-specific configs ────────────────────────────────────────────

export interface PriceAlertConfig {
  type: "price_alert";
  targetPrice: number;
  direction: "above" | "below";
  /** Action when triggered: just notify, or create a proposal */
  action: "notify" | "propose_buy" | "propose_sell";
  quantity?: number;
}

export interface DcaConfig {
  type: "dca";
  /** Amount in USD per execution */
  amountPerExecution: number;
  /** Frequency: daily, weekly, biweekly, monthly */
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  /** Day of week (0=Sun..6=Sat) for weekly */
  dayOfWeek?: number;
  /** Day of month for monthly */
  dayOfMonth?: number;
  /** Total budget limit (0 = unlimited) */
  totalBudget: number;
  /** Amount spent so far */
  totalSpent: number;
}

export interface RebalanceConfig {
  type: "rebalance";
  /** Target allocation: { "AAPL": 30, "GOOGL": 25, "BTC": 20, "CASH": 25 } */
  targetAllocation: Record<string, number>;
  /** Rebalance when any position drifts more than this % from target */
  driftThreshold: number;
  /** Min rebalance amount in USD (skip if below) */
  minTradeAmount: number;
}

export interface StopLossConfig {
  type: "stop_loss";
  /** Percentage below entry price (e.g. 5 = 5%) */
  percentage: number;
  /** Absolute price level (overrides percentage if set) */
  triggerPrice?: number;
}

export interface TakeProfitConfig {
  type: "take_profit";
  /** Percentage above entry price */
  percentage: number;
  /** Absolute price level */
  triggerPrice?: number;
  /** Sell all or partial */
  sellPercentage: number; // 100 = sell all, 50 = sell half
}

export interface TrailingStopConfig {
  type: "trailing_stop";
  /** Trail percentage below highest price */
  trailPercent: number;
  /** Current highest price tracked */
  highWaterMark: number;
  /** Current trigger price (updated as price rises) */
  currentStopPrice: number;
}

export type RuleConfig =
  | PriceAlertConfig
  | DcaConfig
  | RebalanceConfig
  | StopLossConfig
  | TakeProfitConfig
  | TrailingStopConfig;

// ============================================================================
// Database
// ============================================================================

let dbInitialized = false;

function getDb(): Database.Database {
  const dataDir =
    process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "golddigger-memory.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Ensure table exists on first access
  if (!dbInitialized) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS trading_rules (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL DEFAULT 'default',
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        symbol TEXT,
        config TEXT NOT NULL DEFAULT '{}',
        schedule TEXT,
        trigger_count INTEGER DEFAULT 0,
        max_triggers INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        last_triggered_at TEXT,
        last_evaluated_at TEXT,
        expires_at TEXT,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_rules_status ON trading_rules(status);
      CREATE INDEX IF NOT EXISTS idx_rules_type ON trading_rules(type);
    `);
    dbInitialized = true;
  }

  return db;
}

// ============================================================================
// Rule CRUD
// ============================================================================

export function createRule(input: {
  name: string;
  type: RuleType;
  symbol?: string;
  config: RuleConfig;
  schedule?: string;
  maxTriggers?: number;
  expiresAt?: string;
  notes?: string;
}): TradingRule {
  const now = new Date().toISOString();
  const rule: TradingRule = {
    id: randomUUID(),
    name: input.name,
    type: input.type,
    status: "active",
    symbol: input.symbol,
    config: input.config,
    schedule: input.schedule,
    triggerCount: 0,
    maxTriggers: input.maxTriggers ?? 0,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
    notes: input.notes,
  };

  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO trading_rules
       (id, account_id, name, type, status, symbol, config, schedule,
        trigger_count, max_triggers, created_at, updated_at, expires_at, notes)
       VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      rule.id,
      rule.name,
      rule.type,
      rule.status,
      rule.symbol ?? null,
      JSON.stringify(rule.config),
      rule.schedule ?? null,
      rule.triggerCount,
      rule.maxTriggers,
      rule.createdAt,
      rule.updatedAt,
      rule.expiresAt ?? null,
      rule.notes ?? null
    );
  } finally {
    db.close();
  }

  logAuditEvent("rule_created", "trading_rule", rule.id, {
    name: rule.name,
    type: rule.type,
    symbol: rule.symbol,
  });

  return rule;
}

export function getRules(status?: RuleStatus): TradingRule[] {
  const db = getDb();
  try {
    let query = "SELECT * FROM trading_rules WHERE account_id = 'default'";
    const params: unknown[] = [];
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC";

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToRule);
  } finally {
    db.close();
  }
}

export function getRule(id: string): TradingRule | null {
  const db = getDb();
  try {
    const row = db
      .prepare("SELECT * FROM trading_rules WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToRule(row) : null;
  } finally {
    db.close();
  }
}

export function updateRule(
  id: string,
  updates: Partial<Pick<TradingRule, "name" | "status" | "config" | "schedule" | "maxTriggers" | "expiresAt" | "notes">>
): TradingRule | null {
  const existing = getRule(id);
  if (!existing) return null;

  const db = getDb();
  try {
    const fields: string[] = ["updated_at = ?"];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      params.push(updates.name);
    }
    if (updates.status !== undefined) {
      fields.push("status = ?");
      params.push(updates.status);
    }
    if (updates.config !== undefined) {
      fields.push("config = ?");
      params.push(JSON.stringify(updates.config));
    }
    if (updates.schedule !== undefined) {
      fields.push("schedule = ?");
      params.push(updates.schedule);
    }
    if (updates.maxTriggers !== undefined) {
      fields.push("max_triggers = ?");
      params.push(updates.maxTriggers);
    }
    if (updates.expiresAt !== undefined) {
      fields.push("expires_at = ?");
      params.push(updates.expiresAt);
    }
    if (updates.notes !== undefined) {
      fields.push("notes = ?");
      params.push(updates.notes);
    }

    params.push(id);
    db.prepare(`UPDATE trading_rules SET ${fields.join(", ")} WHERE id = ?`).run(
      ...params
    );
  } finally {
    db.close();
  }

  logAuditEvent("rule_updated", "trading_rule", id, updates);
  return getRule(id);
}

export function deleteRule(id: string): boolean {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM trading_rules WHERE id = ?").run(id);
    if (result.changes > 0) {
      logAuditEvent("rule_deleted", "trading_rule", id);
      return true;
    }
    return false;
  } finally {
    db.close();
  }
}

export function markRuleTriggered(id: string): void {
  const now = new Date().toISOString();
  const db = getDb();
  try {
    db.prepare(
      `UPDATE trading_rules
       SET trigger_count = trigger_count + 1,
           last_triggered_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(now, now, id);

    // Check if maxTriggers reached → auto-pause
    const rule = getRule(id);
    if (rule && rule.maxTriggers > 0 && rule.triggerCount >= rule.maxTriggers) {
      updateRule(id, { status: "completed" });
    }
  } finally {
    db.close();
  }
}

export function markRuleEvaluated(id: string): void {
  const now = new Date().toISOString();
  const db = getDb();
  try {
    db.prepare(
      `UPDATE trading_rules SET last_evaluated_at = ?, updated_at = ? WHERE id = ?`
    ).run(now, now, id);
  } finally {
    db.close();
  }
}

// ============================================================================
// Row mapping
// ============================================================================

function rowToRule(row: Record<string, unknown>): TradingRule {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    type: String(row.type ?? "price_alert") as RuleType,
    status: String(row.status ?? "active") as RuleStatus,
    symbol: row.symbol ? String(row.symbol) : undefined,
    config: JSON.parse(String(row.config ?? "{}")),
    schedule: row.schedule ? String(row.schedule) : undefined,
    lastEvaluatedAt: row.last_evaluated_at ? String(row.last_evaluated_at) : undefined,
    lastTriggeredAt: row.last_triggered_at ? String(row.last_triggered_at) : undefined,
    triggerCount: Number(row.trigger_count ?? 0),
    maxTriggers: Number(row.max_triggers ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}
