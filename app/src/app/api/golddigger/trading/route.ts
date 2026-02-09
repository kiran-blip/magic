/**
 * Trading API — Order proposals, approval workflow, execution.
 *
 * GET  ?action=proposals[&status=pending_approval]  — list proposals
 * GET  ?action=proposal&id=<id>                     — single proposal
 * GET  ?action=position-size&symbol=X&price=N       — sizing helper
 *
 * POST { action: "create",  ...proposalInput }      — create proposal
 * POST { action: "approve", proposalId }             — approve proposal
 * POST { action: "reject",  proposalId, reason }     — reject proposal
 * POST { action: "execute", proposalId }             — execute approved proposal
 * POST { action: "cancel",  proposalId }             — cancel pending proposal
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  createOrderProposal,
  getOrderProposals,
  getOrderProposal,
  approveProposal,
  rejectProposal,
  executeApprovedProposal,
  calculatePositionSize,
  type CreateProposalInput,
} from "@/lib/golddigger/trading";
import { getBroker } from "@/lib/golddigger/broker";
import { getPortfolioSummary } from "@/lib/golddigger/portfolio";
import { logAuditEvent } from "@/lib/golddigger/portfolio/manager";

// ── Auth helper ──────────────────────────────────────────────────────
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
  const action = searchParams.get("action") ?? "proposals";

  try {
    switch (action) {
      case "proposals": {
        const status = searchParams.get("status") ?? undefined;
        const limit = parseInt(searchParams.get("limit") ?? "50", 10);
        const proposals = getOrderProposals(status, limit);
        return NextResponse.json({ proposals });
      }

      case "proposal": {
        const id = searchParams.get("id");
        if (!id) {
          return NextResponse.json(
            { error: "Missing proposal id" },
            { status: 400 }
          );
        }
        const proposal = getOrderProposal(id);
        if (!proposal) {
          return NextResponse.json(
            { error: "Proposal not found" },
            { status: 404 }
          );
        }
        return NextResponse.json({ proposal });
      }

      case "position-size": {
        const symbol = searchParams.get("symbol");
        const priceStr = searchParams.get("price");
        if (!symbol || !priceStr) {
          return NextResponse.json(
            { error: "Missing symbol or price" },
            { status: 400 }
          );
        }
        const price = parseFloat(priceStr);
        const riskPercent = searchParams.get("risk")
          ? parseFloat(searchParams.get("risk")!)
          : undefined;

        // Get portfolio value
        let portfolioValue = 10000; // Default
        const broker = getBroker();
        if (broker && broker.isConnected()) {
          try {
            const account = await broker.getAccount();
            portfolioValue = account.portfolioValue;
          } catch {
            // Use default
          }
        }

        const sizing = calculatePositionSize(price, portfolioValue, riskPercent);
        return NextResponse.json({ symbol, price, portfolioValue, ...sizing });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
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
        const input: CreateProposalInput = {
          symbol: body.symbol,
          side: body.side,
          quantity: body.quantity,
          orderType: body.orderType,
          limitPrice: body.limitPrice,
          stopLoss: body.stopLoss,
          takeProfit: body.takeProfit,
          confidence: body.confidence,
          recommendationId: body.recommendationId,
          notes: body.notes,
          createdBy: body.createdBy ?? "user",
        };

        if (!input.symbol || !input.side || !input.quantity) {
          return NextResponse.json(
            { error: "Missing required fields: symbol, side, quantity" },
            { status: 400 }
          );
        }

        const result = await createOrderProposal(input);
        return NextResponse.json({
          proposal: result.proposal,
          governorCheck: {
            approved: result.governorCheck.approved,
            riskLevel: result.governorCheck.riskLevel,
            violations: result.governorCheck.violations,
            warnings: result.governorCheck.warnings,
          },
        });
      }

      case "approve": {
        const { proposalId } = body;
        if (!proposalId) {
          return NextResponse.json(
            { error: "Missing proposalId" },
            { status: 400 }
          );
        }
        const proposal = approveProposal(proposalId);
        return NextResponse.json({ proposal });
      }

      case "reject": {
        const { proposalId, reason } = body;
        if (!proposalId || !reason) {
          return NextResponse.json(
            { error: "Missing proposalId or reason" },
            { status: 400 }
          );
        }
        const proposal = rejectProposal(proposalId, reason);
        return NextResponse.json({ proposal });
      }

      case "execute": {
        const { proposalId } = body;
        if (!proposalId) {
          return NextResponse.json(
            { error: "Missing proposalId" },
            { status: 400 }
          );
        }
        const result = await executeApprovedProposal(proposalId);
        logAuditEvent("trade_execution_requested", "order_proposal", proposalId, {
          success: result.success,
          error: result.error,
        });
        return NextResponse.json(result);
      }

      case "cancel": {
        const { proposalId } = body;
        if (!proposalId) {
          return NextResponse.json(
            { error: "Missing proposalId" },
            { status: 400 }
          );
        }
        // Cancel = reject with standard reason
        const proposal = rejectProposal(proposalId, "Cancelled by user");
        return NextResponse.json({ proposal });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
