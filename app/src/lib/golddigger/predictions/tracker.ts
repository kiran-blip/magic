/**
 * Prediction Tracker for Gold Digger AGI.
 *
 * Records AI-generated predictions, tracks their outcomes over time,
 * calculates accuracy metrics, and builds the performance data needed
 * for the paper → live trading graduation.
 *
 * This is the ML foundation — validated prediction data will later feed
 * pattern learning and model calibration.
 */

import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";
import { randomUUID } from "crypto";
import { logAuditEvent } from "../portfolio/manager";

// ============================================================================
// Types
// ============================================================================

export type PredictionType =
  | "price_target"
  | "direction"
  | "buy_signal"
  | "sell_signal"
  | "hold"
  | "sector_rotation"
  | "risk_warning";

export type PredictionOutcome =
  | "pending"
  | "correct"
  | "incorrect"
  | "partially_correct"
  | "expired"
  | "cancelled";

export interface TrackedPrediction {
  id: string;
  symbol: string;
  predictionType: PredictionType;
  /** What Gold Digger predicted */
  prediction: string;
  /** AI's confidence (0–1) */
  confidence: number;
  /** Price at time of prediction */
  priceAtPrediction: number;
  /** Target price (for price_target type) */
  targetPrice?: number;
  /** Predicted direction: up, down, sideways */
  direction?: "up" | "down" | "sideways";
  /** Timeframe for the prediction */
  timeframeHours: number;
  /** When predicted */
  createdAt: string;
  /** When the prediction expires */
  expiresAt: string;
  /** Outcome tracking */
  outcome: PredictionOutcome;
  /** Actual price at resolution */
  priceAtResolution?: number;
  /** When resolved */
  resolvedAt?: string;
  /** Accuracy score (0–1), allows partial credit */
  accuracyScore?: number;
  /** Which model/tier made this prediction */
  modelTier: string;
  /** Source: which pipeline node generated it */
  source: string;
  /** Linked recommendation ID */
  recommendationId?: string;
  notes?: string;
}

