/**
 * Auto-Trading Engine for Gold Digger AGI.
 *
 * Bridges fleet proposals → trading executor → broker execution.
 * Handles the full lifecycle based on user tier:
 *   - Newbie (Easy Mode): Auto-approve + auto-execute based on confidence/risk thresholds
 *   - Intermediate (Balanced): User approves → auto-execute
 *   - Expert (Full Control): User approves → user executes
 *
 * Also provides fleet auto-start when a broker connects, so agents
 * begin working immediately regardless of which page the user visits.
 */

import { fleetBus } from "../fleet/bus";
import { getOrchestrator } from "../fleet/orchestrator";
import type { Proposal } from "../fleet/types";
import {
  createOrderProposal,
  approveProposal,
  executeApprovedProposal,
  type CreateProposalInput,
  type OrderProposal,
} from "./executor";
import { getActiveBroker, getBrokerConfig } from "../broker";
import { loadConfig } from "../config/settings";
import type { UserTier } from "../tier";

// ============================================================================
// Configuration
// ============================================================================

export interface AutoTraderConfig {
  enabled: boolean;
  /** Minimum neural confidence (0-1) to auto-approve (Easy Mode) */
  minConfidenceForAutoApprove: number;
  /** Maximum risk level that can be auto-approved */
  maxRiskForAutoApprove: "low" | "medium" | "high";
  /** Maximum position size as % of portfolio for auto-trades */
  maxAutoPositionPercent: number;
  /** Maximum number of auto-trades per day */
  maxDailyAutoTrades: number;
  /** Cooldown between auto-trades in ms */
  cooldownMs: number;
}

const DEFAULT_CONFIG: AutoTraderConfig = {
  enabled: true,
  minConfidenceForAutoApprove: 0.65,
  maxRiskForAutoApprove: "medium",
  maxAutoPositionPercent: 5,
  maxDailyAutoTrades: 10,
  cooldownMs: 30_000, // 30 seconds between auto-trades
};

// ============================================================================
// State
// ============================================================================

let autoTraderRunning = false;
let dailyAutoTrades = 0;
let dailyResetDate = new Date().toDateString();
let lastAutoTradeTime = 0;
let processedProposalIds = new Set<string>();

// ============================================================================
// Core Engine
// ============================================================================

/**
 * Process a fleet proposal that has been CEO-approved (or auto-approved).
 * Converts it into a trading executor order and executes it on the broker.
 */
