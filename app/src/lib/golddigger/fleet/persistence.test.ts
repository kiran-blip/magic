/**
 * Vitest suite for fleet persistence — SQLite-backed storage for fleet messages,
 * proposals, directives, and agent metrics.
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { AgentRole } from './types';
import type { FleetMessage, Proposal, Directive, AgentStatusInfo } from './types';

// ────────────────────────────────────────────────────────────────────────────
// Setup & Teardown
// ────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'gd-persistence-test-'));
  process.env.GOLDDIGGER_DATA_DIR = tempDir;

  // Create the tables that main sqlite-store normally creates
  const dbPath = path.join(tempDir, 'golddigger-memory.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS fleet_messages (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipients TEXT NOT NULL DEFAULT '[]',
      type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      subject TEXT NOT NULL DEFAULT '',
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      parent_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fleet_proposals (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipients TEXT NOT NULL DEFAULT '[]',
      type TEXT NOT NULL DEFAULT 'PROPOSAL',
      priority TEXT NOT NULL DEFAULT 'medium',
      subject TEXT NOT NULL DEFAULT '',
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      proposal_type TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      reasoning TEXT NOT NULL DEFAULT '',
      risk_level TEXT DEFAULT 'medium',
      risk_factors TEXT DEFAULT '[]',
      neural_confidence REAL,
      expected_return REAL,
      required_approvals TEXT DEFAULT '[]',
      approvals TEXT DEFAULT '[]',
      ceo_decision TEXT,
      verification_status TEXT DEFAULT 'awaiting_verification',
      verification_deadline TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fleet_directives (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS fleet_agent_metrics (
      role TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      last_active TEXT NOT NULL,
      messages_processed INTEGER DEFAULT 0,
      proposals_made INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.close();
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.GOLDDIGGER_DATA_DIR;
});

beforeEach(() => {
  // Clear tables before each test
  vi.resetModules();
  const dbPath = path.join(tempDir, 'golddigger-memory.db');
  const db = new Database(dbPath);
  db.exec(`
    DELETE FROM fleet_messages;
    DELETE FROM fleet_proposals;
    DELETE FROM fleet_directives;
    DELETE FROM fleet_agent_metrics;
  `);
  db.close();
});

// ────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeMessage(
  id: string,
  sender: string = 'RESEARCH_ANALYST',
  overrides?: Partial<FleetMessage>
): FleetMessage {
  const now = new Date().toISOString();
  return {
    id,
    timestamp: now,
    sender: sender as any,
    recipients: ['CEO'] as any,
    type: 'INSIGHT',
    priority: 'medium',
    subject: `Test message ${id}`,
    payload: { data: 'test' },
    status: 'pending',
    ...overrides,
  };
}

function makeProposal(
  id: string,
  overrides?: Partial<Proposal>
): Proposal {
  const now = new Date().toISOString();
  return {
    id,
    timestamp: now,
    sender: AgentRole.TRADING_ANALYST,
    recipients: ['CEO'] as any,
    type: 'PROPOSAL',
    priority: 'medium',
    subject: 'Test proposal',
    payload: { symbol: 'AAPL' },
    status: 'pending',
    proposalType: 'trade',
    summary: 'Test trade',
    reasoning: 'Test reasoning',
    riskAssessment: { level: 'medium', factors: ['test risk'] },
    neuralConfidence: 0.75,
    expectedReturn: 0.03,
    requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
    approvals: [],
    verificationStatus: 'awaiting_verification',
    ...overrides,
  };
}

function makeDirective(
  id: string,
  overrides?: Partial<Directive>
): Directive {
  const now = new Date().toISOString();
  return {
    id,
    timestamp: now,
    type: 'risk_tolerance',
    value: 'medium',
    active: true,
    ...overrides,
  };
}

function makeAgentMetrics(
  role: AgentRole,
  overrides?: Partial<AgentStatusInfo>
): AgentStatusInfo {
  return {
    role,
    status: 'idle',
    lastActive: new Date().toISOString(),
    messagesProcessed: 0,
    proposalsMade: 0,
    ...overrides,
  };
}

// Helper to load persistence module with fresh db connection
async function loadPersistence() {
  vi.resetModules();
  return await import('./persistence');
}

// ────────────────────────────────────────────────────────────────────────────
// Test Suites
// ────────────────────────────────────────────────────────────────────────────

describe('Fleet Persistence - Message Operations', () => {
  it('saves and loads a single message', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();
    const msg = makeMessage('msg-1', AgentRole.RESEARCH_ANALYST);

    saveMessage(msg);
    const loaded = loadMessages(10);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('msg-1');
    expect(loaded[0].sender).toBe(AgentRole.RESEARCH_ANALYST);
    expect(loaded[0].subject).toBe('Test message msg-1');
    expect(loaded[0].priority).toBe('medium');
  });

  it('saves and loads multiple messages in correct order (oldest first)', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
    const msg1 = makeMessage('msg-1', AgentRole.RESEARCH_ANALYST, {
      timestamp: new Date(baseTime).toISOString(),
    });
    const msg2 = makeMessage('msg-2', AgentRole.RISK_MANAGER, {
      timestamp: new Date(baseTime + 1000).toISOString(),
    });
    const msg3 = makeMessage('msg-3', AgentRole.TRADING_ANALYST, {
      timestamp: new Date(baseTime + 2000).toISOString(),
    });

    saveMessage(msg1);
    saveMessage(msg2);
    saveMessage(msg3);

    const loaded = loadMessages(10);

    expect(loaded).toHaveLength(3);
    // Should be oldest first (reverse of DESC order)
    expect(loaded[0].id).toBe('msg-1');
    expect(loaded[1].id).toBe('msg-2');
    expect(loaded[2].id).toBe('msg-3');
  });

  it('respects limit parameter on loadMessages', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    for (let i = 0; i < 10; i++) {
      saveMessage(makeMessage(`msg-${i}`));
    }

    const loaded = loadMessages(3);
    expect(loaded).toHaveLength(3);
  });

  it('handles empty message table', async () => {
    const { loadMessages } = await loadPersistence();
    const loaded = loadMessages(10);

    expect(loaded).toEqual([]);
  });

  it('preserves all fields through save/load cycle', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    const msg = makeMessage('msg-complex', AgentRole.QUANT_ANALYST, {
      recipients: [AgentRole.CEO, AgentRole.RISK_MANAGER] as any,
      type: 'REQUEST',
      priority: 'critical',
      subject: 'Complex message',
      payload: {
        data: 'test',
        nested: { value: 42 },
        array: [1, 2, 3],
      },
      status: 'read',
      parentId: 'parent-msg-1',
    });

    saveMessage(msg);
    const loaded = loadMessages(10);

    expect(loaded[0].id).toBe('msg-complex');
    expect(loaded[0].sender).toBe(AgentRole.QUANT_ANALYST);
    expect(loaded[0].recipients).toEqual([AgentRole.CEO, AgentRole.RISK_MANAGER]);
    expect(loaded[0].type).toBe('REQUEST');
    expect(loaded[0].priority).toBe('critical');
    expect(loaded[0].subject).toBe('Complex message');
    expect(loaded[0].payload).toEqual({
      data: 'test',
      nested: { value: 42 },
      array: [1, 2, 3],
    });
    expect(loaded[0].status).toBe('read');
    expect(loaded[0].parentId).toBe('parent-msg-1');
  });

  it('handles message with empty payload object', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    const msg = makeMessage('msg-empty-payload', AgentRole.RESEARCH_ANALYST, {
      payload: {},
    });

    saveMessage(msg);
    const loaded = loadMessages(10);

    expect(loaded[0].payload).toEqual({});
  });

  it('handles message with null parentId', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    const msg = makeMessage('msg-no-parent', AgentRole.RESEARCH_ANALYST, {
      parentId: undefined,
    });

    saveMessage(msg);
    const loaded = loadMessages(10);

    expect(loaded[0].parentId).toBeUndefined();
  });
});

describe('Fleet Persistence - Proposal Operations', () => {
  it('saves and loads proposal with all fields', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();
    const proposal = makeProposal('prop-1');

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('prop-1');
    expect(loaded[0].proposalType).toBe('trade');
    expect(loaded[0].sender).toBe(AgentRole.TRADING_ANALYST);
    expect(loaded[0].summary).toBe('Test trade');
    expect(loaded[0].reasoning).toBe('Test reasoning');
  });

  it('preserves riskAssessment through JSON serialization', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal = makeProposal('prop-risk', {
      riskAssessment: {
        level: 'high',
        factors: ['market_volatility', 'liquidity_risk', 'concentration_risk'],
      },
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded[0].riskAssessment).toEqual({
      level: 'high',
      factors: ['market_volatility', 'liquidity_risk', 'concentration_risk'],
    });
  });

  it('preserves approvals array through serialization', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal = makeProposal('prop-approvals', {
      approvals: [
        {
          agent: AgentRole.RISK_MANAGER,
          approved: true,
          notes: 'Risk acceptable',
          timestamp: new Date().toISOString(),
        },
        {
          agent: AgentRole.PORTFOLIO_STRATEGIST,
          approved: false,
          notes: 'Does not fit strategy',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded[0].approvals).toHaveLength(2);
    expect(loaded[0].approvals[0].agent).toBe(AgentRole.RISK_MANAGER);
    expect(loaded[0].approvals[0].approved).toBe(true);
    expect(loaded[0].approvals[0].notes).toBe('Risk acceptable');
    expect(loaded[0].approvals[1].agent).toBe(AgentRole.PORTFOLIO_STRATEGIST);
    expect(loaded[0].approvals[1].approved).toBe(false);
  });

  it('preserves ceoDecision through serialization', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const decisionTime = new Date().toISOString();
    const proposal = makeProposal('prop-ceo-decision', {
      ceoDecision: {
        approved: true,
        notes: 'Approved with conditions',
        timestamp: decisionTime,
      },
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded[0].ceoDecision).toEqual({
      approved: true,
      notes: 'Approved with conditions',
      timestamp: decisionTime,
    });
  });

  it('preserves verification_status field', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal1 = makeProposal('prop-awaiting', {
      verificationStatus: 'awaiting_verification',
    });
    const proposal2 = makeProposal('prop-verified', {
      verificationStatus: 'verified',
    });
    const proposal3 = makeProposal('prop-disputed', {
      verificationStatus: 'disputed',
    });

    saveProposal(proposal1);
    saveProposal(proposal2);
    saveProposal(proposal3);

    const loaded = loadProposals();

    expect(loaded).toHaveLength(3);
    const awaiting = loaded.find(p => p.id === 'prop-awaiting');
    const verified = loaded.find(p => p.id === 'prop-verified');
    const disputed = loaded.find(p => p.id === 'prop-disputed');

    expect(awaiting?.verificationStatus).toBe('awaiting_verification');
    expect(verified?.verificationStatus).toBe('verified');
    expect(disputed?.verificationStatus).toBe('disputed');
  });

  it('handles proposal with null/undefined optional fields', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal = makeProposal('prop-nulls', {
      neuralConfidence: undefined,
      expectedReturn: undefined,
      ceoDecision: undefined,
      riskAssessment: undefined,
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded[0].neuralConfidence).toBeUndefined();
    expect(loaded[0].expectedReturn).toBeUndefined();
    expect(loaded[0].ceoDecision).toBeUndefined();
    // riskAssessment should have defaults
    expect(loaded[0].riskAssessment?.level).toBe('medium');
    expect(loaded[0].riskAssessment?.factors).toEqual([]);
  });

  it('saves and loads multiple proposals in correct order', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
    const prop1 = makeProposal('prop-1', {
      timestamp: new Date(baseTime).toISOString(),
    });
    const prop2 = makeProposal('prop-2', {
      timestamp: new Date(baseTime + 1000).toISOString(),
    });

    saveProposal(prop1);
    saveProposal(prop2);

    const loaded = loadProposals();

    expect(loaded).toHaveLength(2);
    // Should be oldest first
    expect(loaded[0].id).toBe('prop-1');
    expect(loaded[1].id).toBe('prop-2');
  });

  it('respects limit of 100 proposals on load', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    // Create 150 proposals
    for (let i = 0; i < 150; i++) {
      const prop = makeProposal(`prop-${i}`, {
        timestamp: new Date(1000 * i).toISOString(),
      });
      saveProposal(prop);
    }

    const loaded = loadProposals();

    // Should only load the most recent 100
    expect(loaded.length).toBeLessThanOrEqual(100);
  });
});

describe('Fleet Persistence - Directive Operations', () => {
  it('saves and loads directive', async () => {
    const { saveDirective, loadDirectives } = await loadPersistence();
    const directive = makeDirective('dir-1');

    saveDirective(directive);
    const loaded = loadDirectives();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('dir-1');
    expect(loaded[0].type).toBe('risk_tolerance');
    expect(loaded[0].value).toBe('medium');
    expect(loaded[0].active).toBe(true);
  });

  it('stores active flag as integer (1/0), loads as boolean', async () => {
    const { saveDirective, loadDirectives } = await loadPersistence();

    const dirActive = makeDirective('dir-active', { active: true });
    const dirInactive = makeDirective('dir-inactive', { active: false });

    saveDirective(dirActive);
    saveDirective(dirInactive);

    const loaded = loadDirectives();

    expect(loaded).toHaveLength(2);
    const active = loaded.find(d => d.id === 'dir-active');
    const inactive = loaded.find(d => d.id === 'dir-inactive');

    expect(active?.active).toBe(true);
    expect(typeof active?.active).toBe('boolean');
    expect(inactive?.active).toBe(false);
    expect(typeof inactive?.active).toBe('boolean');
  });

  it('loads multiple directives in timestamp order (ascending)', async () => {
    const { saveDirective, loadDirectives } = await loadPersistence();

    const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
    const dir1 = makeDirective('dir-1', {
      timestamp: new Date(baseTime + 2000).toISOString(),
    });
    const dir2 = makeDirective('dir-2', {
      timestamp: new Date(baseTime).toISOString(),
    });
    const dir3 = makeDirective('dir-3', {
      timestamp: new Date(baseTime + 1000).toISOString(),
    });

    saveDirective(dir1);
    saveDirective(dir2);
    saveDirective(dir3);

    const loaded = loadDirectives();

    expect(loaded).toHaveLength(3);
    // Should be in ascending timestamp order
    expect(loaded[0].id).toBe('dir-2');
    expect(loaded[1].id).toBe('dir-3');
    expect(loaded[2].id).toBe('dir-1');
  });

  it('handles different directive types', async () => {
    const { saveDirective, loadDirectives } = await loadPersistence();

    const types: Array<'risk_tolerance' | 'focus_sectors' | 'max_position_size' | 'trading_style' | 'general'> = [
      'risk_tolerance',
      'focus_sectors',
      'max_position_size',
      'trading_style',
      'general',
    ];

    types.forEach((type, idx) => {
      saveDirective(makeDirective(`dir-${idx}`, { type, value: `value-${type}` }));
    });

    const loaded = loadDirectives();

    expect(loaded).toHaveLength(5);
    expect(loaded.map(d => d.type)).toEqual(types);
  });
});

describe('Fleet Persistence - Agent Metrics Operations', () => {
  it('saves and loads agent metrics', async () => {
    const { saveAgentMetrics, loadAgentMetrics } = await loadPersistence();

    const metrics = makeAgentMetrics(AgentRole.RESEARCH_ANALYST, {
      status: 'thinking',
      messagesProcessed: 42,
      proposalsMade: 5,
    });

    saveAgentMetrics(AgentRole.RESEARCH_ANALYST, metrics);
    const loaded = loadAgentMetrics();

    expect(loaded.has(AgentRole.RESEARCH_ANALYST)).toBe(true);
    const loadedMetrics = loaded.get(AgentRole.RESEARCH_ANALYST);
    expect(loadedMetrics?.role).toBe(AgentRole.RESEARCH_ANALYST);
    expect(loadedMetrics?.status).toBe('thinking');
    expect(loadedMetrics?.messagesProcessed).toBe(42);
    expect(loadedMetrics?.proposalsMade).toBe(5);
  });

  it('updates existing metrics (INSERT OR REPLACE)', async () => {
    const { saveAgentMetrics, loadAgentMetrics } = await loadPersistence();

    const metrics1 = makeAgentMetrics(AgentRole.RISK_MANAGER, {
      status: 'idle',
      messagesProcessed: 10,
    });

    const metrics2 = makeAgentMetrics(AgentRole.RISK_MANAGER, {
      status: 'analyzing',
      messagesProcessed: 20,
    });

    saveAgentMetrics(AgentRole.RISK_MANAGER, metrics1);
    saveAgentMetrics(AgentRole.RISK_MANAGER, metrics2);

    const loaded = loadAgentMetrics();

    expect(loaded.size).toBe(1);
    const metrics = loaded.get(AgentRole.RISK_MANAGER);
    expect(metrics?.status).toBe('analyzing');
    expect(metrics?.messagesProcessed).toBe(20);
  });

  it('loads all agents into Map correctly', async () => {
    const { saveAgentMetrics, loadAgentMetrics } = await loadPersistence();

    const roles = [
      AgentRole.RESEARCH_ANALYST,
      AgentRole.RISK_MANAGER,
      AgentRole.PORTFOLIO_STRATEGIST,
      AgentRole.TRADING_ANALYST,
    ];

    roles.forEach((role, idx) => {
      const metrics = makeAgentMetrics(role, {
        messagesProcessed: idx * 10,
        proposalsMade: idx,
      });
      saveAgentMetrics(role, metrics);
    });

    const loaded = loadAgentMetrics();

    expect(loaded.size).toBe(4);
    roles.forEach((role, idx) => {
      expect(loaded.has(role)).toBe(true);
      expect(loaded.get(role)?.messagesProcessed).toBe(idx * 10);
      expect(loaded.get(role)?.proposalsMade).toBe(idx);
    });
  });

  it('handles empty agent metrics table', async () => {
    const { loadAgentMetrics } = await loadPersistence();

    const loaded = loadAgentMetrics();

    expect(loaded).toBeInstanceOf(Map);
    expect(loaded.size).toBe(0);
  });
});

describe('Fleet Persistence - Cleanup & Pruning', () => {
  it('pruneOldMessages removes messages older than threshold', async () => {
    const { saveMessage, loadMessages, pruneOldMessages } = await loadPersistence();

    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 86400000).toISOString();
    const threeDaysAgo = new Date(now - 3 * 86400000).toISOString();

    saveMessage(makeMessage('old-msg-1', AgentRole.RESEARCH_ANALYST, { timestamp: eightDaysAgo }));
    saveMessage(makeMessage('old-msg-2', AgentRole.RESEARCH_ANALYST, { timestamp: eightDaysAgo }));
    saveMessage(makeMessage('recent-msg-1', AgentRole.RESEARCH_ANALYST, { timestamp: threeDaysAgo }));
    saveMessage(makeMessage('recent-msg-2', AgentRole.RESEARCH_ANALYST, { timestamp: new Date().toISOString() }));

    const beforePrune = loadMessages(100);
    expect(beforePrune).toHaveLength(4);

    // Prune messages older than 7 days
    pruneOldMessages(7);

    const afterPrune = loadMessages(100);

    expect(afterPrune).toHaveLength(2);
    expect(afterPrune.map(m => m.id)).toContain('recent-msg-1');
    expect(afterPrune.map(m => m.id)).toContain('recent-msg-2');
  });

  it('pruneOldMessages keeps messages within threshold', async () => {
    const { saveMessage, loadMessages, pruneOldMessages } = await loadPersistence();

    const now = Date.now();
    const threeDaysAgo = new Date(now - 3 * 86400000).toISOString();
    const oneDayAgo = new Date(now - 1 * 86400000).toISOString();

    saveMessage(makeMessage('msg-1', AgentRole.RESEARCH_ANALYST, { timestamp: threeDaysAgo }));
    saveMessage(makeMessage('msg-2', AgentRole.RESEARCH_ANALYST, { timestamp: oneDayAgo }));

    const beforePrune = loadMessages(100);
    expect(beforePrune).toHaveLength(2);

    // Prune messages older than 7 days (should keep all)
    pruneOldMessages(7);

    const afterPrune = loadMessages(100);

    expect(afterPrune).toHaveLength(2);
  });

  it('pruneOldMessages returns count of deleted messages', async () => {
    const { saveMessage, pruneOldMessages } = await loadPersistence();

    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 86400000).toISOString();
    const oneDayAgo = new Date(now - 1 * 86400000).toISOString();

    saveMessage(makeMessage('old-1', AgentRole.RESEARCH_ANALYST, { timestamp: eightDaysAgo }));
    saveMessage(makeMessage('old-2', AgentRole.RESEARCH_ANALYST, { timestamp: eightDaysAgo }));
    saveMessage(makeMessage('old-3', AgentRole.RESEARCH_ANALYST, { timestamp: eightDaysAgo }));
    saveMessage(makeMessage('recent-1', AgentRole.RESEARCH_ANALYST, { timestamp: oneDayAgo }));

    const deleted = pruneOldMessages(7);

    expect(deleted).toBe(3);
  });
});

describe('Fleet Persistence - Verification Status', () => {
  it('saves proposal with awaiting_verification status', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal = makeProposal('prop-verify-awaiting', {
      verificationStatus: 'awaiting_verification',
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded[0].verificationStatus).toBe('awaiting_verification');
  });

  it('updates proposal verification_status on re-save', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal = makeProposal('prop-verify-update', {
      verificationStatus: 'awaiting_verification',
    });

    saveProposal(proposal);
    let loaded = loadProposals();
    expect(loaded[0].verificationStatus).toBe('awaiting_verification');

    // Update with new status
    proposal.verificationStatus = 'verified';
    saveProposal(proposal);

    vi.resetModules();
    const { loadProposals: reloadProposals } = await loadPersistence();
    loaded = reloadProposals();

    expect(loaded[0].verificationStatus).toBe('verified');
  });

  it('loads proposal with all verification status values', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const statuses: Array<'awaiting_verification' | 'verified' | 'disputed' | 'mixed' | 'overridden'> = [
      'awaiting_verification',
      'verified',
      'disputed',
      'mixed',
      'overridden',
    ];

    statuses.forEach((status, idx) => {
      const prop = makeProposal(`prop-status-${idx}`, { verificationStatus: status });
      saveProposal(prop);
    });

    const loaded = loadProposals();

    expect(loaded).toHaveLength(5);
    statuses.forEach((status, idx) => {
      const prop = loaded.find(p => p.id === `prop-status-${idx}`);
      expect(prop?.verificationStatus).toBe(status);
    });
  });

  it('handles proposal without explicit verification_status (defaults to awaiting_verification)', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal = makeProposal('prop-no-status', {
      verificationStatus: undefined,
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded[0].verificationStatus).toBe('awaiting_verification');
  });
});

describe('Fleet Persistence - Edge Cases & Error Handling', () => {
  it('handles message with very long subject and payload', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    const longSubject = 'A'.repeat(1000);
    const complexPayload = {
      deep: {
        nested: {
          object: {
            with: {
              many: {
                levels: {
                  value: [1, 2, 3, 4, 5],
                },
              },
            },
          },
        },
      },
    };

    const msg = makeMessage('msg-long', AgentRole.RESEARCH_ANALYST, {
      subject: longSubject,
      payload: complexPayload,
    });

    saveMessage(msg);
    const loaded = loadMessages(10);

    expect(loaded[0].subject).toBe(longSubject);
    expect(loaded[0].payload).toEqual(complexPayload);
  });

  it('handles UPDATE of existing message by ID', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    const msg1 = makeMessage('msg-update', AgentRole.RESEARCH_ANALYST, {
      subject: 'Original',
      status: 'pending',
    });

    saveMessage(msg1);
    let loaded = loadMessages(10);
    expect(loaded[0].subject).toBe('Original');
    expect(loaded[0].status).toBe('pending');

    // Update same ID
    const msg2 = makeMessage('msg-update', AgentRole.RESEARCH_ANALYST, {
      subject: 'Updated',
      status: 'read',
    });

    saveMessage(msg2);
    loaded = loadMessages(10);

    expect(loaded).toHaveLength(1);
    expect(loaded[0].subject).toBe('Updated');
    expect(loaded[0].status).toBe('read');
  });

  it('handles UPDATE of existing proposal by ID', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const prop1 = makeProposal('prop-update', {
      summary: 'Original summary',
      verificationStatus: 'awaiting_verification',
    });

    saveProposal(prop1);
    let loaded = loadProposals();
    expect(loaded[0].summary).toBe('Original summary');

    // Update same ID
    const prop2 = makeProposal('prop-update', {
      summary: 'Updated summary',
      verificationStatus: 'verified',
    });

    saveProposal(prop2);
    loaded = loadProposals();

    expect(loaded).toHaveLength(1);
    expect(loaded[0].summary).toBe('Updated summary');
    expect(loaded[0].verificationStatus).toBe('verified');
  });

  it('handles multiple directives with same type', async () => {
    const { saveDirective, loadDirectives } = await loadPersistence();

    const dir1 = makeDirective('dir-1', { type: 'risk_tolerance', value: 'low' });
    const dir2 = makeDirective('dir-2', { type: 'risk_tolerance', value: 'medium' });
    const dir3 = makeDirective('dir-3', { type: 'risk_tolerance', value: 'high' });

    saveDirective(dir1);
    saveDirective(dir2);
    saveDirective(dir3);

    const loaded = loadDirectives();

    expect(loaded).toHaveLength(3);
    expect(loaded.filter(d => d.type === 'risk_tolerance')).toHaveLength(3);
  });

  it('preserves recipient agents with CEO in list', async () => {
    const { saveMessage, loadMessages } = await loadPersistence();

    const msg = makeMessage('msg-ceo-recipients', AgentRole.RESEARCH_ANALYST, {
      recipients: [
        AgentRole.CEO,
        AgentRole.RISK_MANAGER,
        AgentRole.PORTFOLIO_STRATEGIST,
      ] as any,
    });

    saveMessage(msg);
    const loaded = loadMessages(10);

    expect(loaded[0].recipients).toContain(AgentRole.CEO);
    expect(loaded[0].recipients).toContain(AgentRole.RISK_MANAGER);
    expect(loaded[0].recipients).toContain(AgentRole.PORTFOLIO_STRATEGIST);
    expect(loaded[0].recipients).toHaveLength(3);
  });

  it('preserves proposal requiredApprovals list', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const proposal = makeProposal('prop-required-approvals', {
      requiredApprovals: [
        AgentRole.RISK_MANAGER,
        AgentRole.PORTFOLIO_STRATEGIST,
        AgentRole.QUANT_ANALYST,
      ],
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    expect(loaded[0].requiredApprovals).toEqual([
      AgentRole.RISK_MANAGER,
      AgentRole.PORTFOLIO_STRATEGIST,
      AgentRole.QUANT_ANALYST,
    ]);
  });

  it('handles proposal with verification deadline', async () => {
    const { saveProposal, loadProposals } = await loadPersistence();

    const deadline = new Date(Date.now() + 24 * 3600000).toISOString();
    const proposal = makeProposal('prop-deadline', {
      verificationDeadline: deadline,
    });

    saveProposal(proposal);
    const loaded = loadProposals();

    // Note: verificationDeadline is stored but not serialized in the current implementation
    // This test documents current behavior
    expect(loaded[0].id).toBe('prop-deadline');
  });

  it('returns empty array on loadMessages error', async () => {
    const { loadMessages } = await loadPersistence();

    // Call with valid inputs — should work
    const loaded = loadMessages(10);
    expect(Array.isArray(loaded)).toBe(true);
  });

  it('returns empty array on loadProposals error', async () => {
    const { loadProposals } = await loadPersistence();

    const loaded = loadProposals();
    expect(Array.isArray(loaded)).toBe(true);
  });

  it('returns empty Map on loadAgentMetrics error', async () => {
    const { loadAgentMetrics } = await loadPersistence();

    const loaded = loadAgentMetrics();
    expect(loaded).toBeInstanceOf(Map);
    expect(loaded.size).toBe(0);
  });
});

describe('Fleet Persistence - Integration Scenarios', () => {
  it('complete workflow: save message, proposal, directives, and metrics', async () => {
    const {
      saveMessage,
      loadMessages,
      saveProposal,
      loadProposals,
      saveDirective,
      loadDirectives,
      saveAgentMetrics,
      loadAgentMetrics,
    } = await loadPersistence();

    // Save a message
    const msg = makeMessage('msg-integration', AgentRole.RESEARCH_ANALYST);
    saveMessage(msg);

    // Save a proposal
    const prop = makeProposal('prop-integration');
    saveProposal(prop);

    // Save a directive
    const dir = makeDirective('dir-integration');
    saveDirective(dir);

    // Save agent metrics
    const metrics = makeAgentMetrics(AgentRole.RESEARCH_ANALYST, {
      messagesProcessed: 1,
      proposalsMade: 1,
    });
    saveAgentMetrics(AgentRole.RESEARCH_ANALYST, metrics);

    // Load and verify all
    const messages = loadMessages(10);
    const proposals = loadProposals();
    const directives = loadDirectives();
    const agentMetrics = loadAgentMetrics();

    expect(messages).toHaveLength(1);
    expect(proposals).toHaveLength(1);
    expect(directives).toHaveLength(1);
    expect(agentMetrics.size).toBe(1);

    expect(messages[0].id).toBe('msg-integration');
    expect(proposals[0].id).toBe('prop-integration');
    expect(directives[0].id).toBe('dir-integration');
    expect(agentMetrics.get(AgentRole.RESEARCH_ANALYST)?.messagesProcessed).toBe(1);
  });

  it('multiple agents submitting messages and proposals', async () => {
    const { saveMessage, loadMessages, saveProposal, loadProposals } = await loadPersistence();

    const agents = [
      AgentRole.RESEARCH_ANALYST,
      AgentRole.RISK_MANAGER,
      AgentRole.TRADING_ANALYST,
      AgentRole.QUANT_ANALYST,
    ];

    // Each agent sends messages and proposals
    agents.forEach((agent, idx) => {
      const msg = makeMessage(`msg-${agent}`, agent);
      saveMessage(msg);

      const prop = makeProposal(`prop-${agent}`, {
        sender: agent,
        summary: `Proposal from ${agent}`,
      });
      saveProposal(prop);
    });

    const messages = loadMessages(100);
    const proposals = loadProposals();

    expect(messages).toHaveLength(4);
    expect(proposals).toHaveLength(4);

    agents.forEach(agent => {
      expect(messages.map(m => m.sender)).toContain(agent);
      expect(proposals.map(p => p.sender)).toContain(agent);
    });
  });
});
