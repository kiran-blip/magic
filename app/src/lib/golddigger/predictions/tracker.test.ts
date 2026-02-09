import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import Database from "better-sqlite3";

// Mock logAuditEvent before importing tracker — it uses its own DB
// and we don't want cross-module side effects in unit tests.
vi.mock("../portfolio/manager", () => ({
  logAuditEvent: vi.fn(),
}));

import {
  trackPrediction,
  resolvePendingPredictions,
  getPredictions,
  getPrediction,
  getPredictionStats,
} from "./tracker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

/**
 * We use a single temp directory for the whole test file so that the
 * module-level `dbInitialized` flag inside tracker.ts only fires once
 * (creating the table on the first getDb() call). Between tests we
 * truncate the data using a direct SQL DELETE.
 */
function clearPredictions(): void {
  const dbPath = path.join(tempDir, "golddigger-memory.db");
  const db = new Database(dbPath);
  try {
    db.exec("DELETE FROM tracked_predictions");
  } finally {
    db.close();
  }
}

function basePredictionInput(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "AAPL",
    predictionType: "direction" as const,
    prediction: "AAPL will go up this week",
    confidence: 0.8,
    priceAtPrediction: 150,
    direction: "up" as const,
    modelTier: "tier-1",
    source: "test-suite",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "gd-tracker-test-"));
  process.env.GOLDDIGGER_DATA_DIR = tempDir;

  // Force the tracker module to initialize the DB schema by making
  // one throwaway call. This sets the internal `dbInitialized` flag.
  trackPrediction(basePredictionInput());
});

beforeEach(() => {
  // Ensure a clean slate for every test
  clearPredictions();
});

