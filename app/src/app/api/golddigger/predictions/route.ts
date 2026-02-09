/**
 * Predictions API — track, resolve, and analyze AI predictions.
 *
 * GET  ?action=list[&symbol=X&outcome=pending&limit=50] — list predictions
 * GET  ?action=stats                                     — prediction analytics
 * GET  ?action=prediction&id=<id>                        — single prediction
 *
 * POST { action: "track",   ...predictionInput }  — record a new prediction
 * POST { action: "resolve", prices: {SYM: price}} — resolve pending predictions
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  trackPrediction,
  resolvePendingPredictions,
  getPredictions,
  getPrediction,
  getPredictionStats,
  type PredictionOutcome,
} from "@/lib/golddigger/predictions";
import { logAuditEvent } from "@/lib/golddigger/portfolio/manager";

// ── Auth ─────────────────────────────────────────────────────────────

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function checkAuth(req: NextRequest): Promise<boolean> {
  const cookie = req.cookies.get("magic-token")?.value;
  if (!cookie) return false;
  try {
    await verifyToken(cookie);
    return true;
  } catch {
    return false;
  }
}

// ── GET ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "list";

  try {
    switch (action) {
      case "list": {
        const symbol = searchParams.get("symbol") ?? undefined;
        const outcome = (searchParams.get("outcome") ?? undefined) as PredictionOutcome | undefined;
        const limit = parseInt(searchParams.get("limit") ?? "100", 10);
        const predictions = getPredictions({ symbol, outcome, limit });
        return NextResponse.json({ predictions });
      }

      case "stats": {
        const stats = getPredictionStats();
        return NextResponse.json({ stats });
      }

      case "prediction": {
        const id = searchParams.get("id");
        if (!id) {
          return NextResponse.json({ error: "Missing prediction id" }, { status: 400 });
        }
        const prediction = getPrediction(id);
        if (!prediction) {
          return NextResponse.json({ error: "Prediction not found" }, { status: 404 });
        }
        return NextResponse.json({ prediction });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "track": {
        if (!body.symbol || !body.predictionType || !body.prediction || body.confidence === undefined) {
          return NextResponse.json(
            { error: "Missing required fields: symbol, predictionType, prediction, confidence" },
            { status: 400 }
          );
        }
        const prediction = trackPrediction({
          symbol: body.symbol,
          predictionType: body.predictionType,
          prediction: body.prediction,
          confidence: body.confidence,
          priceAtPrediction: body.priceAtPrediction ?? 0,
          targetPrice: body.targetPrice,
          direction: body.direction,
          timeframeHours: body.timeframeHours,
          modelTier: body.modelTier ?? "unknown",
          source: body.source ?? "manual",
          recommendationId: body.recommendationId,
          notes: body.notes,
        });
        return NextResponse.json({ prediction });
      }

      case "resolve": {
        const { prices } = body;
        if (!prices || typeof prices !== "object") {
          return NextResponse.json(
            { error: "Missing prices object: { SYMBOL: price }" },
            { status: 400 }
          );
        }
        const result = resolvePendingPredictions(prices);
        logAuditEvent("predictions_resolved", "system", "manual", {
          resolved: result.resolved,
        });
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
