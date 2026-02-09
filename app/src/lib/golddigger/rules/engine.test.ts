import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import type {
  PriceAlertConfig,
  DcaConfig,
  RebalanceConfig,
  StopLossConfig,
  TakeProfitConfig,
  TrailingStopConfig,
} from "./engine";

// Mock the audit logger so it doesn't try to open a separate portfolio DB.
// This needs to be declared at the top level so vi.mock hoisting works.
vi.mock("../portfolio/manager", () => ({
  logAuditEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers & module handle
// ---------------------------------------------------------------------------

let tmpDir: string;

/** The dynamically-imported engine module, refreshed per test. */
let engine: typeof import("./engine");

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Create a fresh temp directory so each test gets its own SQLite DB
  tmpDir = mkdtempSync(join(tmpdir(), "gd-rules-test-"));
  process.env.GOLDDIGGER_DATA_DIR = tmpDir;

  // Reset module registry so the engine's `dbInitialized` flag starts fresh
  vi.resetModules();

  // Re-apply the mock after resetModules (resetModules clears mocks too)
  vi.doMock("../portfolio/manager", () => ({
    logAuditEvent: vi.fn(),
  }));

  // Dynamically import the engine so we get a brand-new module instance
  engine = await import("./engine");
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
  delete process.env.GOLDDIGGER_DATA_DIR;
});

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makePriceAlertConfig(overrides?: Partial<PriceAlertConfig>): PriceAlertConfig {
  return {
    type: "price_alert",
    targetPrice: 200,
    direction: "above",
    action: "notify",
    ...overrides,
  };
}

function makeDcaConfig(overrides?: Partial<DcaConfig>): DcaConfig {
  return {
    type: "dca",
    amountPerExecution: 100,
    frequency: "weekly",
    totalBudget: 5000,
    totalSpent: 0,
    ...overrides,
  };
}

function makeRebalanceConfig(overrides?: Partial<RebalanceConfig>): RebalanceConfig {
  return {
    type: "rebalance",
    targetAllocation: { AAPL: 40, GOOGL: 30, CASH: 30 },
    driftThreshold: 5,
    minTradeAmount: 50,
    ...overrides,
  };
}

function makeStopLossConfig(overrides?: Partial<StopLossConfig>): StopLossConfig {
  return {
    type: "stop_loss",
    percentage: 5,
    ...overrides,
  };
}

function makeTakeProfitConfig(overrides?: Partial<TakeProfitConfig>): TakeProfitConfig {
  return {
    type: "take_profit",
    percentage: 15,
    sellPercentage: 100,
    ...overrides,
  };
}

function makeTrailingStopConfig(overrides?: Partial<TrailingStopConfig>): TrailingStopConfig {
  return {
    type: "trailing_stop",
    trailPercent: 3,
    highWaterMark: 210,
    currentStopPrice: 203.7,
    ...overrides,
  };
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Rules Engine - createRule", () => {
  it("should create a price_alert rule", () => {
    const rule = engine.createRule({
      name: "AAPL price alert",
      type: "price_alert",
      symbol: "AAPL",
      config: makePriceAlertConfig(),
    });

    expect(rule.id).toBeDefined();
    expect(rule.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rule.name).toBe("AAPL price alert");
    expect(rule.type).toBe("price_alert");
    expect(rule.status).toBe("active");
    expect(rule.symbol).toBe("AAPL");
    expect(rule.triggerCount).toBe(0);
    expect(rule.maxTriggers).toBe(0);
    expect(rule.config.type).toBe("price_alert");
    expect((rule.config as PriceAlertConfig).targetPrice).toBe(200);
    expect((rule.config as PriceAlertConfig).direction).toBe("above");
    expect(rule.createdAt).toBeDefined();
    expect(rule.updatedAt).toBeDefined();

    // Verify persisted to DB
    const fetched = engine.getRule(rule.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(rule.id);
    expect(fetched!.name).toBe(rule.name);
  });

  it("should create a dca rule", () => {
    const rule = engine.createRule({
      name: "Weekly BTC DCA",
      type: "dca",
      symbol: "BTC",
      config: makeDcaConfig({ frequency: "weekly", dayOfWeek: 1 }),
      schedule: "0 9 * * 1",
      maxTriggers: 52,
      notes: "1 year of weekly buys",
    });

    expect(rule.type).toBe("dca");
    expect(rule.schedule).toBe("0 9 * * 1");
    expect(rule.maxTriggers).toBe(52);
    expect(rule.notes).toBe("1 year of weekly buys");
    expect((rule.config as DcaConfig).amountPerExecution).toBe(100);
    expect((rule.config as DcaConfig).frequency).toBe("weekly");
    expect((rule.config as DcaConfig).dayOfWeek).toBe(1);
  });

  it("should create a rebalance rule", () => {
    const rule = engine.createRule({
      name: "Quarterly rebalance",
      type: "rebalance",
      config: makeRebalanceConfig({ driftThreshold: 10 }),
      schedule: "0 0 1 */3 *",
    });

    expect(rule.type).toBe("rebalance");
    expect((rule.config as RebalanceConfig).driftThreshold).toBe(10);
    expect((rule.config as RebalanceConfig).targetAllocation).toEqual({
      AAPL: 40,
      GOOGL: 30,
      CASH: 30,
    });
    expect(rule.symbol).toBeUndefined();
  });

  it("should create a stop_loss rule", () => {
    const rule = engine.createRule({
      name: "TSLA stop loss",
      type: "stop_loss",
      symbol: "TSLA",
      config: makeStopLossConfig({ percentage: 8, triggerPrice: 180 }),
      maxTriggers: 1,
    });

    expect(rule.type).toBe("stop_loss");
    expect(rule.maxTriggers).toBe(1);
    expect((rule.config as StopLossConfig).percentage).toBe(8);
    expect((rule.config as StopLossConfig).triggerPrice).toBe(180);
  });

  it("should create a take_profit rule", () => {
    const rule = engine.createRule({
      name: "NVDA take profit",
      type: "take_profit",
      symbol: "NVDA",
      config: makeTakeProfitConfig({ percentage: 25, sellPercentage: 50 }),
    });

    expect(rule.type).toBe("take_profit");
    expect((rule.config as TakeProfitConfig).percentage).toBe(25);
    expect((rule.config as TakeProfitConfig).sellPercentage).toBe(50);
  });

  it("should create a trailing_stop rule", () => {
    const rule = engine.createRule({
      name: "ETH trailing stop",
      type: "trailing_stop",
      symbol: "ETH",
      config: makeTrailingStopConfig({
        trailPercent: 5,
        highWaterMark: 3500,
        currentStopPrice: 3325,
      }),
    });

    expect(rule.type).toBe("trailing_stop");
    expect((rule.config as TrailingStopConfig).trailPercent).toBe(5);
    expect((rule.config as TrailingStopConfig).highWaterMark).toBe(3500);
    expect((rule.config as TrailingStopConfig).currentStopPrice).toBe(3325);
  });

  it("should default maxTriggers to 0 when not provided", () => {
    const rule = engine.createRule({
      name: "No max",
      type: "price_alert",
      config: makePriceAlertConfig(),
    });

    expect(rule.maxTriggers).toBe(0);
  });

  it("should set expiresAt when provided", () => {
    const expires = new Date(Date.now() + 86400000).toISOString();
    const rule = engine.createRule({
      name: "Expiring alert",
      type: "price_alert",
      config: makePriceAlertConfig(),
      expiresAt: expires,
    });

    expect(rule.expiresAt).toBe(expires);
  });

  it("should assign unique ids to each rule", () => {
    const r1 = engine.createRule({ name: "R1", type: "price_alert", config: makePriceAlertConfig() });
    const r2 = engine.createRule({ name: "R2", type: "price_alert", config: makePriceAlertConfig() });
    const r3 = engine.createRule({ name: "R3", type: "price_alert", config: makePriceAlertConfig() });

    expect(r1.id).not.toBe(r2.id);
    expect(r2.id).not.toBe(r3.id);
    expect(r1.id).not.toBe(r3.id);
  });
});

// ---------------------------------------------------------------------------
// getRules
// ---------------------------------------------------------------------------

describe("Rules Engine - getRules", () => {
  it("should return all rules when no status filter is given", () => {
    engine.createRule({ name: "Rule A", type: "price_alert", config: makePriceAlertConfig() });
    engine.createRule({ name: "Rule B", type: "dca", config: makeDcaConfig() });
    engine.createRule({ name: "Rule C", type: "stop_loss", config: makeStopLossConfig() });

    const rules = engine.getRules();
    expect(rules).toHaveLength(3);
  });

  it("should return rules filtered by status", () => {
    engine.createRule({ name: "Active", type: "price_alert", config: makePriceAlertConfig() });
    const r2 = engine.createRule({ name: "Paused", type: "dca", config: makeDcaConfig() });
    engine.createRule({ name: "Also Active", type: "stop_loss", config: makeStopLossConfig() });

    engine.updateRule(r2.id, { status: "paused" });

    const activeRules = engine.getRules("active");
    expect(activeRules).toHaveLength(2);
    expect(activeRules.every((r) => r.status === "active")).toBe(true);

    const pausedRules = engine.getRules("paused");
    expect(pausedRules).toHaveLength(1);
    expect(pausedRules[0].name).toBe("Paused");
  });

  it("should return empty array when no rules match the status filter", () => {
    engine.createRule({ name: "Active rule", type: "price_alert", config: makePriceAlertConfig() });

    const expired = engine.getRules("expired");
    expect(expired).toEqual([]);
  });

  it("should return rules in reverse chronological order (newest first)", () => {
    engine.createRule({ name: "First", type: "price_alert", config: makePriceAlertConfig() });
    engine.createRule({ name: "Second", type: "dca", config: makeDcaConfig() });
    engine.createRule({ name: "Third", type: "stop_loss", config: makeStopLossConfig() });

    const rules = engine.getRules();
    // ORDER BY created_at DESC => newest first
    expect(rules[0].name).toBe("Third");
    expect(rules[2].name).toBe("First");
  });

  it("should return empty array when no rules exist", () => {
    const rules = engine.getRules();
    expect(rules).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRule
// ---------------------------------------------------------------------------

describe("Rules Engine - getRule", () => {
  it("should return a single rule by id", () => {
    const created = engine.createRule({
      name: "Fetch me",
      type: "take_profit",
      symbol: "AAPL",
      config: makeTakeProfitConfig(),
      notes: "test note",
    });

    const fetched = engine.getRule(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.name).toBe("Fetch me");
    expect(fetched!.type).toBe("take_profit");
    expect(fetched!.symbol).toBe("AAPL");
    expect(fetched!.notes).toBe("test note");
    expect(fetched!.config.type).toBe("take_profit");
  });

  it("should return null for a non-existent id", () => {
    const result = engine.getRule("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("should correctly deserialize the config JSON", () => {
    const config = makeRebalanceConfig({
      targetAllocation: { BTC: 50, ETH: 30, CASH: 20 },
      driftThreshold: 7,
      minTradeAmount: 100,
    });
    const created = engine.createRule({ name: "Rebal", type: "rebalance", config });

    const fetched = engine.getRule(created.id);
    expect(fetched).not.toBeNull();
    const fetchedConfig = fetched!.config as RebalanceConfig;
    expect(fetchedConfig.type).toBe("rebalance");
    expect(fetchedConfig.targetAllocation).toEqual({ BTC: 50, ETH: 30, CASH: 20 });
    expect(fetchedConfig.driftThreshold).toBe(7);
    expect(fetchedConfig.minTradeAmount).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// updateRule
// ---------------------------------------------------------------------------

describe("Rules Engine - updateRule", () => {
  it("should update the name field", () => {
    const rule = engine.createRule({ name: "Old name", type: "price_alert", config: makePriceAlertConfig() });

    const updated = engine.updateRule(rule.id, { name: "New name" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New name");
  });

  it("should update the status field", () => {
    const rule = engine.createRule({ name: "Pause me", type: "dca", config: makeDcaConfig() });

    engine.updateRule(rule.id, { status: "paused" });
    const fetched = engine.getRule(rule.id);
    expect(fetched!.status).toBe("paused");
  });

  it("should update the config field", () => {
    const rule = engine.createRule({
      name: "Update config",
      type: "price_alert",
      config: makePriceAlertConfig({ targetPrice: 100 }),
    });

    const newConfig = makePriceAlertConfig({ targetPrice: 250, direction: "below" });
    engine.updateRule(rule.id, { config: newConfig });

    const fetched = engine.getRule(rule.id);
    expect((fetched!.config as PriceAlertConfig).targetPrice).toBe(250);
    expect((fetched!.config as PriceAlertConfig).direction).toBe("below");
  });

  it("should update the schedule field", () => {
    const rule = engine.createRule({
      name: "Schedule update",
      type: "dca",
      config: makeDcaConfig(),
      schedule: "0 9 * * 1",
    });

    engine.updateRule(rule.id, { schedule: "0 9 * * 5" });
    const fetched = engine.getRule(rule.id);
    expect(fetched!.schedule).toBe("0 9 * * 5");
  });

  it("should update the maxTriggers field", () => {
    const rule = engine.createRule({
      name: "Max triggers update",
      type: "stop_loss",
      config: makeStopLossConfig(),
      maxTriggers: 1,
    });

    engine.updateRule(rule.id, { maxTriggers: 5 });
    const fetched = engine.getRule(rule.id);
    expect(fetched!.maxTriggers).toBe(5);
  });

  it("should update the notes field", () => {
    const rule = engine.createRule({ name: "Notes test", type: "price_alert", config: makePriceAlertConfig() });

    engine.updateRule(rule.id, { notes: "Updated notes" });
    const fetched = engine.getRule(rule.id);
    expect(fetched!.notes).toBe("Updated notes");
  });

  it("should update the expiresAt field", () => {
    const rule = engine.createRule({ name: "Expires test", type: "price_alert", config: makePriceAlertConfig() });
    const newExpiry = new Date(Date.now() + 7 * 86400000).toISOString();

    engine.updateRule(rule.id, { expiresAt: newExpiry });
    const fetched = engine.getRule(rule.id);
    expect(fetched!.expiresAt).toBe(newExpiry);
  });

  it("should update multiple fields at once", () => {
    const rule = engine.createRule({
      name: "Multi update",
      type: "price_alert",
      config: makePriceAlertConfig(),
    });

    engine.updateRule(rule.id, {
      name: "Renamed",
      status: "paused",
      notes: "multi-field update",
      maxTriggers: 10,
    });

    const fetched = engine.getRule(rule.id);
    expect(fetched!.name).toBe("Renamed");
    expect(fetched!.status).toBe("paused");
    expect(fetched!.notes).toBe("multi-field update");
    expect(fetched!.maxTriggers).toBe(10);
  });

  it("should bump the updatedAt timestamp", async () => {
    const rule = engine.createRule({ name: "Timestamp test", type: "price_alert", config: makePriceAlertConfig() });
    const originalUpdatedAt = rule.updatedAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));

    const updated = engine.updateRule(rule.id, { name: "Updated" });
    expect(updated).not.toBeNull();
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );
  });

  it("should return null when updating a non-existent rule", () => {
    const result = engine.updateRule("00000000-0000-0000-0000-000000000000", { name: "Ghost" });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteRule
// ---------------------------------------------------------------------------

describe("Rules Engine - deleteRule", () => {
  it("should delete an existing rule and return true", () => {
    const rule = engine.createRule({ name: "Delete me", type: "price_alert", config: makePriceAlertConfig() });

    const deleted = engine.deleteRule(rule.id);
    expect(deleted).toBe(true);

    const fetched = engine.getRule(rule.id);
    expect(fetched).toBeNull();
  });

  it("should return false when deleting a non-existent rule", () => {
    const result = engine.deleteRule("00000000-0000-0000-0000-000000000000");
    expect(result).toBe(false);
  });

  it("should not affect other rules when deleting one", () => {
    const r1 = engine.createRule({ name: "Keep", type: "dca", config: makeDcaConfig() });
    const r2 = engine.createRule({ name: "Remove", type: "stop_loss", config: makeStopLossConfig() });
    const r3 = engine.createRule({ name: "Also keep", type: "take_profit", config: makeTakeProfitConfig() });

    engine.deleteRule(r2.id);

    const remaining = engine.getRules();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((r) => r.id)).not.toContain(r2.id);
    expect(remaining.map((r) => r.id)).toContain(r1.id);
    expect(remaining.map((r) => r.id)).toContain(r3.id);
  });
});

// ---------------------------------------------------------------------------
// markRuleTriggered
// ---------------------------------------------------------------------------

describe("Rules Engine - markRuleTriggered", () => {
  it("should increment the triggerCount by 1", () => {
    const rule = engine.createRule({ name: "Trigger me", type: "price_alert", config: makePriceAlertConfig() });
    expect(rule.triggerCount).toBe(0);

    engine.markRuleTriggered(rule.id);
    const after = engine.getRule(rule.id);
    expect(after!.triggerCount).toBe(1);

    engine.markRuleTriggered(rule.id);
    const after2 = engine.getRule(rule.id);
    expect(after2!.triggerCount).toBe(2);
  });

  it("should set lastTriggeredAt timestamp", () => {
    const rule = engine.createRule({ name: "Trigger ts", type: "price_alert", config: makePriceAlertConfig() });
    expect(rule.lastTriggeredAt).toBeUndefined();

    engine.markRuleTriggered(rule.id);

    const after = engine.getRule(rule.id);
    expect(after!.lastTriggeredAt).toBeDefined();
    const ts = new Date(after!.lastTriggeredAt!).getTime();
    expect(ts).toBeGreaterThan(0);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it("should auto-complete rule when triggerCount reaches maxTriggers", () => {
    const rule = engine.createRule({
      name: "Auto-complete",
      type: "stop_loss",
      symbol: "TSLA",
      config: makeStopLossConfig(),
      maxTriggers: 3,
    });

    engine.markRuleTriggered(rule.id);
    expect(engine.getRule(rule.id)!.status).toBe("active");
    expect(engine.getRule(rule.id)!.triggerCount).toBe(1);

    engine.markRuleTriggered(rule.id);
    expect(engine.getRule(rule.id)!.status).toBe("active");
    expect(engine.getRule(rule.id)!.triggerCount).toBe(2);

    engine.markRuleTriggered(rule.id);
    expect(engine.getRule(rule.id)!.triggerCount).toBe(3);
    expect(engine.getRule(rule.id)!.status).toBe("completed");
  });

  it("should not auto-complete when maxTriggers is 0 (unlimited)", () => {
    const rule = engine.createRule({
      name: "Unlimited",
      type: "price_alert",
      config: makePriceAlertConfig(),
      maxTriggers: 0,
    });

    for (let i = 0; i < 10; i++) {
      engine.markRuleTriggered(rule.id);
    }

    const after = engine.getRule(rule.id);
    expect(after!.triggerCount).toBe(10);
    expect(after!.status).toBe("active");
  });

  it("should auto-complete on exactly maxTriggers = 1", () => {
    const rule = engine.createRule({
      name: "One shot",
      type: "stop_loss",
      config: makeStopLossConfig(),
      maxTriggers: 1,
    });

    engine.markRuleTriggered(rule.id);

    const after = engine.getRule(rule.id);
    expect(after!.triggerCount).toBe(1);
    expect(after!.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// markRuleEvaluated
// ---------------------------------------------------------------------------

describe("Rules Engine - markRuleEvaluated", () => {
  it("should set last_evaluated_at timestamp", () => {
    const rule = engine.createRule({ name: "Eval me", type: "dca", config: makeDcaConfig() });
    expect(rule.lastEvaluatedAt).toBeUndefined();

    engine.markRuleEvaluated(rule.id);

    const after = engine.getRule(rule.id);
    expect(after!.lastEvaluatedAt).toBeDefined();
    const ts = new Date(after!.lastEvaluatedAt!).getTime();
    expect(ts).toBeGreaterThan(0);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it("should update updatedAt when evaluated", async () => {
    const rule = engine.createRule({ name: "Eval update", type: "rebalance", config: makeRebalanceConfig() });
    const originalUpdatedAt = rule.updatedAt;

    await new Promise((r) => setTimeout(r, 10));
    engine.markRuleEvaluated(rule.id);

    const after = engine.getRule(rule.id);
    expect(new Date(after!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );
  });

  it("should overwrite previous lastEvaluatedAt on subsequent calls", async () => {
    const rule = engine.createRule({ name: "Multi eval", type: "price_alert", config: makePriceAlertConfig() });

    engine.markRuleEvaluated(rule.id);
    const firstTs = engine.getRule(rule.id)!.lastEvaluatedAt;

    await new Promise((r) => setTimeout(r, 10));

    engine.markRuleEvaluated(rule.id);
    const secondTs = engine.getRule(rule.id)!.lastEvaluatedAt;

    expect(new Date(secondTs!).getTime()).toBeGreaterThanOrEqual(new Date(firstTs!).getTime());
  });

  it("should not affect triggerCount or status", () => {
    const rule = engine.createRule({ name: "No side effects", type: "dca", config: makeDcaConfig() });

    engine.markRuleEvaluated(rule.id);

    const after = engine.getRule(rule.id);
    expect(after!.triggerCount).toBe(0);
    expect(after!.status).toBe("active");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: non-existent rules
// ---------------------------------------------------------------------------

describe("Rules Engine - non-existent rule handling", () => {
  const fakeId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  it("getRule returns null for non-existent id", () => {
    expect(engine.getRule(fakeId)).toBeNull();
  });

  it("updateRule returns null for non-existent id", () => {
    expect(engine.updateRule(fakeId, { name: "Nope" })).toBeNull();
  });

  it("deleteRule returns false for non-existent id", () => {
    expect(engine.deleteRule(fakeId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Row mapping / serialization round-trip
// ---------------------------------------------------------------------------

describe("Rules Engine - serialization round-trip", () => {
  it("should preserve all fields through create -> getRule round-trip", () => {
    const expires = new Date(Date.now() + 86400000).toISOString();
    const config = makeDcaConfig({
      amountPerExecution: 250,
      frequency: "monthly",
      dayOfMonth: 15,
      totalBudget: 12000,
      totalSpent: 500,
    });

    const created = engine.createRule({
      name: "Full round-trip",
      type: "dca",
      symbol: "ETH",
      config,
      schedule: "0 0 15 * *",
      maxTriggers: 12,
      expiresAt: expires,
      notes: "Monthly ETH purchases",
    });

    const fetched = engine.getRule(created.id)!;

    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe("Full round-trip");
    expect(fetched.type).toBe("dca");
    expect(fetched.status).toBe("active");
    expect(fetched.symbol).toBe("ETH");
    expect(fetched.schedule).toBe("0 0 15 * *");
    expect(fetched.maxTriggers).toBe(12);
    expect(fetched.triggerCount).toBe(0);
    expect(fetched.expiresAt).toBe(expires);
    expect(fetched.notes).toBe("Monthly ETH purchases");
    expect(fetched.createdAt).toBe(created.createdAt);
    expect(fetched.updatedAt).toBe(created.updatedAt);

    const fetchedConfig = fetched.config as DcaConfig;
    expect(fetchedConfig.type).toBe("dca");
    expect(fetchedConfig.amountPerExecution).toBe(250);
    expect(fetchedConfig.frequency).toBe("monthly");
    expect(fetchedConfig.dayOfMonth).toBe(15);
    expect(fetchedConfig.totalBudget).toBe(12000);
    expect(fetchedConfig.totalSpent).toBe(500);
  });

  it("should handle rules without optional fields (symbol, schedule, expiresAt, notes)", () => {
    const rule = engine.createRule({
      name: "Minimal",
      type: "price_alert",
      config: makePriceAlertConfig(),
    });

    const fetched = engine.getRule(rule.id)!;
    expect(fetched.symbol).toBeUndefined();
    expect(fetched.schedule).toBeUndefined();
    expect(fetched.expiresAt).toBeUndefined();
    expect(fetched.notes).toBeUndefined();
    expect(fetched.lastEvaluatedAt).toBeUndefined();
    expect(fetched.lastTriggeredAt).toBeUndefined();
  });
});