export interface PredictionStats {
  totalPredictions: number;
  resolved: number;
  pending: number;
  correct: number;
  incorrect: number;
  partiallyCorrect: number;
  expired: number;
  /** Overall accuracy: correct / resolved */
  accuracy: number;
  /** Weighted accuracy (includes partial credit) */
  weightedAccuracy: number;
  /** Average confidence on correct predictions */
  avgConfidenceCorrect: number;
  /** Average confidence on incorrect predictions */
  avgConfidenceIncorrect: number;
  /** Calibration: how well confidence predicts accuracy */
  calibrationScore: number;
  /** By prediction type */
  byType: Record<string, { total: number; correct: number; accuracy: number }>;
  /** By model tier */
  byTier: Record<string, { total: number; correct: number; accuracy: number }>;
  /** Recent trend (last 30 days accuracy) */
  recentAccuracy: number;
  /** Streak of correct predictions */
  currentStreak: number;
  /** Best streak ever */
  bestStreak: number;
  /** Ready for live trading? */
  liveReadiness: {
    meetsMinPredictions: boolean;
    meetsWinRate: boolean;
    meetsMinDays: boolean;
    daysTracking: number;
    ready: boolean;
  };
}

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
      CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON tracked_predictions(symbol);
      CREATE INDEX IF NOT EXISTS idx_predictions_outcome ON tracked_predictions(outcome);
      CREATE INDEX IF NOT EXISTS idx_predictions_created ON tracked_predictions(created_at);
    `);
    dbInitialized = true;
  }

  return db;
}

// ============================================================================
// Record Predictions
// ============================================================================

export function trackPrediction(input: {
  symbol: string;
  predictionType: PredictionType;
  prediction: string;
  confidence: number;
  priceAtPrediction: number;
  targetPrice?: number;
  direction?: "up" | "down" | "sideways";
  timeframeHours?: number;
  modelTier: string;
  source: string;
  recommendationId?: string;
  notes?: string;
}): TrackedPrediction {
  const now = new Date();
  const timeframe = input.timeframeHours ?? 168; // Default 1 week
  const expiresAt = new Date(now.getTime() + timeframe * 60 * 60 * 1000);

  const prediction: TrackedPrediction = {
    id: randomUUID(),
    symbol: input.symbol.toUpperCase(),
    predictionType: input.predictionType,
    prediction: input.prediction,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    priceAtPrediction: input.priceAtPrediction,
    targetPrice: input.targetPrice,
    direction: input.direction,
    timeframeHours: timeframe,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    outcome: "pending",
    modelTier: input.modelTier,
    source: input.source,
    recommendationId: input.recommendationId,
    notes: input.notes,
  };

  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO tracked_predictions
       (id, account_id, symbol, prediction_type, prediction, confidence,
        price_at_prediction, target_price, direction, timeframe_hours,
        created_at, expires_at, outcome, model_tier, source,
        recommendation_id, notes)
       VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      prediction.id,
      prediction.symbol,
      prediction.predictionType,
      prediction.prediction,
      prediction.confidence,
      prediction.priceAtPrediction,
      prediction.targetPrice ?? null,
      prediction.direction ?? null,
      prediction.timeframeHours,
      prediction.createdAt,
      prediction.expiresAt,
      prediction.outcome,
      prediction.modelTier,
      prediction.source,
      prediction.recommendationId ?? null,
      prediction.notes ?? null
    );
  } finally {
    db.close();
  }

  logAuditEvent("prediction_tracked", "tracked_prediction", prediction.id, {
    symbol: prediction.symbol,
    type: prediction.predictionType,
    confidence: prediction.confidence,
  });

  return prediction;
}

// ============================================================================
// Resolve Predictions
// ============================================================================

/**
 * Check all pending predictions and resolve those that have expired
 * or can be evaluated against current prices.
 */
export function resolvePendingPredictions(
  currentPrices: Record<string, number>
): { resolved: number; results: Array<{ id: string; outcome: PredictionOutcome }> } {
  const db = getDb();
  const results: Array<{ id: string; outcome: PredictionOutcome }> = [];

  try {
    const pending = db
      .prepare(
        `SELECT * FROM tracked_predictions
         WHERE account_id = 'default' AND outcome = 'pending'
         ORDER BY created_at ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const now = new Date();

    for (const row of pending) {
      const pred = rowToPrediction(row);
      const currentPrice = currentPrices[pred.symbol];
      const expired = new Date(pred.expiresAt) <= now;

      // Can't resolve without price data and not expired
      if (!currentPrice && !expired) continue;

      let outcome: PredictionOutcome;
      let accuracyScore: number;

      if (expired && !currentPrice) {
        outcome = "expired";
        accuracyScore = 0;
      } else {
        const price = currentPrice ?? pred.priceAtPrediction;
        const evaluation = evaluatePrediction(pred, price);
        outcome = evaluation.outcome;
        accuracyScore = evaluation.accuracyScore;
      }

      // Update in DB
      db.prepare(
        `UPDATE tracked_predictions
         SET outcome = ?, price_at_resolution = ?, resolved_at = ?, accuracy_score = ?
         WHERE id = ?`
      ).run(
        outcome,
        currentPrice ?? null,
        now.toISOString(),
        accuracyScore,
        pred.id
      );

      results.push({ id: pred.id, outcome });
    }
  } finally {
    db.close();
  }

  return { resolved: results.length, results };
}

/**
 * Evaluate a single prediction against the actual price.
 */