afterAll(() => {
  delete process.env.GOLDDIGGER_DATA_DIR;
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ============================================================================
// 1. trackPrediction -- basic structure
// ============================================================================

describe("trackPrediction", () => {
  it("should return a TrackedPrediction with pending outcome", () => {
    const result = trackPrediction(basePredictionInput());

    expect(result).toBeDefined();
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
    expect(result.symbol).toBe("AAPL");
    expect(result.predictionType).toBe("direction");
    expect(result.prediction).toBe("AAPL will go up this week");
    expect(result.confidence).toBe(0.8);
    expect(result.priceAtPrediction).toBe(150);
    expect(result.direction).toBe("up");
    expect(result.modelTier).toBe("tier-1");
    expect(result.source).toBe("test-suite");
    expect(result.outcome).toBe("pending");
    expect(result.createdAt).toBeDefined();
    expect(result.expiresAt).toBeDefined();
    expect(result.priceAtResolution).toBeUndefined();
    expect(result.resolvedAt).toBeUndefined();
    expect(result.accuracyScore).toBeUndefined();
  });

  it("should persist the prediction so getPrediction can retrieve it", () => {
    const created = trackPrediction(basePredictionInput());
    const fetched = getPrediction(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.symbol).toBe("AAPL");
    expect(fetched!.outcome).toBe("pending");
  });

  it("should uppercase the symbol", () => {
    const result = trackPrediction(basePredictionInput({ symbol: "aapl" }));
    expect(result.symbol).toBe("AAPL");
  });

  // ---------- Confidence clamping ----------

  it("should clamp confidence above 1 to 1", () => {
    const result = trackPrediction(basePredictionInput({ confidence: 1.5 }));
    expect(result.confidence).toBe(1);
  });

  it("should clamp confidence below 0 to 0", () => {
    const result = trackPrediction(basePredictionInput({ confidence: -0.3 }));
    expect(result.confidence).toBe(0);
  });

  it("should leave valid confidence values untouched", () => {
    const result = trackPrediction(basePredictionInput({ confidence: 0.42 }));
    expect(result.confidence).toBeCloseTo(0.42);
  });

  // ---------- Default timeframe ----------

  it("should default timeframeHours to 168 (1 week) when not provided", () => {
    const result = trackPrediction(basePredictionInput());
    expect(result.timeframeHours).toBe(168);
  });

  it("should use the provided timeframeHours when given", () => {
    const result = trackPrediction(basePredictionInput({ timeframeHours: 24 }));
    expect(result.timeframeHours).toBe(24);
  });

  it("should set expiresAt = createdAt + timeframeHours", () => {
    const result = trackPrediction(basePredictionInput({ timeframeHours: 48 }));
    const created = new Date(result.createdAt).getTime();
    const expires = new Date(result.expiresAt).getTime();
    const diffHours = (expires - created) / (1000 * 60 * 60);
    expect(diffHours).toBeCloseTo(48, 0);
  });

  it("should store optional fields (targetPrice, recommendationId, notes)", () => {
    const result = trackPrediction(
      basePredictionInput({
        predictionType: "price_target",
        targetPrice: 175,
        recommendationId: "rec-123",
        notes: "Earnings play",
      })
    );
    expect(result.targetPrice).toBe(175);
    expect(result.recommendationId).toBe("rec-123");
    expect(result.notes).toBe("Earnings play");
  });
});

// ============================================================================
// 2. resolvePendingPredictions -- direction type
// ============================================================================

describe("resolvePendingPredictions -- direction", () => {
  it("should resolve as correct when actual direction matches predicted (up > 1%)", () => {
    trackPrediction(basePredictionInput({ direction: "up", priceAtPrediction: 100 }));
    const { results } = resolvePendingPredictions({ AAPL: 102 }); // +2%
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("correct");
  });

  it("should resolve as correct when predicted down and actual < -1%", () => {
    trackPrediction(
      basePredictionInput({ direction: "down", priceAtPrediction: 100 })
    );
    const { results } = resolvePendingPredictions({ AAPL: 97 }); // -3%
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("correct");
  });

  it("should resolve as correct when predicted sideways and actual within +/-1%", () => {
    trackPrediction(
      basePredictionInput({ direction: "sideways", priceAtPrediction: 100 })
    );
    const { results } = resolvePendingPredictions({ AAPL: 100.5 }); // +0.5%
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("correct");
  });

  it("should resolve as incorrect when predicted up but price went down", () => {
    trackPrediction(basePredictionInput({ direction: "up", priceAtPrediction: 100 }));
    const { results } = resolvePendingPredictions({ AAPL: 97 }); // -3%
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("incorrect");
  });

  it("should resolve as partially_correct when predicted sideways but actual < 3%", () => {
    trackPrediction(
      basePredictionInput({ direction: "sideways", priceAtPrediction: 100 })
    );
    // Actual moved 2% -- exceeds the 1% sideways threshold but within 3% partial
    const { results } = resolvePendingPredictions({ AAPL: 102 });
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("partially_correct");
  });

  it("should resolve as incorrect when predicted sideways and actual >= 3%", () => {
    trackPrediction(
      basePredictionInput({ direction: "sideways", priceAtPrediction: 100 })
    );
    const { results } = resolvePendingPredictions({ AAPL: 104 }); // +4%
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("incorrect");
  });
});

// ============================================================================
// 3. resolvePendingPredictions -- price_target type
// ============================================================================

describe("resolvePendingPredictions -- price_target", () => {
  it("should be correct when actual is within 2% of target", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "price_target",
        priceAtPrediction: 100,
        targetPrice: 120,
        direction: undefined,
      })
    );
    // |119 - 120| / 120 = 0.0083 < 0.02
    const { results } = resolvePendingPredictions({ AAPL: 119 });
    expect(results[0].outcome).toBe("correct");
  });

  it("should be partially_correct (0.7) when right direction and >= 50% of the way", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "price_target",
        priceAtPrediction: 100,
        targetPrice: 120,
        direction: undefined,
      })
    );
    // targetDiff = 20, actualDiff = 12 (60%), right direction (up)
    const { results } = resolvePendingPredictions({ AAPL: 112 });
    expect(results[0].outcome).toBe("partially_correct");

    const pred = getPredictions({ symbol: "AAPL" })[0];
    expect(pred.accuracyScore).toBeCloseTo(0.7);
  });

  it("should be partially_correct (0.3) when right direction but < 50% of the way", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "price_target",
        priceAtPrediction: 100,
        targetPrice: 120,
        direction: undefined,
      })
    );
    // targetDiff = 20, actualDiff = 5 (25%), right direction
    const { results } = resolvePendingPredictions({ AAPL: 105 });
    expect(results[0].outcome).toBe("partially_correct");

    const pred = getPredictions({ symbol: "AAPL" })[0];
    expect(pred.accuracyScore).toBeCloseTo(0.3);
  });

  it("should be incorrect when actual went in the wrong direction", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "price_target",
        priceAtPrediction: 100,
        targetPrice: 120,
        direction: undefined,
      })
    );
    // Price went down instead of up toward 120
    const { results } = resolvePendingPredictions({ AAPL: 95 });
    expect(results[0].outcome).toBe("incorrect");
  });

  it("should handle downward price targets correctly", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "price_target",
        priceAtPrediction: 100,
        targetPrice: 80,
        direction: undefined,
      })
    );
    // |79 - 80| / 80 = 0.0125 < 0.02 => correct
    const { results } = resolvePendingPredictions({ AAPL: 79 });
    expect(results[0].outcome).toBe("correct");
  });

  it("should expire when no targetPrice is set", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "price_target",
        priceAtPrediction: 100,
        targetPrice: undefined,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 110 });
    expect(results[0].outcome).toBe("expired");
  });
});

