/**
 * Fleet Event Stream — Server-Sent Events (SSE) endpoint.
 *
 * GET /api/golddigger/fleet/stream
 *
 * Returns a long-lived SSE stream that pushes real-time fleet events:
 *   - message:      New fleet message
 *   - proposal:     New or updated proposal
 *   - decision:     CEO decision on proposal
 *   - verification: Agent verification approval/rejection
 *   - agent_status: Agent status change
 *   - directive:    New CEO directive
 *   - metrics:      Periodic metrics snapshot
 *   - heartbeat:    Keep-alive ping (every 15s)
 *
 * The stream subscribes to the FleetBus global event emitter and
 * automatically cleans up on client disconnect.
 */

import { NextRequest } from "next/server";
import { fleetBus } from "@/lib/golddigger/fleet/bus";
import { FLEET_AGENTS, getAllAgents } from "@/lib/golddigger/fleet/agents";
import { AgentRole, FleetEvent, FleetMessage, Proposal } from "@/lib/golddigger/fleet/types";

/** Enrich a proposal with agent display names */
function enrichProposal(p: Proposal) {
  const agentDef = FLEET_AGENTS[p.sender as AgentRole];
  return {
    ...p,
    senderName: agentDef?.name ?? String(p.sender),
    senderShortName: agentDef?.shortName ?? String(p.sender),
    senderColor: agentDef?.color ?? "#888",
  };
}

/** Enrich a message with agent display names */
function enrichMessage(m: FleetMessage) {
  const agentDef = FLEET_AGENTS[m.sender as AgentRole];
  return {
    ...m,
    senderName: agentDef?.name ?? String(m.sender),
    senderColor: agentDef?.color ?? "#888",
  };
}

/** Build agents array for initial snapshot */
function buildAgentsArray() {
  const statuses = fleetBus.getAgentStatuses();
  return getAllAgents().map((def) => {
    const s = statuses[def.role] ?? {
      status: "idle",
      lastActive: new Date().toISOString(),
      messagesProcessed: 0,
      proposalsMade: 0,
    };
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

// ─── GET ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let metricsTimer: ReturnType<typeof setInterval> | null = null;
  let alive = true;

  const stream = new ReadableStream({
    start(controller) {
      function sendSSE(event: string, data: Record<string, unknown>) {
        if (!alive) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream may have closed
          alive = false;
        }
      }

      // ── 1. Send initial snapshot so client has full state ──
      try {
        const proposals = fleetBus.getProposals();
        const pendingProposals = fleetBus.getPendingProposals();
        const messages = fleetBus.getLog(30);

        sendSSE("snapshot", {
          agents: buildAgentsArray(),
          pendingProposals: pendingProposals.map(enrichProposal),
          allProposals: proposals.map(enrichProposal),
          activityLog: messages.map(enrichMessage),
          directives: fleetBus.getAllDirectives(),
          metrics: fleetBus.getMetrics(),
        });
      } catch (err) {
        console.error("[Fleet Stream] Snapshot error:", err);
      }

      // ── 2. Subscribe to real-time events from FleetBus ──
      unsubscribe = fleetBus.onEvent((event: FleetEvent) => {
        if (!alive) return;

        switch (event.type) {
          case "message": {
            const msg = event.data.message as FleetMessage;
            sendSSE("message", { message: enrichMessage(msg) });
            break;
          }
          case "proposal": {
            const proposal = event.data.proposal as Proposal;
            sendSSE("proposal", { proposal: enrichProposal(proposal) });
            break;
          }
          case "decision": {
            const proposal = event.data.proposal as Proposal;
            sendSSE("decision", {
              proposal: enrichProposal(proposal),
              decision: event.data.decision,
            });
            break;
          }
          case "verification": {
            const proposal = event.data.proposal as Proposal;
            sendSSE("verification", {
              proposal: enrichProposal(proposal),
              approval: event.data.approval,
            });
            break;
          }
          case "agent_status": {
            sendSSE("agent_status", {
              role: event.data.role,
              status: event.data.status,
            });
            break;
          }
          case "directive": {
            sendSSE("directive", { directive: event.data.directive });
            break;
          }
          default:
            sendSSE(event.type, event.data);
        }
      });

      // ── 3. Heartbeat to keep connection alive ──
      heartbeatTimer = setInterval(() => {
        if (!alive) return;
        sendSSE("heartbeat", { t: Date.now() });
      }, 15_000);

      // ── 4. Periodic metrics push (every 10s) ──
      metricsTimer = setInterval(() => {
        if (!alive) return;
        try {
          sendSSE("metrics", {
            metrics: fleetBus.getMetrics(),
            agents: buildAgentsArray(),
          });
        } catch {
          // ignore
        }
      }, 10_000);
    },

    cancel() {
      alive = false;
      if (unsubscribe) unsubscribe();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (metricsTimer) clearInterval(metricsTimer);
      console.log("[Fleet Stream] Client disconnected, cleaned up");
    },
  });

  // Handle abort signal (client disconnect)
  req.signal.addEventListener("abort", () => {
    alive = false;
    if (unsubscribe) unsubscribe();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (metricsTimer) clearInterval(metricsTimer);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