function evaluatePrediction(
  pred: TrackedPrediction,
  actualPrice: number
): { outcome: PredictionOutcome; accuracyScore: number } {
  const priceChange = actualPrice - pred.priceAtPrediction;
  const priceChangePercent = (priceChange / pred.priceAtPrediction) * 100;

  switch (pred.predictionType) {
    case "direction": {
      const actualDirection =
        priceChangePercent > 1 ? "up" : priceChangePercent < -1 ? "down" : "sideways";
      if (actualDirection === pred.direction) {
        return { outcome: "correct", accuracyScore: 1 };
      }
      if (pred.direction === "sideways" && Math.abs(priceChangePercent) < 3) {
        return { outcome: "partially_correct", accuracyScore: 0.5 };
      }
      return { outcome: "incorrect", accuracyScore: 0 };
    }

    case "price_target": {
      if (!pred.targetPrice) {
        return { outcome: "expired", accuracyScore: 0 };
      }
      const targetDiff = Math.abs(pred.targetPrice - pred.priceAtPrediction);
      const actualDiff = Math.abs(actualPrice - pred.priceAtPrediction);
      const targetDirection = pred.targetPrice > pred.priceAtPrediction ? "up" : "down";
      const actualDir = actualPrice > pred.priceAtPrediction ? "up" : "down";

      // Exact hit (within 2%)
      if (Math.abs(actualPrice - pred.targetPrice) / pred.targetPrice < 0.02) {
        return { outcome: "correct", accuracyScore: 1 };
      }
      // Right direction, close to target
      if (targetDirection === actualDir && actualDiff >= targetDiff * 0.5) {
        return { outcome: "partially_correct", accuracyScore: 0.7 };
      }
      // Right direction but not far enough
      if (targetDirection === actualDir) {
        return { outcome: "partially_correct", accuracyScore: 0.3 };
      }
      return { outcome: "incorrect", accuracyScore: 0 };
    }

    case "buy_signal": {
      // Correct if price went up
      if (priceChangePercent > 2) return { outcome: "correct", accuracyScore: 1 };
      if (priceChangePercent > 0) return { outcome: "partially_correct", accuracyScore: 0.5 };
      return { outcome: "incorrect", accuracyScore: 0 };
    }

    case "sell_signal": {
      // Correct if price went down
      if (priceChangePercent < -2) return { outcome: "correct", accuracyScore: 1 };
      if (priceChangePercent < 0) return { outcome: "partially_correct", accuracyScore: 0.5 };
      return { outcome: "incorrect", accuracyScore: 0 };
    }

    case "hold": {
      // Correct if price stayed relatively flat
      if (Math.abs(priceChangePercent) < 3) return { outcome: "correct", accuracyScore: 1 };
      if (Math.abs(priceChangePercent) < 5) return { outcome: "partially_correct", accuracyScore: 0.5 };
      return { outcome: "incorrect", accuracyScore: 0 };
    }

    case "risk_warning": {
      // Correct if price dropped
      if (priceChangePercent < -3) return { outcome: "correct", accuracyScore: 1 };
      if (priceChangePercent < 0) return { outcome: "partially_correct", accuracyScore: 0.5 };
      return { outcome: "incorrect", accuracyScore: 0 };
    }

    default:
      return { outcome: "expired", accuracyScore: 0 };
  }
}

// ============================================================================
// Query Predictions
// ============================================================================

export function getPredictions(options?: {
  symbol?: string;
  outcome?: PredictionOutcome;
  limit?: number;
}): TrackedPrediction[] {
  const db = getDb();
  try {
    let query = "SELECT * FROM tracked_predictions WHERE account_id = 'default'";
    const params: unknown[] = [];

    if (options?.symbol) {
      query += " AND symbol = ?";
      params.push(options.symbol.toUpperCase());
    }
    if (options?.outcome) {
      query += " AND outcome = ?";
      params.push(options.outcome);
    }

    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(options?.limit ?? 100);

    const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToPrediction);
  } finally {
    db.close();
  }
}