// ============================================================================
// 4. resolvePendingPredictions -- buy_signal type
// ============================================================================

describe("resolvePendingPredictions -- buy_signal", () => {
  it("should be correct when price went up > 2%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 103 }); // +3%
    expect(results[0].outcome).toBe("correct");
  });

  it("should be partially_correct when price went up > 0% but <= 2%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 101 }); // +1%
    expect(results[0].outcome).toBe("partially_correct");
  });

  it("should be incorrect when price went down", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 98 }); // -2%
    expect(results[0].outcome).toBe("incorrect");
  });

  it("should be incorrect when price is unchanged (0% change)", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 100 });
    expect(results[0].outcome).toBe("incorrect");
  });
});

// ============================================================================
// 5. resolvePendingPredictions -- sell_signal type
// ============================================================================

describe("resolvePendingPredictions -- sell_signal", () => {
  it("should be correct when price went down > 2%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "sell_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 97 }); // -3%
    expect(results[0].outcome).toBe("correct");
  });

  it("should be partially_correct when price went down > 0% but <= 2%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "sell_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 99 }); // -1%
    expect(results[0].outcome).toBe("partially_correct");
  });

  it("should be incorrect when price went up", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "sell_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 103 }); // +3%
    expect(results[0].outcome).toBe("incorrect");
  });
});

// ============================================================================
// 6. resolvePendingPredictions -- hold type
// ============================================================================

describe("resolvePendingPredictions -- hold", () => {
  it("should be correct when |change| < 3%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "hold",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 102 }); // +2%
    expect(results[0].outcome).toBe("correct");
  });

  it("should be partially_correct when |change| >= 3% but < 5%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "hold",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 104 }); // +4%
    expect(results[0].outcome).toBe("partially_correct");
  });

  it("should be incorrect when |change| >= 5%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "hold",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 106 }); // +6%
    expect(results[0].outcome).toBe("incorrect");
  });

  it("should be correct for negative movement within 3%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "hold",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 98 }); // -2%
    expect(results[0].outcome).toBe("correct");
  });
});

// ============================================================================
// 7. resolvePendingPredictions -- risk_warning type
// ============================================================================

