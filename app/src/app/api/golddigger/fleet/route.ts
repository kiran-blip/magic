/**
 * Gold Digger Fleet API
 *
 * GET  /api/golddigger/fleet              → Full dashboard data
 * GET  /api/golddigger/fleet?action=...   → Specific data slice
 * POST /api/golddigger/fleet              → Fleet commands
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrchestrator } from "@/lib/golddigger/fleet/orchestrator";
import { AgentRole, FleetMessage } from "@/lib/golddigger/fleet/types";
import { FLEET_AGENTS, getAllAgents } from "@/lib/golddigger/fleet/agents";
import { fleetBus } from "@/lib/golddigger/fleet/bus";
import {
  runAllVerifications,
  verificationToApproval,
} from "@/lib/golddigger/fleet/verification";
import { executeFleetTradeProposal } from "@/lib/golddigger/trading/auto-trader";

function ok(data: unknown) {
  return NextResponse.json(data);
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/** Transform agents into a flat array the frontend can consume directly */
function buildAgentsArray() {
  const orch = getOrchestrator();
  const statuses = orch.getStatus().agents;
  return getAllAgents().map((def) => {
    const s = statuses[def.role] ?? { status: "idle", lastActive: new Date().toISOString(), messagesProcessed: 0, proposalsMade: 0 };
    return {
      id: def.role,
      role: def.role,
      name: def.name,
      shortName: def.shortName,
      description: def.description,
      color: def.color,
      capabilities: def.capabilities,
      status: s.status,
      lastActive: s.lastActive,
      messagesProcessed: s.messagesProcessed,
      proposalsMade: s.proposalsMade,
    };
  });
}

/** Transform proposals to include agent names for frontend display */
function enrichProposal(p: ReturnType<ReturnType<typeof getOrchestrator>["getProposals"]>[number]) {
  const agentDef = FLEET_AGENTS[p.sender as AgentRole];
  return {
    ...p,
    senderName: agentDef?.name ?? String(p.sender),
    senderShortName: agentDef?.shortName ?? String(p.sender),
    senderColor: agentDef?.color ?? "#888",
  };
}

/** Transform log entries to include agent names */
function enrichLogEntry(m: FleetMessage) {
  const agentDef = FLEET_AGENTS[m.sender as AgentRole];
  return {
    ...m,
    senderName: agentDef?.name ?? String(m.sender),
    senderColor: agentDef?.color ?? "#888",
  };
}