export function getPrediction(id: string): TrackedPrediction | null {
  const db = getDb();
  try {
    const row = db
      .prepare("SELECT * FROM tracked_predictions WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToPrediction(row) : null;
  } finally {
    db.close();
  }
}

// ============================================================================
// Analytics
// ============================================================================

export function getPredictionStats(): PredictionStats {
  const db = getDb();
  try {
    const allPreds = db
      .prepare(
        "SELECT * FROM tracked_predictions WHERE account_id = 'default' ORDER BY created_at ASC"
      )
      .all() as Array<Record<string, unknown>>;

    const predictions = allPreds.map(rowToPrediction);
    const resolved = predictions.filter((p) => p.outcome !== "pending");
    const correct = resolved.filter((p) => p.outcome === "correct");
    const incorrect = resolved.filter((p) => p.outcome === "incorrect");
    const partial = resolved.filter((p) => p.outcome === "partially_correct");
    const expired = resolved.filter((p) => p.outcome === "expired");
    const pending = predictions.filter((p) => p.outcome === "pending");

    // Weighted accuracy
    const totalAccuracyScore = resolved.reduce(
      (sum, p) => sum + (p.accuracyScore ?? 0),
      0
    );
    const weightedAccuracy = resolved.length > 0 ? totalAccuracyScore / resolved.length : 0;

    // Confidence analysis
    const avgConfidenceCorrect =
      correct.length > 0
        ? correct.reduce((s, p) => s + p.confidence, 0) / correct.length
        : 0;
    const avgConfidenceIncorrect =
      incorrect.length > 0
        ? incorrect.reduce((s, p) => s + p.confidence, 0) / incorrect.length
        : 0;

    // Calibration: how well does confidence predict accuracy?
    // Perfect calibration: 80% confident predictions are right 80% of the time
    const calibrationScore = calculateCalibration(resolved);

    // By type
    const byType: Record<string, { total: number; correct: number; accuracy: number }> = {};
    for (const p of resolved) {
      if (!byType[p.predictionType]) {
        byType[p.predictionType] = { total: 0, correct: 0, accuracy: 0 };
      }
      byType[p.predictionType].total++;
      if (p.outcome === "correct") byType[p.predictionType].correct++;
    }
    for (const key of Object.keys(byType)) {
      byType[key].accuracy = byType[key].total > 0
        ? byType[key].correct / byType[key].total
        : 0;
    }

    // By tier
    const byTier: Record<string, { total: number; correct: number; accuracy: number }> = {};
    for (const p of resolved) {
      if (!byTier[p.modelTier]) {
        byTier[p.modelTier] = { total: 0, correct: 0, accuracy: 0 };
      }
      byTier[p.modelTier].total++;
      if (p.outcome === "correct") byTier[p.modelTier].correct++;
    }
    for (const key of Object.keys(byTier)) {
      byTier[key].accuracy = byTier[key].total > 0
        ? byTier[key].correct / byTier[key].total
        : 0;
    }

    // Recent accuracy (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = resolved.filter((p) => new Date(p.createdAt) >= thirtyDaysAgo);
    const recentCorrect = recent.filter((p) => p.outcome === "correct");
    const recentAccuracy = recent.length > 0 ? recentCorrect.length / recent.length : 0;

    // Streaks
    const { currentStreak, bestStreak } = calculateStreaks(resolved);

    // Live readiness
    const firstPredDate = predictions.length > 0 ? new Date(predictions[0].createdAt) : new Date();
    const daysTracking = Math.floor(
      (Date.now() - firstPredDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const winRate = resolved.length > 0 ? (correct.length / resolved.length) * 100 : 0;

    return {
      totalPredictions: predictions.length,
      resolved: resolved.length,
      pending: pending.length,
      correct: correct.length,
      incorrect: incorrect.length,
      partiallyCorrect: partial.length,
      expired: expired.length,
      accuracy: resolved.length > 0 ? correct.length / resolved.length : 0,
      weightedAccuracy,
      avgConfidenceCorrect,
      avgConfidenceIncorrect,
      calibrationScore,
      byType,
      byTier,
      recentAccuracy,
      currentStreak,
      bestStreak,
      liveReadiness: {
        meetsMinPredictions: resolved.length >= 50,
        meetsWinRate: winRate >= 55,
        meetsMinDays: daysTracking >= 30,
        daysTracking,
        ready: resolved.length >= 50 && winRate >= 55 && daysTracking >= 30,
      },
    };
  } finally {
    db.close();
  }
}

// ============================================================================
// Helpers
// ============================================================================

function calculateCalibration(resolved: TrackedPrediction[]): number {
  if (resolved.length < 10) return 0;

  // Bucket predictions by confidence ranges
  const buckets: Record<string, { total: number; correct: number }> = {
    "0.0-0.2": { total: 0, correct: 0 },
    "0.2-0.4": { total: 0, correct: 0 },
    "0.4-0.6": { total: 0, correct: 0 },
    "0.6-0.8": { total: 0, correct: 0 },
    "0.8-1.0": { total: 0, correct: 0 },
  };

  for (const p of resolved) {
    const key =
      p.confidence < 0.2 ? "0.0-0.2"
      : p.confidence < 0.4 ? "0.2-0.4"
      : p.confidence < 0.6 ? "0.4-0.6"
      : p.confidence < 0.8 ? "0.6-0.8"
      : "0.8-1.0";
    buckets[key].total++;
    if (p.outcome === "correct") buckets[key].correct++;
  }

  // Calculate Expected Calibration Error (ECE)
  let ece = 0;
  let totalWeight = 0;

  const midpoints = [0.1, 0.3, 0.5, 0.7, 0.9];
  const keys = Object.keys(buckets);

  for (let i = 0; i < keys.length; i++) {
    const bucket = buckets[keys[i]];
    if (bucket.total === 0) continue;
    const observedAccuracy = bucket.correct / bucket.total;
    const expectedAccuracy = midpoints[i];
    ece += bucket.total * Math.abs(observedAccuracy - expectedAccuracy);
    totalWeight += bucket.total;
  }

  // Return 1 - ECE as score (1.0 = perfectly calibrated)
  return totalWeight > 0 ? Math.max(0, 1 - ece / totalWeight) : 0;
}

function calculateStreaks(
  resolved: TrackedPrediction[]
): { currentStreak: number; bestStreak: number } {
  let currentStreak = 0;
  let bestStreak = 0;
  let streak = 0;

  // Sort by resolved time
  const sorted = [...resolved]
    .filter((p) => p.resolvedAt)
    .sort((a, b) => new Date(a.resolvedAt!).getTime() - new Date(b.resolvedAt!).getTime());

  for (const p of sorted) {
    if (p.outcome === "correct" || p.outcome === "partially_correct") {
      streak++;
      if (streak > bestStreak) bestStreak = streak;
    } else {
      streak = 0;
    }
  }

  currentStreak = streak;
  return { currentStreak, bestStreak };
}

function rowToPrediction(row: Record<string, unknown>): TrackedPrediction {
  return {
    id: String(row.id ?? ""),
    symbol: String(row.symbol ?? ""),
    predictionType: String(row.prediction_type ?? "direction") as PredictionType,
    prediction: String(row.prediction ?? ""),
    confidence: Number(row.confidence ?? 0),
    priceAtPrediction: Number(row.price_at_prediction ?? 0),
    targetPrice: row.target_price ? Number(row.target_price) : undefined,
    direction: row.direction
      ? (String(row.direction) as "up" | "down" | "sideways")
      : undefined,
    timeframeHours: Number(row.timeframe_hours ?? 168),
    createdAt: String(row.created_at ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    outcome: String(row.outcome ?? "pending") as PredictionOutcome,
    priceAtResolution: row.price_at_resolution ? Number(row.price_at_resolution) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    accuracyScore: row.accuracy_score !== null && row.accuracy_score !== undefined
      ? Number(row.accuracy_score)
      : undefined,
    modelTier: String(row.model_tier ?? "unknown"),
    source: String(row.source ?? "unknown"),
    recommendationId: row.recommendation_id ? String(row.recommendation_id) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}