describe("resolvePendingPredictions -- risk_warning", () => {
  it("should be correct when price dropped > 3%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "risk_warning",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 96 }); // -4%
    expect(results[0].outcome).toBe("correct");
  });

  it("should be partially_correct when price dropped > 0% but <= 3%", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "risk_warning",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 98 }); // -2%
    expect(results[0].outcome).toBe("partially_correct");
  });

  it("should be incorrect when price went up", () => {
    trackPrediction(
      basePredictionInput({
        predictionType: "risk_warning",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    const { results } = resolvePendingPredictions({ AAPL: 105 }); // +5%
    expect(results[0].outcome).toBe("incorrect");
  });
});

// ============================================================================
// 8. Expired predictions
// ============================================================================

describe("resolvePendingPredictions -- expired predictions", () => {
  it("should mark expired predictions as expired when no current price available", () => {
    // Insert prediction directly with expiresAt in the past
    const dbPath = path.join(tempDir, "golddigger-memory.db");
    const db = new Database(dbPath);
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const now = new Date().toISOString();
    const id = "expired-test-id-001";
    try {
      db.prepare(
        `INSERT INTO tracked_predictions
         (id, account_id, symbol, prediction_type, prediction, confidence,
          price_at_prediction, direction, timeframe_hours,
          created_at, expires_at, outcome, model_tier, source)
         VALUES (?, 'default', 'AAPL', 'direction', 'test', 0.8,
                 100, 'up', 168, ?, ?, 'pending', 'tier-1', 'test')`
      ).run(id, now, pastDate);
    } finally {
      db.close();
    }

    // Resolve with NO price for AAPL
    const { results } = resolvePendingPredictions({});
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("expired");
    expect(results[0].id).toBe(id);
  });

  it("should still evaluate expired predictions if current price is available", () => {
    // Insert prediction directly with expiresAt in the past
    const dbPath = path.join(tempDir, "golddigger-memory.db");
    const db = new Database(dbPath);
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const now = new Date().toISOString();
    const id = "expired-test-id-002";
    try {
      db.prepare(
        `INSERT INTO tracked_predictions
         (id, account_id, symbol, prediction_type, prediction, confidence,
          price_at_prediction, direction, timeframe_hours,
          created_at, expires_at, outcome, model_tier, source)
         VALUES (?, 'default', 'AAPL', 'direction', 'test', 0.8,
                 100, 'up', 168, ?, ?, 'pending', 'tier-1', 'test')`
      ).run(id, now, pastDate);
    } finally {
      db.close();
    }

    // Even though expired, the price is available so evaluatePrediction runs
    const { results } = resolvePendingPredictions({ AAPL: 105 }); // +5% = up => correct
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("correct");
  });

  it("should not resolve predictions that are neither expired nor have current price", () => {
    trackPrediction(
      basePredictionInput({
        symbol: "MSFT",
        timeframeHours: 9999,
      })
    );

    // Resolve with prices for a different symbol
    const { results } = resolvePendingPredictions({ AAPL: 200 });
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// 9. getPredictions with filters
// ============================================================================

describe("getPredictions", () => {
  beforeEach(() => {
    trackPrediction(basePredictionInput({ symbol: "AAPL" }));
    trackPrediction(basePredictionInput({ symbol: "NVDA" }));
    trackPrediction(basePredictionInput({ symbol: "AAPL" }));
    trackPrediction(basePredictionInput({ symbol: "TSLA" }));
  });

  it("should return all predictions when no filters applied", () => {
    const preds = getPredictions();
    expect(preds).toHaveLength(4);
  });

  it("should filter by symbol", () => {
    const preds = getPredictions({ symbol: "AAPL" });
    expect(preds).toHaveLength(2);
    expect(preds.every((p) => p.symbol === "AAPL")).toBe(true);
  });

  it("should filter by symbol case-insensitively", () => {
    const preds = getPredictions({ symbol: "aapl" });
    expect(preds).toHaveLength(2);
  });

  it("should filter by outcome", () => {
    const preds = getPredictions({ outcome: "pending" });
    expect(preds).toHaveLength(4);
    expect(preds.every((p) => p.outcome === "pending")).toBe(true);
  });

  it("should respect limit parameter", () => {
    const preds = getPredictions({ limit: 2 });
    expect(preds).toHaveLength(2);
  });

  it("should combine symbol and outcome filters", () => {
    // Resolve AAPL predictions (direction up, price at 150 => 200 is +33% => up)
    resolvePendingPredictions({ AAPL: 200 });

    const resolved = getPredictions({ symbol: "AAPL", outcome: "correct" });
    expect(resolved).toHaveLength(2);
    for (const p of resolved) {
      expect(p.symbol).toBe("AAPL");
      expect(p.outcome).toBe("correct");
    }
  });

  it("should return results ordered by created_at DESC", () => {
    const preds = getPredictions();
    for (let i = 1; i < preds.length; i++) {
      const prev = new Date(preds[i - 1].createdAt).getTime();
      const curr = new Date(preds[i].createdAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});

// ============================================================================
// 10. getPrediction (single)
// ============================================================================

describe("getPrediction", () => {
  it("should return a prediction by ID", () => {
    const created = trackPrediction(basePredictionInput());
    const fetched = getPrediction(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
  });

  it("should return null for non-existent ID", () => {
    const fetched = getPrediction("non-existent-id");
    expect(fetched).toBeNull();
  });
});

// ============================================================================
// 11. getPredictionStats -- comprehensive analytics
// ============================================================================

describe("getPredictionStats", () => {
  it("should return zero accuracy when no resolved predictions exist", () => {
    // Only pending predictions
    trackPrediction(basePredictionInput());
    trackPrediction(basePredictionInput({ symbol: "NVDA" }));

    const stats = getPredictionStats();

    expect(stats.totalPredictions).toBe(2);
    expect(stats.pending).toBe(2);
    expect(stats.resolved).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(stats.weightedAccuracy).toBe(0);
    expect(stats.correct).toBe(0);
    expect(stats.incorrect).toBe(0);
    expect(stats.partiallyCorrect).toBe(0);
    expect(stats.expired).toBe(0);
  });

  it("should return zero accuracy when there are no predictions at all", () => {
    const stats = getPredictionStats();
    expect(stats.totalPredictions).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(stats.weightedAccuracy).toBe(0);
  });

  it("should correctly count resolved, correct, incorrect, and partial", () => {
    // 1 correct direction prediction
    trackPrediction(
      basePredictionInput({
        symbol: "AAPL",
        direction: "up",
        priceAtPrediction: 100,
      })
    );
    // 1 incorrect direction prediction
    trackPrediction(
      basePredictionInput({
        symbol: "NVDA",
        direction: "up",
        priceAtPrediction: 100,
      })
    );
    // 1 partially correct hold
    trackPrediction(
      basePredictionInput({
        symbol: "TSLA",
        predictionType: "hold",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    // 1 still pending (no price provided)
    trackPrediction(
      basePredictionInput({
        symbol: "MSFT",
        direction: "up",
        priceAtPrediction: 100,
      })
    );

    resolvePendingPredictions({
      AAPL: 105, // +5% => direction up correct
      NVDA: 95,  // -5% => direction up incorrect (actual = down)
      TSLA: 104, // +4% => hold partially_correct (|change| >= 3 but < 5)
    });

    const stats = getPredictionStats();

    expect(stats.totalPredictions).toBe(4);
    expect(stats.resolved).toBe(3);
    expect(stats.pending).toBe(1);
    expect(stats.correct).toBe(1);
    expect(stats.incorrect).toBe(1);
    expect(stats.partiallyCorrect).toBe(1);
    expect(stats.accuracy).toBeCloseTo(1 / 3); // 1 correct out of 3 resolved
  });

  it("should compute weightedAccuracy using accuracyScore", () => {
    // Correct: accuracyScore = 1
    trackPrediction(
      basePredictionInput({
        symbol: "AAPL",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    // Partially correct: accuracyScore = 0.5
    trackPrediction(
      basePredictionInput({
        symbol: "NVDA",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );

    resolvePendingPredictions({
      AAPL: 105, // +5% => buy_signal correct (score 1)
      NVDA: 101, // +1% => buy_signal partial (score 0.5)
    });

    const stats = getPredictionStats();
    // weightedAccuracy = (1 + 0.5) / 2 = 0.75
    expect(stats.weightedAccuracy).toBeCloseTo(0.75);
  });

  it("should calculate byType breakdowns", () => {
    trackPrediction(
      basePredictionInput({
        symbol: "AAPL",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "NVDA",
        predictionType: "sell_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "TSLA",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );

    resolvePendingPredictions({
      AAPL: 105, // buy_signal correct
      NVDA: 95,  // sell_signal correct
      TSLA: 95,  // buy_signal incorrect (price went down)
    });

    const stats = getPredictionStats();
    expect(stats.byType["buy_signal"]).toBeDefined();
    expect(stats.byType["buy_signal"].total).toBe(2);
    expect(stats.byType["buy_signal"].correct).toBe(1);
    expect(stats.byType["buy_signal"].accuracy).toBeCloseTo(0.5);

    expect(stats.byType["sell_signal"]).toBeDefined();
    expect(stats.byType["sell_signal"].total).toBe(1);
    expect(stats.byType["sell_signal"].correct).toBe(1);
    expect(stats.byType["sell_signal"].accuracy).toBeCloseTo(1);
  });

  it("should calculate byTier breakdowns", () => {
    trackPrediction(
      basePredictionInput({
        symbol: "AAPL",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        modelTier: "tier-1",
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "NVDA",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        modelTier: "tier-2",
        direction: undefined,
      })
    );

    resolvePendingPredictions({
      AAPL: 105, // correct
      NVDA: 95,  // incorrect
    });

    const stats = getPredictionStats();
    expect(stats.byTier["tier-1"]).toBeDefined();
    expect(stats.byTier["tier-1"].total).toBe(1);
    expect(stats.byTier["tier-1"].correct).toBe(1);
    expect(stats.byTier["tier-1"].accuracy).toBeCloseTo(1);

    expect(stats.byTier["tier-2"]).toBeDefined();
    expect(stats.byTier["tier-2"].total).toBe(1);
    expect(stats.byTier["tier-2"].correct).toBe(0);
    expect(stats.byTier["tier-2"].accuracy).toBeCloseTo(0);
  });

  it("should report liveReadiness as not ready with few predictions", () => {
    trackPrediction(basePredictionInput({ priceAtPrediction: 100 }));
    resolvePendingPredictions({ AAPL: 105 });

    const stats = getPredictionStats();
    expect(stats.liveReadiness.ready).toBe(false);
    expect(stats.liveReadiness.meetsMinPredictions).toBe(false); // < 50
    expect(stats.liveReadiness.meetsMinDays).toBe(false); // just started
  });

  it("should include calibrationScore = 0 for fewer than 10 resolved predictions", () => {
    trackPrediction(basePredictionInput({ priceAtPrediction: 100 }));
    resolvePendingPredictions({ AAPL: 105 });

    const stats = getPredictionStats();
    expect(stats.calibrationScore).toBe(0);
  });

  it("should compute calibrationScore for 10+ resolved predictions", () => {
    // Create 12 predictions with high confidence
    for (let i = 0; i < 12; i++) {
      trackPrediction(
        basePredictionInput({
          symbol: `SYM${i}`,
          predictionType: "buy_signal",
          priceAtPrediction: 100,
          confidence: 0.9,
          direction: undefined,
        })
      );
    }

    // Make them all correct
    const prices: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      prices[`SYM${i}`] = 110; // +10%, all correct
    }
    resolvePendingPredictions(prices);

    const stats = getPredictionStats();
    // calibrationScore should be > 0 (not the < 10 placeholder)
    expect(stats.calibrationScore).toBeGreaterThan(0);
    expect(stats.calibrationScore).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// 12. Streak calculations
// ============================================================================

describe("getPredictionStats -- streaks", () => {
  it("should track current streak of correct predictions", () => {
    // 3 correct predictions in a row
    trackPrediction(
      basePredictionInput({
        symbol: "A1",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "A2",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "A3",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );

    resolvePendingPredictions({
      A1: 110, // correct
      A2: 110, // correct
      A3: 110, // correct
    });

    const stats = getPredictionStats();
    expect(stats.currentStreak).toBe(3);
    expect(stats.bestStreak).toBe(3);
  });

  it("should reset current streak on incorrect prediction", () => {
    // Create 3 correct then 1 incorrect
    trackPrediction(
      basePredictionInput({
        symbol: "B1",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "B2",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "B3",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );

    // Resolve first batch
    resolvePendingPredictions({
      B1: 110, // correct
      B2: 110, // correct
      B3: 110, // correct
    });

    // Add an incorrect prediction
    trackPrediction(
      basePredictionInput({
        symbol: "B4",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );

    resolvePendingPredictions({
      B4: 90, // incorrect -- price went down
    });

    const stats = getPredictionStats();
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(3);
  });

  it("should count partially_correct as continuing a streak", () => {
    trackPrediction(
      basePredictionInput({
        symbol: "C1",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "C2",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );

    resolvePendingPredictions({
      C1: 110, // correct
      C2: 101, // partially_correct (up > 0% but <= 2%)
    });

    const stats = getPredictionStats();
    // Both correct and partially_correct count toward streak
    expect(stats.currentStreak).toBe(2);
  });

  it("should track best streak across broken streaks", () => {
    // Streak of 2, then break, then streak of 1
    trackPrediction(
      basePredictionInput({
        symbol: "D1",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    trackPrediction(
      basePredictionInput({
        symbol: "D2",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    resolvePendingPredictions({
      D1: 110, // correct
      D2: 110, // correct
    });

    // Break the streak
    trackPrediction(
      basePredictionInput({
        symbol: "D3",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    resolvePendingPredictions({ D3: 90 }); // incorrect

    // New streak of 1
    trackPrediction(
      basePredictionInput({
        symbol: "D4",
        predictionType: "buy_signal",
        priceAtPrediction: 100,
        direction: undefined,
      })
    );
    resolvePendingPredictions({ D4: 110 }); // correct

    const stats = getPredictionStats();
    expect(stats.currentStreak).toBe(1);
    expect(stats.bestStreak).toBe(2);
  });

  it("should return 0 streaks when no predictions are resolved", () => {
    const stats = getPredictionStats();
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(0);
  });
});

// ============================================================================
// 13. resolvePendingPredictions -- general behavior
// ============================================================================

describe("resolvePendingPredictions -- general", () => {
  it("should return the count and results of resolved predictions", () => {
    trackPrediction(basePredictionInput({ symbol: "AAPL", priceAtPrediction: 100 }));
    trackPrediction(basePredictionInput({ symbol: "NVDA", priceAtPrediction: 100 }));

    const result = resolvePendingPredictions({ AAPL: 105, NVDA: 95 });

    expect(result.resolved).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toHaveProperty("id");
    expect(result.results[0]).toHaveProperty("outcome");
  });

  it("should not re-resolve already resolved predictions", () => {
    trackPrediction(basePredictionInput({ symbol: "AAPL", priceAtPrediction: 100 }));

    // Resolve once
    resolvePendingPredictions({ AAPL: 105 });

    // Try to resolve again -- should find nothing pending
    const secondRun = resolvePendingPredictions({ AAPL: 90 });
    expect(secondRun.resolved).toBe(0);
    expect(secondRun.results).toHaveLength(0);
  });

  it("should update price_at_resolution and resolved_at in stored prediction", () => {
    const pred = trackPrediction(
      basePredictionInput({ symbol: "AAPL", priceAtPrediction: 100 })
    );

    resolvePendingPredictions({ AAPL: 105 });

    const resolved = getPrediction(pred.id);
    expect(resolved).not.toBeNull();
    expect(resolved!.outcome).not.toBe("pending");
    expect(resolved!.priceAtResolution).toBe(105);
    expect(resolved!.resolvedAt).toBeDefined();
    expect(resolved!.accuracyScore).toBeDefined();
  });
});
