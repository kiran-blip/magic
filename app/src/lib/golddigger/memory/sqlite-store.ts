/**
 * SQLite-backed persistent memory store for Gold Digger AGI.
 * Drop-in replacement for the JSON file store — same API, better performance.
 *
 * Features:
 * - ACID transactions for data integrity
 * - Full-text search on conversations (FTS5)
 * - Indexed queries (symbol lookups, date ranges)
 * - Auto-migration from JSON file if it exists
 * - WAL mode for concurrent read/write
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";

import type {
  ConversationMemory,
  InvestmentMemory,
  ResearchMemory,
  MemoryStore,
} from "./store";

// Re-export types so consumers can import from either module
export type { ConversationMemory, InvestmentMemory, ResearchMemory, MemoryStore };

// ============================================================================
// Database Initialization
// ============================================================================

let db: Database.Database | null = null;

function getDataDirectory(): string {
  const dataDir =
    process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(getDataDirectory(), "golddigger-memory.db");
  db = new Database(dbPath);

  // Performance: WAL mode for concurrent reads + writes
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      user_query TEXT NOT NULL,
      agent_type TEXT NOT NULL DEFAULT 'general',
      summary TEXT NOT NULL DEFAULT '',
      full_response TEXT NOT NULL DEFAULT '',
      symbols TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 0,
      reasoning TEXT NOT NULL DEFAULT '',
      price_at_time REAL,
      entry_price REAL,
      stop_loss REAL,
      take_profit REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS research (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      niche TEXT NOT NULL,
      opportunity_score REAL NOT NULL DEFAULT 0,
      key_findings TEXT NOT NULL DEFAULT '',
      verdict TEXT NOT NULL DEFAULT 'Moderate',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Portfolio & Trading Tables ──────────────────────────────────────

    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'default',
      symbol TEXT NOT NULL,
      asset_type TEXT NOT NULL DEFAULT 'stock',
      quantity REAL NOT NULL,
      entry_price REAL NOT NULL,
      current_price REAL,
      position_type TEXT NOT NULL DEFAULT 'long',
      status TEXT NOT NULL DEFAULT 'open',
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      broker_position_id TEXT,
      stop_loss REAL,
      take_profit REAL,
      pnl_unrealized REAL,
      pnl_realized REAL,
      pnl_percent REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'default',
      symbol TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      quantity REAL,
      price REAL,
      amount REAL,
      fees REAL DEFAULT 0,
      transaction_date TEXT NOT NULL,
      broker_order_id TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_performance (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'default',
      date TEXT NOT NULL,
      total_value REAL NOT NULL,
      cash REAL NOT NULL,
      invested_value REAL NOT NULL,
      pnl_unrealized REAL,
      pnl_realized REAL,
      total_return_percent REAL,
      day_return_percent REAL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_id, date)
    );

    CREATE TABLE IF NOT EXISTS broker_orders (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'default',
      broker_order_id TEXT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      order_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      filled_quantity REAL,
      filled_price REAL,
      limit_price REAL,
      stop_price REAL,
      time_in_force TEXT DEFAULT 'day',
      created_at TEXT,
      filled_at TEXT,
      created_by TEXT DEFAULT 'user',
      recommendation_id TEXT,
      notes TEXT,
      db_created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_proposals (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'default',
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      order_type TEXT NOT NULL DEFAULT 'market',
      limit_price REAL,
      stop_loss REAL,
      take_profit REAL,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      created_by TEXT DEFAULT 'ai',
      created_at TEXT NOT NULL,
      user_approved_at TEXT,
      executed_at TEXT,
      executed_order_id TEXT,
      rejection_reason TEXT,
      governor_warnings TEXT DEFAULT '[]',
      estimated_cost REAL,
      risk_level TEXT DEFAULT 'medium',
      risk_assessment TEXT,
      recommendation_id TEXT,
      notes TEXT
    );

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

    CREATE TABLE IF NOT EXISTS tracked_predictions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL DEFAULT 'default',
      symbol TEXT NOT NULL,
      prediction_type TEXT NOT NULL,
      prediction TEXT NOT NULL,
      confidence REAL NOT NULL,
      price_at_prediction REAL NOT NULL DEFAULT 0,
      target_price REAL,
      direction TEXT,
      timeframe_hours INTEGER DEFAULT 168,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'pending',
      price_at_resolution REAL,
      resolved_at TEXT,
      accuracy_score REAL,
      model_tier TEXT NOT NULL DEFAULT 'unknown',
      source TEXT NOT NULL DEFAULT 'unknown',
      recommendation_id TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'admin',
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- ── Indexes ──────────────────────────────────────────────────────────

    CREATE INDEX IF NOT EXISTS idx_conversations_timestamp ON conversations(timestamp);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent_type ON conversations(agent_type);
    CREATE INDEX IF NOT EXISTS idx_investments_symbol ON investments(symbol);
    CREATE INDEX IF NOT EXISTS idx_investments_timestamp ON investments(timestamp);
    CREATE INDEX IF NOT EXISTS idx_research_niche ON research(niche);
    CREATE INDEX IF NOT EXISTS idx_research_timestamp ON research(timestamp);

    CREATE INDEX IF NOT EXISTS idx_positions_symbol ON portfolio_positions(symbol);
    CREATE INDEX IF NOT EXISTS idx_positions_status ON portfolio_positions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON portfolio_transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_performance_date ON portfolio_performance(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON broker_orders(status);
    CREATE INDEX IF NOT EXISTS idx_proposals_status ON order_proposals(status);
    CREATE INDEX IF NOT EXISTS idx_rules_status ON trading_rules(status);
    CREATE INDEX IF NOT EXISTS idx_rules_type ON trading_rules(type);
    CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON tracked_predictions(symbol);
    CREATE INDEX IF NOT EXISTS idx_predictions_outcome ON tracked_predictions(outcome);
    CREATE INDEX IF NOT EXISTS idx_predictions_created ON tracked_predictions(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  `);

  // Create FTS5 virtual table for full-text search (if not exists)
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
        user_query, summary, tags,
        content=conversations,
        content_rowid=rowid
      );
    `);
  } catch {
    // FTS5 may not be available in all SQLite builds — graceful fallback
    console.warn("[Gold Digger Memory] FTS5 not available, using LIKE search");
  }

  // Create triggers to keep FTS5 in sync with conversations table
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS conversations_ai AFTER INSERT ON conversations BEGIN
        INSERT INTO conversations_fts(rowid, user_query, summary, tags)
        VALUES (new.rowid, new.user_query, new.summary, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS conversations_ad AFTER DELETE ON conversations BEGIN
        INSERT INTO conversations_fts(conversations_fts, rowid, user_query, summary, tags)
        VALUES ('delete', old.rowid, old.user_query, old.summary, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS conversations_au AFTER UPDATE ON conversations BEGIN
        INSERT INTO conversations_fts(conversations_fts, rowid, user_query, summary, tags)
        VALUES ('delete', old.rowid, old.user_query, old.summary, old.tags);
        INSERT INTO conversations_fts(rowid, user_query, summary, tags)
        VALUES (new.rowid, new.user_query, new.summary, new.tags);
      END;
    `);
  } catch {
    // Triggers may already exist or FTS5 not available
  }

  // Auto-migrate from JSON file if it exists
  migrateFromJson(db);

  // Rebuild FTS5 index if it's out of sync (e.g., after migration)
  try {
    const ftsCount = (db.prepare("SELECT COUNT(*) as cnt FROM conversations_fts").get() as { cnt: number }).cnt;
    const convCount = (db.prepare("SELECT COUNT(*) as cnt FROM conversations").get() as { cnt: number }).cnt;
    if (convCount > 0 && ftsCount !== convCount) {
      db.exec("INSERT INTO conversations_fts(conversations_fts) VALUES('rebuild')");
      console.log(`[Gold Digger Memory] Rebuilt FTS5 index (${convCount} rows)`);
    }
  } catch {
    // FTS rebuild failed — LIKE search fallback still works
  }

  return db;
}

// ============================================================================
// JSON Migration
// ============================================================================

function migrateFromJson(database: Database.Database): void {
  const jsonPath = path.join(getDataDirectory(), "golddigger-memory.json");

  if (!fs.existsSync(jsonPath)) return;

  // Check if we already migrated (conversations table has data)
  const count = database
    .prepare("SELECT COUNT(*) as cnt FROM conversations")
    .get() as { cnt: number };
  if (count.cnt > 0) return;

  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    const store: MemoryStore = JSON.parse(raw);

    const insertConv = database.prepare(`
      INSERT OR IGNORE INTO conversations (id, timestamp, user_query, agent_type, summary, full_response, symbols, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertInv = database.prepare(`
      INSERT OR IGNORE INTO investments (id, timestamp, symbol, action, confidence, reasoning, price_at_time, entry_price, stop_loss, take_profit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertRes = database.prepare(`
      INSERT OR IGNORE INTO research (id, timestamp, niche, opportunity_score, key_findings, verdict)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const migrate = database.transaction(() => {
      for (const c of store.conversations || []) {
        insertConv.run(
          c.id || randomUUID(),
          c.timestamp,
          c.userQuery,
          c.agentType,
          c.summary,
          c.fullResponse,
          JSON.stringify(c.symbols || []),
          JSON.stringify(c.tags || [])
        );
      }

      for (const inv of store.investments || []) {
        insertInv.run(
          inv.id || randomUUID(),
          inv.timestamp,
          inv.symbol,
          inv.action,
          inv.confidence,
          inv.reasoning,
          inv.priceAtTime ?? null,
          inv.entryPrice ?? null,
          inv.stopLoss ?? null,
          inv.takeProfit ?? null
        );
      }

      for (const r of store.research || []) {
        insertRes.run(
          r.id || randomUUID(),
          r.timestamp,
          r.niche,
          r.opportunityScore,
          r.keyFindings,
          r.verdict
        );
      }
    });

    migrate();

    // Rename old JSON file to .bak
    fs.renameSync(jsonPath, jsonPath + ".migrated.bak");
    console.log(
      `[Gold Digger Memory] Migrated ${store.conversations?.length ?? 0} conversations, ` +
        `${store.investments?.length ?? 0} investments, ` +
        `${store.research?.length ?? 0} research from JSON to SQLite`
    );
  } catch (error) {
    console.error("[Gold Digger Memory] JSON migration failed:", error);
  }
}

// ============================================================================
// Row → Interface Mappers
// ============================================================================

interface ConversationRow {
  id: string;
  timestamp: string;
  user_query: string;
  agent_type: string;
  summary: string;
  full_response: string;
  symbols: string;
  tags: string;
}

interface InvestmentRow {
  id: string;
  timestamp: string;
  symbol: string;
  action: string;
  confidence: number;
  reasoning: string;
  price_at_time: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
}

interface ResearchRow {
  id: string;
  timestamp: string;
  niche: string;
  opportunity_score: number;
  key_findings: string;
  verdict: string;
}

function rowToConversation(row: ConversationRow): ConversationMemory {
  return {
    id: row.id,
    timestamp: row.timestamp,
    userQuery: row.user_query,
    agentType: row.agent_type,
    summary: row.summary,
    fullResponse: row.full_response,
    symbols: JSON.parse(row.symbols || "[]"),
    tags: JSON.parse(row.tags || "[]"),
  };
}

function rowToInvestment(row: InvestmentRow): InvestmentMemory {
  return {
    id: row.id,
    timestamp: row.timestamp,
    symbol: row.symbol,
    action: row.action,
    confidence: row.confidence,
    reasoning: row.reasoning,
    priceAtTime: row.price_at_time ?? undefined,
    entryPrice: row.entry_price ?? undefined,
    stopLoss: row.stop_loss ?? undefined,
    takeProfit: row.take_profit ?? undefined,
  };
}

function rowToResearch(row: ResearchRow): ResearchMemory {
  return {
    id: row.id,
    timestamp: row.timestamp,
    niche: row.niche,
    opportunityScore: row.opportunity_score,
    keyFindings: row.key_findings,
    verdict: row.verdict,
  };
}

// ============================================================================
// Public API — Same signatures as the JSON store
// ============================================================================

export function loadMemoryStore(): MemoryStore {
  const database = getDb();
  const conversations = database
    .prepare("SELECT * FROM conversations ORDER BY timestamp ASC")
    .all() as ConversationRow[];
  const investments = database
    .prepare("SELECT * FROM investments ORDER BY timestamp ASC")
    .all() as InvestmentRow[];
  const research = database
    .prepare("SELECT * FROM research ORDER BY timestamp ASC")
    .all() as ResearchRow[];

  return {
    conversations: conversations.map(rowToConversation),
    investments: investments.map(rowToInvestment),
    research: research.map(rowToResearch),
    lastUpdated: new Date().toISOString(),
  };
}

export function saveMemoryStore(_store: MemoryStore): boolean {
  // SQLite auto-persists — this is a no-op for compatibility
  return true;
}

export function storeConversation(
  memory: Omit<ConversationMemory, "id" | "timestamp">
): string {
  const database = getDb();
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO conversations (id, timestamp, user_query, agent_type, summary, full_response, symbols, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      timestamp,
      memory.userQuery,
      memory.agentType,
      memory.summary,
      memory.fullResponse,
      JSON.stringify(memory.symbols || []),
      JSON.stringify(memory.tags || [])
    );

  // Enforce max 1000 conversations (delete oldest)
  database.exec(`
    DELETE FROM conversations WHERE id IN (
      SELECT id FROM conversations ORDER BY timestamp ASC
      LIMIT MAX(0, (SELECT COUNT(*) FROM conversations) - 1000)
    )
  `);

  return id;
}

export function storeInvestmentDecision(
  memory: Omit<InvestmentMemory, "id" | "timestamp">
): string {
  const database = getDb();
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO investments (id, timestamp, symbol, action, confidence, reasoning, price_at_time, entry_price, stop_loss, take_profit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      timestamp,
      memory.symbol,
      memory.action,
      memory.confidence,
      memory.reasoning,
      memory.priceAtTime ?? null,
      memory.entryPrice ?? null,
      memory.stopLoss ?? null,
      memory.takeProfit ?? null
    );

  // Enforce max 500 investments
  database.exec(`
    DELETE FROM investments WHERE id IN (
      SELECT id FROM investments ORDER BY timestamp ASC
      LIMIT MAX(0, (SELECT COUNT(*) FROM investments) - 500)
    )
  `);

  return id;
}

export function storeResearchFinding(
  memory: Omit<ResearchMemory, "id" | "timestamp">
): string {
  const database = getDb();
  const id = randomUUID();
  const timestamp = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO research (id, timestamp, niche, opportunity_score, key_findings, verdict)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      timestamp,
      memory.niche,
      memory.opportunityScore,
      memory.keyFindings,
      memory.verdict
    );

  // Enforce max 200 research entries
  database.exec(`
    DELETE FROM research WHERE id IN (
      SELECT id FROM research ORDER BY timestamp ASC
      LIMIT MAX(0, (SELECT COUNT(*) FROM research) - 200)
    )
  `);

  return id;
}

export function recallRelevant(
  query: string,
  limit: number = 10
): ConversationMemory[] {
  const database = getDb();

  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);

  if (queryWords.length === 0) {
    const rows = database
      .prepare(
        "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?"
      )
      .all(limit) as ConversationRow[];
    return rows.map(rowToConversation);
  }

  // Try FTS5 first
  try {
    const ftsQuery = queryWords.join(" OR ");
    const rows = database
      .prepare(
        `SELECT c.* FROM conversations_fts fts
         JOIN conversations c ON c.rowid = fts.rowid
         WHERE conversations_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(ftsQuery, limit) as ConversationRow[];

    if (rows.length > 0) {
      return rows.map(rowToConversation);
    }
  } catch {
    // FTS not available, fall through to LIKE search
  }

  // Fallback: LIKE search with scoring
  const likeConditions = queryWords
    .map(() => "(user_query LIKE ? OR summary LIKE ? OR tags LIKE ?)")
    .join(" OR ");
  const likeParams = queryWords.flatMap((w) => [
    `%${w}%`,
    `%${w}%`,
    `%${w}%`,
  ]);

  const rows = database
    .prepare(
      `SELECT * FROM conversations WHERE ${likeConditions}
       ORDER BY timestamp DESC LIMIT ?`
    )
    .all(...likeParams, limit) as ConversationRow[];

  return rows.map(rowToConversation);
}

export function recallInvestmentHistory(
  symbol?: string,
  limit: number = 20
): InvestmentMemory[] {
  const database = getDb();

  let rows: InvestmentRow[];
  if (symbol) {
    rows = database
      .prepare(
        "SELECT * FROM investments WHERE UPPER(symbol) = UPPER(?) ORDER BY timestamp DESC LIMIT ?"
      )
      .all(symbol, limit) as InvestmentRow[];
  } else {
    rows = database
      .prepare(
        "SELECT * FROM investments ORDER BY timestamp DESC LIMIT ?"
      )
      .all(limit) as InvestmentRow[];
  }

  return rows.map(rowToInvestment);
}

export function recallResearchHistory(
  niche?: string,
  limit: number = 20
): ResearchMemory[] {
  const database = getDb();

  let rows: ResearchRow[];
  if (niche) {
    rows = database
      .prepare(
        "SELECT * FROM research WHERE LOWER(niche) LIKE LOWER(?) ORDER BY timestamp DESC LIMIT ?"
      )
      .all(`%${niche}%`, limit) as ResearchRow[];
  } else {
    rows = database
      .prepare(
        "SELECT * FROM research ORDER BY timestamp DESC LIMIT ?"
      )
      .all(limit) as ResearchRow[];
  }

  return rows.map(rowToResearch);
}

export function getRecentConversations(
  limit: number = 20
): ConversationMemory[] {
  const database = getDb();
  const rows = database
    .prepare(
      "SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?"
    )
    .all(limit) as ConversationRow[];
  return rows.map(rowToConversation);
}

export function getMemoryStats(): {
  totalConversations: number;
  totalInvestments: number;
  totalResearch: number;
  oldestMemory: string | null;
  newestMemory: string | null;
} {
  const database = getDb();

  const convCount = (
    database.prepare("SELECT COUNT(*) as cnt FROM conversations").get() as {
      cnt: number;
    }
  ).cnt;
  const invCount = (
    database.prepare("SELECT COUNT(*) as cnt FROM investments").get() as {
      cnt: number;
    }
  ).cnt;
  const resCount = (
    database.prepare("SELECT COUNT(*) as cnt FROM research").get() as {
      cnt: number;
    }
  ).cnt;

  if (convCount + invCount + resCount === 0) {
    return {
      totalConversations: 0,
      totalInvestments: 0,
      totalResearch: 0,
      oldestMemory: null,
      newestMemory: null,
    };
  }

  // Get oldest and newest across all tables
  const oldest = database
    .prepare(
      `SELECT MIN(timestamp) as ts FROM (
        SELECT timestamp FROM conversations
        UNION ALL SELECT timestamp FROM investments
        UNION ALL SELECT timestamp FROM research
      )`
    )
    .get() as { ts: string | null };

  const newest = database
    .prepare(
      `SELECT MAX(timestamp) as ts FROM (
        SELECT timestamp FROM conversations
        UNION ALL SELECT timestamp FROM investments
        UNION ALL SELECT timestamp FROM research
      )`
    )
    .get() as { ts: string | null };

  return {
    totalConversations: convCount,
    totalInvestments: invCount,
    totalResearch: resCount,
    oldestMemory: oldest.ts,
    newestMemory: newest.ts,
  };
}

export function pruneOldMemories(maxAgeDays: number): number {
  const database = getDb();
  const cutoff = new Date(
    Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  ).toISOString();

  let removed = 0;

  const pruneAll = database.transaction(() => {
    const r1 = database
      .prepare("DELETE FROM conversations WHERE timestamp < ?")
      .run(cutoff);
    removed += r1.changes;

    const r2 = database
      .prepare("DELETE FROM investments WHERE timestamp < ?")
      .run(cutoff);
    removed += r2.changes;

    const r3 = database
      .prepare("DELETE FROM research WHERE timestamp < ?")
      .run(cutoff);
    removed += r3.changes;
  });

  pruneAll();
  return removed;
}

// ============================================================================
// SQLite-specific bonus features
// ============================================================================

/**
 * Full-text search across conversations (uses FTS5 if available)
 */
