/**
 * Automation Rules API — CRUD + evaluation.
 *
 * GET  ?action=list[&status=active]    — list rules
 * GET  ?action=rule&id=<id>            — single rule
 *
 * POST { action: "create",  ...ruleInput }   — create rule
 * POST { action: "update",  id, ...updates } — update rule
 * POST { action: "pause",   id }             — pause rule
 * POST { action: "resume",  id }             — resume (activate) rule
 * POST { action: "evaluate" }                — evaluate all active rules now
 * POST { action: "evaluate-one", id }        — evaluate single rule
 *
 * DELETE ?id=<id>                             — delete rule
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  createRule,
  getRules,
  getRule,
  updateRule,
  deleteRule,
  evaluateAllRules,
  type RuleStatus,
} from "@/lib/golddigger/rules";
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
        const status = (searchParams.get("status") ?? undefined) as RuleStatus | undefined;
        const rules = getRules(status);
        return NextResponse.json({ rules });
      }

      case "rule": {
        const id = searchParams.get("id");
        if (!id) {
          return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
        }
        const rule = getRule(id);
        if (!rule) {
          return NextResponse.json({ error: "Rule not found" }, { status: 404 });
        }
        return NextResponse.json({ rule });
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
      case "create": {
        if (!body.name || !body.type || !body.config) {
          return NextResponse.json(
            { error: "Missing required fields: name, type, config" },
            { status: 400 }
          );
        }
        const rule = createRule({
          name: body.name,
          type: body.type,
          symbol: body.symbol,
          config: body.config,
          schedule: body.schedule,
          maxTriggers: body.maxTriggers,
          expiresAt: body.expiresAt,
          notes: body.notes,
        });
        return NextResponse.json({ rule });
      }

      case "update": {
        const { id, ...updates } = body;
        if (!id) {
          return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
        }
        delete updates.action;
        const rule = updateRule(id, updates);
        if (!rule) {
          return NextResponse.json({ error: "Rule not found" }, { status: 404 });
        }
        return NextResponse.json({ rule });
      }

      case "pause": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
        }
        const rule = updateRule(id, { status: "paused" });
        return NextResponse.json({ rule });
      }

      case "resume": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
        }
        const rule = updateRule(id, { status: "active" });
        return NextResponse.json({ rule });
      }

      case "evaluate": {
        logAuditEvent("rules_evaluation_started", "system", "manual");
        const results = await evaluateAllRules();
        logAuditEvent("rules_evaluation_completed", "system", "manual", {
          totalEvaluated: results.length,
          triggered: results.filter((r) => r.triggered).length,
        });
        return NextResponse.json({
          evaluated: results.length,
          triggered: results.filter((r) => r.triggered).length,
          results,
        });
      }

      case "evaluate-one": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
        }
        // Evaluate all rules but we can't easily eval one without the snapshot builder
        // For now, evaluate all and filter
        const results = await evaluateAllRules();
        const result = results.find((r) => r.ruleId === id);
        return NextResponse.json({
          result: result ?? { ruleId: id, triggered: false, message: "Rule not found or not active" },
        });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  if (!(await checkAuth(req))) return unauthorized();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing rule id" }, { status: 400 });
  }

  const deleted = deleteRule(id);
  if (!deleted) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