export async function executeFleetTradeProposal(
  proposal: Proposal
): Promise<{
  success: boolean;
  orderProposal?: OrderProposal;
  executionResult?: { success: boolean; error?: string };
  error?: string;
}> {
  // Prevent double-processing
  if (processedProposalIds.has(proposal.id)) {
    return { success: false, error: "Already processed" };
  }
  processedProposalIds.add(proposal.id);

  // Extract trade details from payload
  const payload = proposal.payload as Record<string, unknown>;
  const symbol = (payload.symbol as string) ?? extractSymbolFromSummary(proposal.summary);
  const action = ((payload.action as string) ?? "BUY").toUpperCase();
  const entryPrice = (payload.entryPrice as number) ?? 0;
  const stopLoss = payload.stopLoss as number | undefined;
  const takeProfit = payload.takeProfit as number | undefined;

  if (!symbol) {
    return { success: false, error: "No symbol found in proposal" };
  }

  // Check broker connection — use unified accessor
  const broker = getActiveBroker();
  if (!broker) {
    return { success: false, error: "Broker not connected" };
  }

  // Calculate position size (conservative for auto-trades)
  let quantity = 1;
  let livePrice = entryPrice;
  try {
    const account = await broker.getAccount();
    const targetValue = account.portfolioValue * (DEFAULT_CONFIG.maxAutoPositionPercent / 100);

    // Fetch real price if no entry price from proposal
    if (!livePrice || livePrice === 0) {
      const { getQuote } = await import("../tools/market-tools");
      const quote = await getQuote(symbol);
      if (quote.data) {
        livePrice = quote.data.price;
      }
    }

    const price = livePrice || 100;
    quantity = Math.max(1, Math.floor(targetValue / price));
  } catch {
    // Use minimum quantity on error
  }

  // Create order proposal via trading executor
  const input: CreateProposalInput = {
    symbol: symbol.toUpperCase(),
    side: action === "SELL" ? "sell" : "buy",
    quantity,
    orderType: "market",
    limitPrice: livePrice || entryPrice || undefined,
    stopLoss,
    takeProfit,
    confidence: proposal.neuralConfidence,
    recommendationId: proposal.id,
    notes: `Auto-trade from fleet proposal: ${proposal.summary}`,
    createdBy: "ai",
  };

  try {
    const { proposal: orderProposal, governorCheck } =
      await createOrderProposal(input);

    if (!governorCheck.approved) {
      return {
        success: false,
        orderProposal,
        error: `Governor rejected: ${governorCheck.violations.map((v) => v.message).join("; ")}`,
      };
    }

    // Auto-approve the order proposal
    const approved = approveProposal(orderProposal.id);

    // Auto-execute
    const executionResult = await executeApprovedProposal(approved.id);

    // Track daily count
    dailyAutoTrades++;
    lastAutoTradeTime = Date.now();

    // Notify fleet bus of execution
    fleetBus.send({
      sender: "CEO",
      recipients: [proposal.sender],
      type: "DECISION",
      priority: "medium",
      subject: executionResult.success
        ? `Trade executed: ${input.side.toUpperCase()} ${quantity} ${symbol}`
        : `Trade failed: ${executionResult.error}`,
      payload: {
        proposalId: proposal.id,
        orderProposalId: orderProposal.id,
        executionSuccess: executionResult.success,
        symbol,
        side: input.side,
        quantity,
        error: executionResult.error,
      },
    });

    return {
      success: executionResult.success,
      orderProposal: approved,
      executionResult,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}

/**
 * Check if a fleet proposal should be auto-approved (for Easy Mode / Newbie).
 * Returns true if the proposal meets confidence and risk thresholds.
 */
export function shouldAutoApprove(
  proposal: Proposal,
  _tier: UserTier
): boolean {
  // Only auto-approve trade proposals
  if (proposal.proposalType !== "trade") return false;

  // Check daily limit
  resetDailyCounterIfNeeded();
  if (dailyAutoTrades >= DEFAULT_CONFIG.maxDailyAutoTrades) return false;

  // Check cooldown
  if (Date.now() - lastAutoTradeTime < DEFAULT_CONFIG.cooldownMs) return false;

  // Check neural confidence
  const confidence = proposal.neuralConfidence ?? 0;
  if (confidence < DEFAULT_CONFIG.minConfidenceForAutoApprove) return false;

  // Check risk level
  const riskLevel = proposal.riskAssessment?.level ?? "high";
  const riskRank = { low: 0, medium: 1, high: 2 };
  const maxRiskRank = riskRank[DEFAULT_CONFIG.maxRiskForAutoApprove];
  if (riskRank[riskLevel] > maxRiskRank) return false;

  // Check verification status (prefer verified proposals)
  if (proposal.verificationStatus === "disputed") return false;

  return true;
}

/**
 * Process pending fleet proposals — called periodically by the auto-trader loop.
 * For Easy Mode users: auto-approve and execute qualifying proposals.
 */
export async function processPendingProposals(): Promise<void> {
  if (!autoTraderRunning) return;

  const config = loadConfig();
  const tier: UserTier = config.userTier ?? "newbie";

  // Only auto-execute for newbie tier
  if (tier !== "newbie") return;

  resetDailyCounterIfNeeded();

  const pending = fleetBus.getPendingProposals();

  for (const proposal of pending) {
    if (proposal.proposalType !== "trade") continue;
    if (processedProposalIds.has(proposal.id)) continue;
    if (!shouldAutoApprove(proposal, tier)) continue;

    console.log(
      `[Auto-Trader] Auto-approving trade proposal: ${proposal.summary}`
    );

    // CEO auto-approve in fleet
    fleetBus.decideProposal(proposal.id, true, "Auto-approved by Gold Digger AI (Easy Mode)");

    // Execute on broker
    const result = await executeFleetTradeProposal(proposal);

    console.log(
      `[Auto-Trader] Execution result: ${result.success ? "SUCCESS" : result.error}`
    );

    // Respect cooldown between trades
    if (result.success) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

// ============================================================================
// Auto-Trader Lifecycle
// ============================================================================

let autoTraderInterval: NodeJS.Timeout | null = null;

/**
 * Start the auto-trader loop.
 * Processes pending proposals every 60 seconds.
 */
export function startAutoTrader(): void {
  if (autoTraderRunning) return;

  autoTraderRunning = true;
  console.log("[Auto-Trader] Starting auto-trading engine");

  // Process immediately, then on interval
  processPendingProposals().catch((err) =>
    console.error("[Auto-Trader] Error:", err)
  );

  autoTraderInterval = setInterval(() => {
    processPendingProposals().catch((err) =>
      console.error("[Auto-Trader] Error:", err)
    );
  }, 60_000); // Every 60 seconds
}

/**
 * Stop the auto-trader loop.
 */
export function stopAutoTrader(): void {
  if (!autoTraderRunning) return;

  autoTraderRunning = false;
  if (autoTraderInterval) {
    clearInterval(autoTraderInterval);
    autoTraderInterval = null;
  }
  console.log("[Auto-Trader] Stopped auto-trading engine");
}

/**
 * Check if auto-trader is currently running.
 */
export function isAutoTraderRunning(): boolean {
  return autoTraderRunning;
}

/**
 * Get auto-trader statistics.
 */
export function getAutoTraderStats(): {
  running: boolean;
  dailyAutoTrades: number;
  maxDailyAutoTrades: number;
  lastAutoTradeTime: string | null;
  processedProposals: number;
  config: AutoTraderConfig;
} {
  return {
    running: autoTraderRunning,
    dailyAutoTrades,
    maxDailyAutoTrades: DEFAULT_CONFIG.maxDailyAutoTrades,
    lastAutoTradeTime: lastAutoTradeTime
      ? new Date(lastAutoTradeTime).toISOString()
      : null,
    processedProposals: processedProposalIds.size,
    config: DEFAULT_CONFIG,
  };
}

// ============================================================================
// Fleet + Broker Bootstrap
// ============================================================================

/**
 * Bootstrap the full autonomous trading pipeline.
 * Call this when a broker connects — it starts the fleet and auto-trader.
 */
export function bootstrapAutonomousTrading(): void {
  console.log("[Auto-Trader] Bootstrapping autonomous trading pipeline");

  // Start the fleet orchestrator (runs all 6 agents)
  const orchestrator = getOrchestrator();
  if (!orchestrator.isRunning()) {
    orchestrator.start();
  }

  // Start the auto-trader loop
  startAutoTrader();

  console.log("[Auto-Trader] Fleet + auto-trader active");
}

// ============================================================================
// Helpers
// ============================================================================

function resetDailyCounterIfNeeded(): void {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailyAutoTrades = 0;
    dailyResetDate = today;
    processedProposalIds.clear();
  }
}

/**
 * Extract a stock symbol from a proposal summary string.
 * e.g. "LONG AAPL at $180" → "AAPL"
 */
function extractSymbolFromSummary(summary: string): string | null {
  // Match "LONG AAPL" or "SHORT TSLA" patterns
  const longShort = summary.match(/(?:LONG|SHORT|BUY|SELL)\s+([A-Z]{1,5})/i);
  if (longShort) return longShort[1].toUpperCase();

  // Match standalone ticker-like patterns (1-5 uppercase letters)
  const ticker = summary.match(/\b([A-Z]{1,5})\b/);
  if (ticker) return ticker[1];

  return null;
}