export function searchConversations(
  query: string,
  limit: number = 20
): ConversationMemory[] {
  const database = getDb();

  try {
    const rows = database
      .prepare(
        `SELECT c.* FROM conversations_fts fts
         JOIN conversations c ON c.rowid = fts.rowid
         WHERE conversations_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, limit) as ConversationRow[];
    return rows.map(rowToConversation);
  } catch {
    // FTS not available — fall back to LIKE
    const rows = database
      .prepare(
        `SELECT * FROM conversations
         WHERE user_query LIKE ? OR summary LIKE ? OR full_response LIKE ?
         ORDER BY timestamp DESC LIMIT ?`
      )
      .all(`%${query}%`, `%${query}%`, `%${query}%`, limit) as ConversationRow[];
    return rows.map(rowToConversation);
  }
}

/**
 * Get investment decisions for a symbol within a date range
 */
export function getInvestmentsByDateRange(
  startDate: string,
  endDate: string,
  symbol?: string
): InvestmentMemory[] {
  const database = getDb();

  let rows: InvestmentRow[];
  if (symbol) {
    rows = database
      .prepare(
        `SELECT * FROM investments
         WHERE timestamp >= ? AND timestamp <= ? AND UPPER(symbol) = UPPER(?)
         ORDER BY timestamp DESC`
      )
      .all(startDate, endDate, symbol) as InvestmentRow[];
  } else {
    rows = database
      .prepare(
        `SELECT * FROM investments
         WHERE timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp DESC`
      )
      .all(startDate, endDate) as InvestmentRow[];
  }

  return rows.map(rowToInvestment);
}

/**
 * Get unique symbols from investment history
 */
export function getTrackedSymbols(): string[] {
  const database = getDb();
  const rows = database
    .prepare("SELECT DISTINCT UPPER(symbol) as symbol FROM investments ORDER BY symbol")
    .all() as Array<{ symbol: string }>;
  return rows.map((r) => r.symbol);
}

/**
 * Close the database connection (for cleanup)
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
