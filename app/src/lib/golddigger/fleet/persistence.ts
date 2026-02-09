/**
 * Fleet state persistence — SQLite-backed storage for fleet messages,
 * proposals, directives, and agent metrics.
 *
 * Hooks into the FleetBus to persist state changes and restore on startup.
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import type { FleetMessage, Proposal, Directive, AgentStatusInfo, AgentRole, VerificationStatus } from "./types";

// Use the same data directory as the main SQLite store
function getDataDirectory(): string {
  const dataDir = process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  const dbPath = path.join(getDataDirectory(), "golddigger-memory.db");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // Migrate: add verification_status column if missing
  try {
    const cols = db.prepare("PRAGMA table_info(fleet_proposals)").all() as { name: string }[];
    if (cols.length > 0 && !cols.some(c => c.name === "verification_status")) {
      db.exec("ALTER TABLE fleet_proposals ADD COLUMN verification_status TEXT DEFAULT 'awaiting_verification'");
      console.log("[Fleet Persistence] Migrated: added verification_status column");
    }
  } catch {
    // Table may not exist yet — will be created by main sqlite-store
  }

  return db;
}

// ── Save operations ──────────────────────────────────────

export function saveMessage(msg: FleetMessage): void {
  try {
    const d = getDb();
    d.prepare(`
      INSERT OR REPLACE INTO fleet_messages (id, timestamp, sender, recipients, type, priority, subject, payload, status, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.timestamp, String(msg.sender),
      JSON.stringify(msg.recipients), msg.type, msg.priority,
      msg.subject, JSON.stringify(msg.payload || {}),
      msg.status, msg.parentId || null
    );
  } catch (e) { console.error("[Fleet Persistence] saveMessage error:", e); }
}

export function saveProposal(p: Proposal): void {
  try {
    const d = getDb();
    d.prepare(`
      INSERT OR REPLACE INTO fleet_proposals (
        id, timestamp, sender, recipients, type, priority, subject, payload, status,
        proposal_type, summary, reasoning, risk_level, risk_factors,
        neural_confidence, expected_return, required_approvals, approvals, ceo_decision,
        verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      p.id, p.timestamp, String(p.sender),
      JSON.stringify(p.recipients), p.type, p.priority,
      p.subject, JSON.stringify(p.payload || {}), p.status,
      p.proposalType, p.summary, p.reasoning,
      p.riskAssessment?.level || "medium",
      JSON.stringify(p.riskAssessment?.factors || []),
      p.neuralConfidence ?? null, p.expectedReturn ?? null,
      JSON.stringify(p.requiredApprovals || []),
      JSON.stringify(p.approvals || []),
      p.ceoDecision ? JSON.stringify(p.ceoDecision) : null,
      p.verificationStatus || "awaiting_verification"
    );
  } catch (e) { console.error("[Fleet Persistence] saveProposal error:", e); }
}

export function saveDirective(d: Directive): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO fleet_directives (id, timestamp, type, value, active)
      VALUES (?, ?, ?, ?, ?)
    `).run(d.id, d.timestamp, d.type, d.value, d.active ? 1 : 0);
  } catch (e) { console.error("[Fleet Persistence] saveDirective error:", e); }
}

export function saveAgentMetrics(role: AgentRole, info: AgentStatusInfo): void {
  try {
    const d = getDb();
    d.prepare(`
      INSERT OR REPLACE INTO fleet_agent_metrics (role, status, last_active, messages_processed, proposals_made, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(String(role), info.status, info.lastActive, info.messagesProcessed, info.proposalsMade);
  } catch (e) { console.error("[Fleet Persistence] saveAgentMetrics error:", e); }
}

// ── Load operations ──────────────────────────────────────

export function loadMessages(limit: number = 200): FleetMessage[] {
  try {
    const d = getDb();
    const rows = d.prepare(
      `SELECT * FROM fleet_messages ORDER BY timestamp DESC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];

    return rows.reverse().map(r => ({
      id: r.id as string,
      timestamp: r.timestamp as string,
      sender: r.sender as FleetMessage["sender"],
      recipients: JSON.parse((r.recipients as string) || "[]"),
      type: r.type as FleetMessage["type"],
      priority: r.priority as FleetMessage["priority"],
      subject: r.subject as string,
      payload: JSON.parse((r.payload as string) || "{}"),
      status: r.status as FleetMessage["status"],
      parentId: (r.parent_id as string) || undefined,
    }));
  } catch (e) {
    console.error("[Fleet Persistence] loadMessages error:", e);
    return [];
  }
}

export function loadProposals(): Proposal[] {
  try {
    const d = getDb();
    const rows = d.prepare(
      `SELECT * FROM fleet_proposals ORDER BY timestamp DESC LIMIT 100`
    ).all() as Record<string, unknown>[];

    return rows.reverse().map(r => ({
      id: r.id as string,
      timestamp: r.timestamp as string,
      sender: r.sender as Proposal["sender"],
      recipients: JSON.parse((r.recipients as string) || "[]"),
      type: (r.type as string) as Proposal["type"],
      priority: r.priority as Proposal["priority"],
      subject: r.subject as string,
      payload: JSON.parse((r.payload as string) || "{}"),
      status: r.status as Proposal["status"],
      proposalType: r.proposal_type as Proposal["proposalType"],
      summary: r.summary as string,
      reasoning: r.reasoning as string,
      riskAssessment: {
        level: (r.risk_level as string) as "low" | "medium" | "high",
        factors: JSON.parse((r.risk_factors as string) || "[]"),
      },
      neuralConfidence: r.neural_confidence as number | undefined,
      expectedReturn: r.expected_return as number | undefined,
      requiredApprovals: JSON.parse((r.required_approvals as string) || "[]"),
      approvals: JSON.parse((r.approvals as string) || "[]"),
      ceoDecision: r.ceo_decision ? JSON.parse(r.ceo_decision as string) : undefined,
      verificationStatus: (r.verification_status as VerificationStatus) || "awaiting_verification",
    }));
  } catch (e) {
    console.error("[Fleet Persistence] loadProposals error:", e);
    return [];
  }
}

export function loadDirectives(): Directive[] {
  try {
    const d = getDb();
    const rows = d.prepare(
      `SELECT * FROM fleet_directives ORDER BY timestamp ASC`
    ).all() as Record<string, unknown>[];

    return rows.map(r => ({
      id: r.id as string,
      timestamp: r.timestamp as string,
      type: r.type as Directive["type"],
      value: r.value as string,
      active: r.active === 1,
    }));
  } catch (e) {
    console.error("[Fleet Persistence] loadDirectives error:", e);
    return [];
  }
}

export function loadAgentMetrics(): Map<string, AgentStatusInfo> {
  try {
    const d = getDb();
    const rows = d.prepare(
      `SELECT * FROM fleet_agent_metrics`
    ).all() as Record<string, unknown>[];

    const map = new Map<string, AgentStatusInfo>();
    for (const r of rows) {
      map.set(r.role as string, {
        role: r.role as AgentRole,
        status: r.status as AgentStatusInfo["status"],
        lastActive: r.last_active as string,
        messagesProcessed: r.messages_processed as number,
        proposalsMade: r.proposals_made as number,
      });
    }
    return map;
  } catch (e) {
    console.error("[Fleet Persistence] loadAgentMetrics error:", e);
    return new Map();
  }
}

// ── Cleanup ──────────────────────────────────────────────

export function pruneOldMessages(keepDays: number = 7): number {
  try {
    const d = getDb();
    const cutoff = new Date(Date.now() - keepDays * 86400000).toISOString();
    const result = d.prepare(
      `DELETE FROM fleet_messages WHERE timestamp < ?`
    ).run(cutoff);
    return result.changes;
  } catch { return 0; }
}