// ─── GET ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const orch = getOrchestrator();
    const action = req.nextUrl.searchParams.get("action");

    if (action === "status") {
      return ok({
        running: orch.isRunning(),
        intervalMs: orch.getStatus().intervalMs,
        agents: buildAgentsArray(),
        pendingProposals: orch.getProposals({ status: "pending" }).length,
        totalMessages: orch.getLog(0).length,
        metrics: orch.getMetrics(),
      });
    }

    if (action === "proposals") {
      const filter = req.nextUrl.searchParams.get("status");
      const proposals = orch.getProposals(filter ? { status: filter } : undefined);
      return ok({ proposals: proposals.map(enrichProposal) });
    }

    if (action === "log") {
      const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 1), 500);
      return ok({ messages: orch.getLog(limit).map(enrichLogEntry) });
    }

    if (action === "agents") {
      return ok({ agents: buildAgentsArray() });
    }

    if (action === "directives") {
      return ok({ directives: orch.getDirectives() });
    }

    if (action === "metrics") {
      return ok(orch.getMetrics());
    }

    // ── Chain-of-Verification endpoints ──
    if (action === "verification") {
      const status = req.nextUrl.searchParams.get("status");
      if (status === "awaiting") {
        const proposals = fleetBus.getProposalsByVerificationStatus("awaiting_verification");
        return ok({ proposals: proposals.map(enrichProposal) });
      }
      if (status === "verified") {
        const proposals = fleetBus.getProposalsByVerificationStatus("verified");
        return ok({ proposals: proposals.map(enrichProposal) });
      }
      if (status === "disputed") {
        const proposals = fleetBus.getProposalsByVerificationStatus("disputed");
        return ok({ proposals: proposals.map(enrichProposal) });
      }
      // Default: return all proposals with verification info
      const all = orch.getProposals();
      return ok({
        proposals: all.map(enrichProposal),
        summary: {
          total: all.length,
          awaiting: all.filter(p => p.verificationStatus === "awaiting_verification").length,
          verified: all.filter(p => p.verificationStatus === "verified").length,
          disputed: all.filter(p => p.verificationStatus === "disputed").length,
          overridden: all.filter(p => p.verificationStatus === "overridden").length,
        },
      });
    }

    // ── Default: full dashboard payload ──
    const state = orch.getFleetState();
    return ok({
      running: orch.isRunning(),
      agents: buildAgentsArray(),
      pendingProposals: state.proposals.filter((p) => !p.ceoDecision).map(enrichProposal),
      allProposals: state.proposals.map(enrichProposal),
      activityLog: state.messageLog.slice(-30).map(enrichLogEntry),
      directives: state.directives,
      metrics: state.metrics,
    });
  } catch (e) {
    console.error("[Fleet API] GET error:", e);
    return err(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

// ─── POST ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return err("Invalid JSON body"); }

    const action = body.action as string | undefined;
    if (!action) return err("action field is required");

    const orch = getOrchestrator();

    switch (action) {
      case "start": {
        const intervalMs = typeof body.intervalMs === "number" ? body.intervalMs : 5000;
        orch.start(intervalMs);
        return ok({ message: "Fleet started", running: true, intervalMs });
      }
      case "stop": {
        orch.stop();
        return ok({ message: "Fleet stopped", running: false });
      }
      case "tick": {
        orch.tick();
        return ok({ message: "Tick executed" });
      }
      case "runAgent": {
        const role = body.role as string;
        if (!role) return err("role is required");
        if (!Object.values(AgentRole).includes(role as AgentRole)) return err(`Invalid role: ${role}`);
        orch.runAgent(role as AgentRole);
        return ok({ message: `Agent ${role} triggered` });
      }
      case "decide": {
        const { proposalId, approved, notes } = body as { proposalId?: string; approved?: boolean; notes?: string };
        if (!proposalId || typeof approved !== "boolean") return err("proposalId and approved are required");
        const result = orch.decideProposal(proposalId, approved, notes);
        if (!result) return err(`Proposal ${proposalId} not found`, 404);

        // If approved and it's a trade proposal, execute it on the broker
        let execution = null;
        if (approved && result.proposalType === "trade") {
          try {
            execution = await executeFleetTradeProposal(result);
            console.log(`[Fleet API] Trade execution for ${proposalId}:`, execution.success ? "SUCCESS" : execution.error);
          } catch (execError) {
            console.error(`[Fleet API] Trade execution error for ${proposalId}:`, execError);
            execution = { success: false, error: execError instanceof Error ? execError.message : "Execution failed" };
          }
        }

        return ok({
          message: approved ? "Approved" : "Rejected",
          proposal: enrichProposal(result),
          execution,
        });
      }
      case "directive": {
        const { type, value } = body as { type?: string; value?: string };
        if (!type || !value) return err("type and value are required");
        const directive = orch.addDirective(type, value);
        return ok({ message: "Directive set", directive });
      }
      case "deactivateDirective": {
        const directiveId = body.directiveId as string;
        if (!directiveId) return err("directiveId is required");
        const result = orch.deactivateDirective(directiveId);
        if (!result) return err(`Directive ${directiveId} not found`, 404);
        return ok({ message: "Directive deactivated" });
      }
      // ── Chain-of-Verification: trigger verification on a proposal ──
      case "verify": {
        const proposalId = body.proposalId as string;
        if (!proposalId) return err("proposalId is required");
        const proposals = orch.getProposals();
        const proposal = proposals.find(p => p.id === proposalId);
        if (!proposal) return err(`Proposal ${proposalId} not found`, 404);

        // Run all required verifications in parallel
        const results = await runAllVerifications(proposal);
        const approvals = results.map(verificationToApproval);

        // Submit each approval to the bus
        for (const approval of approvals) {
          fleetBus.submitApproval(proposalId, approval);
        }

        // Get the updated proposal
        const updated = proposals.find(p => p.id === proposalId);
        return ok({
          message: `Verification complete: ${results.filter(r => r.approved).length}/${results.length} approved`,
          proposal: updated ? enrichProposal(updated) : null,
          verifications: results.map(r => ({
            agent: r.agent,
            approved: r.approved,
            confidence: r.confidence,
            concerns: r.concerns,
            recommendations: r.recommendations,
            method: r.verificationMethod,
          })),
        });
      }
      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (e) {
    console.error("[Fleet API] POST error:", e);
    return err(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
