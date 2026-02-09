/**
 * Rule Evaluator for Gold Digger AGI.
 *
 * Evaluates active rules against current market data and portfolio state.
 * Triggered rules create order proposals through the trading executor.
 *
 * All triggered actions go through the governor + user approval flow.
 */

import {
  getRules,
  getRule,
  markRuleTriggered,
  markRuleEvaluated,
  updateRule,
  type TradingRule,
  type PriceAlertConfig,
  type DcaConfig,
  type RebalanceConfig,
  type StopLossConfig,
  type TakeProfitConfig,
  type TrailingStopConfig,
} from "./engine";
import { createOrderProposal, type CreateProposalInput } from "../trading";
import { getBroker } from "../broker";
import { getOpenPositions } from "../portfolio/manager";
import { logAuditEvent } from "../portfolio/manager";

// ============================================================================
// Types
// ============================================================================

export interface EvaluationResult {
  ruleId: string;
  ruleName: string;
  triggered: boolean;
  action?: string;
  proposalId?: string;
  message: string;
}

export interface MarketSnapshot {
  /** Current prices keyed by symbol */
  prices: Record<string, number>;
  /** Available cash */
  cash: number;
  /** Total portfolio value */
  portfolioValue: number;
}

// ============================================================================
// Main Evaluator
// ============================================================================

/**
 * Evaluate all active rules against current market data.
 * Returns results for each rule evaluated.
 */
export async function evaluateAllRules(
  snapshot?: MarketSnapshot
): Promise<EvaluationResult[]> {
  const activeRules = getRules("active");
  if (activeRules.length === 0) {
    return [];
  }

  // Build market snapshot if not provided
  const market = snapshot ?? (await buildMarketSnapshot(activeRules));
  const results: EvaluationResult[] = [];

  for (const rule of activeRules) {
    // Check expiry
    if (rule.expiresAt && new Date(rule.expiresAt) < new Date()) {
      updateRule(rule.id, { status: "expired" });
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        message: "Rule expired",
      });
      continue;
    }

    try {
      const result = await evaluateRule(rule, market);
      markRuleEvaluated(rule.id);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation failed";
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        message: `Error: ${message}`,
      });
    }
  }

  return results;
}

/**
 * Evaluate a single rule against market data.
 */
async function evaluateRule(
  rule: TradingRule,
  market: MarketSnapshot
): Promise<EvaluationResult> {
  const config = rule.config;

  switch (config.type) {
    case "price_alert":
      return evaluatePriceAlert(rule, config, market);
    case "dca":
      return evaluateDca(rule, config, market);
    case "rebalance":
      return evaluateRebalance(rule, config, market);
    case "stop_loss":
      return evaluateStopLoss(rule, config, market);
    case "take_profit":
      return evaluateTakeProfit(rule, config, market);
    case "trailing_stop":
      return evaluateTrailingStop(rule, config, market);
    default:
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        triggered: false,
        message: `Unknown rule type: ${(config as { type: string }).type}`,
      };
  }
}

// ============================================================================
// Rule Type Evaluators
// ============================================================================

async function evaluatePriceAlert(
  rule: TradingRule,
  config: PriceAlertConfig,
  market: MarketSnapshot
): Promise<EvaluationResult> {
  const symbol = rule.symbol;
  if (!symbol) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: "No symbol set" };
  }

  const currentPrice = market.prices[symbol];
  if (currentPrice === undefined) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: `No price data for ${symbol}` };
  }

  const triggered =
    config.direction === "above"
      ? currentPrice >= config.targetPrice
      : currentPrice <= config.targetPrice;

  if (!triggered) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `${symbol} at $${currentPrice.toFixed(2)}, target ${config.direction} $${config.targetPrice}`,
    };
  }

  // Triggered!
  markRuleTriggered(rule.id);

  if (config.action === "notify") {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: true,
      action: "notification",
      message: `${symbol} hit $${currentPrice.toFixed(2)} (target: ${config.direction} $${config.targetPrice})`,
    };
  }

  // Create order proposal
  const side = config.action === "propose_buy" ? "buy" : "sell";
  const quantity = config.quantity ?? 1;
  const proposal = await createOrderProposal({
    symbol,
    side,
    quantity,
    orderType: "market",
    notes: `Auto-generated by rule: ${rule.name}`,
  });

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    triggered: true,
    action: config.action,
    proposalId: proposal.proposal.id,
    message: `Price alert triggered: ${symbol} at $${currentPrice.toFixed(2)}. Created ${side} proposal for ${quantity} shares.`,
  };
}

async function evaluateDca(
  rule: TradingRule,
  config: DcaConfig,
  market: MarketSnapshot
): Promise<EvaluationResult> {
  const symbol = rule.symbol;
  if (!symbol) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: "No symbol set" };
  }

  // Check if we should execute today
  const now = new Date();
  const shouldExecute = checkDcaSchedule(config, now, rule.lastTriggeredAt);

  if (!shouldExecute) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `DCA not due yet. Last executed: ${rule.lastTriggeredAt ?? "never"}`,
    };
  }

  // Check budget
  if (config.totalBudget > 0 && config.totalSpent >= config.totalBudget) {
    updateRule(rule.id, { status: "completed" });
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `DCA budget exhausted ($${config.totalSpent}/$${config.totalBudget})`,
    };
  }

  // Check cash
  if (market.cash < config.amountPerExecution) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `Insufficient cash ($${market.cash.toFixed(2)}) for DCA amount ($${config.amountPerExecution})`,
    };
  }

  const currentPrice = market.prices[symbol];
  if (!currentPrice || currentPrice <= 0) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: `No price data for ${symbol}` };
  }

  const quantity = Math.floor(config.amountPerExecution / currentPrice);
  if (quantity < 1) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `DCA amount $${config.amountPerExecution} too small for ${symbol} at $${currentPrice.toFixed(2)}`,
    };
  }

  markRuleTriggered(rule.id);

  // Update total spent in config
  const updatedConfig: DcaConfig = {
    ...config,
    totalSpent: config.totalSpent + config.amountPerExecution,
  };
  updateRule(rule.id, { config: updatedConfig });

  const proposal = await createOrderProposal({
    symbol,
    side: "buy",
    quantity,
    orderType: "market",
    notes: `DCA buy: ${rule.name} ($${config.amountPerExecution} / execution #${rule.triggerCount + 1})`,
  });

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    triggered: true,
    action: "dca_buy",
    proposalId: proposal.proposal.id,
    message: `DCA triggered: buying ${quantity} ${symbol} at ~$${currentPrice.toFixed(2)} ($${config.amountPerExecution})`,
  };
}

async function evaluateRebalance(
  rule: TradingRule,
  config: RebalanceConfig,
  market: MarketSnapshot
): Promise<EvaluationResult> {
  const positions = getOpenPositions();
  if (positions.length === 0 && market.portfolioValue <= 0) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: "No positions to rebalance" };
  }

  // Calculate current allocation
  const totalValue = market.portfolioValue || 1;
  const currentAllocation: Record<string, number> = {};

  for (const pos of positions) {
    const price = market.prices[pos.symbol] ?? Number(pos.current_price ?? 0);
    const posValue = Number(pos.quantity) * price;
    currentAllocation[pos.symbol] = (posValue / totalValue) * 100;
  }

  // Cash allocation
  currentAllocation["CASH"] = (market.cash / totalValue) * 100;

  // Check drift
  let maxDrift = 0;
  const drifts: Record<string, number> = {};

  for (const [symbol, targetPct] of Object.entries(config.targetAllocation)) {
    const currentPct = currentAllocation[symbol] ?? 0;
    const drift = Math.abs(currentPct - targetPct);
    drifts[symbol] = drift;
    if (drift > maxDrift) maxDrift = drift;
  }

  if (maxDrift < config.driftThreshold) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `Max drift ${maxDrift.toFixed(1)}% < threshold ${config.driftThreshold}%. No rebalance needed.`,
    };
  }

  markRuleTriggered(rule.id);

  // Generate rebalance proposals (buy underweight, sell overweight)
  const proposalIds: string[] = [];
  const actions: string[] = [];

  for (const [symbol, targetPct] of Object.entries(config.targetAllocation)) {
    if (symbol === "CASH") continue;

    const currentPct = currentAllocation[symbol] ?? 0;
    const diff = targetPct - currentPct;
    const tradeValue = Math.abs((diff / 100) * totalValue);

    if (tradeValue < config.minTradeAmount) continue;

    const price = market.prices[symbol];
    if (!price || price <= 0) continue;

    const quantity = Math.floor(tradeValue / price);
    if (quantity < 1) continue;

    const side = diff > 0 ? "buy" : "sell";
    const proposal = await createOrderProposal({
      symbol,
      side,
      quantity,
      orderType: "market",
      notes: `Rebalance: ${rule.name} (${currentPct.toFixed(1)}% → ${targetPct}%)`,
    });

    proposalIds.push(proposal.proposal.id);
    actions.push(`${side} ${quantity} ${symbol}`);
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    triggered: true,
    action: "rebalance",
    proposalId: proposalIds[0], // Primary proposal
    message: `Rebalance triggered (max drift ${maxDrift.toFixed(1)}%): ${actions.join(", ") || "no trades needed"}`,
  };
}

async function evaluateStopLoss(
  rule: TradingRule,
  config: StopLossConfig,
  market: MarketSnapshot
): Promise<EvaluationResult> {
  const symbol = rule.symbol;
  if (!symbol) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: "No symbol set" };
  }

  const currentPrice = market.prices[symbol];
  if (currentPrice === undefined) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: `No price data for ${symbol}` };
  }

  // Find our position
  const positions = getOpenPositions();
  const position = positions.find((p) => p.symbol === symbol);
  if (!position) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: `No open position in ${symbol}` };
  }

  const entryPrice = Number(position.entry_price);
  const triggerPrice = config.triggerPrice ?? entryPrice * (1 - config.percentage / 100);

  if (currentPrice > triggerPrice) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `${symbol} at $${currentPrice.toFixed(2)}, stop at $${triggerPrice.toFixed(2)}`,
    };
  }

  markRuleTriggered(rule.id);

  const proposal = await createOrderProposal({
    symbol,
    side: "sell",
    quantity: Number(position.quantity),
    orderType: "market",
    notes: `Stop loss triggered: ${rule.name} (entry $${entryPrice.toFixed(2)}, stop $${triggerPrice.toFixed(2)}, current $${currentPrice.toFixed(2)})`,
  });

  // Auto-complete the rule after triggering
  updateRule(rule.id, { status: "triggered" });

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    triggered: true,
    action: "stop_loss_sell",
    proposalId: proposal.proposal.id,
    message: `Stop loss triggered: ${symbol} dropped to $${currentPrice.toFixed(2)} (stop: $${triggerPrice.toFixed(2)})`,
  };
}

async function evaluateTakeProfit(
  rule: TradingRule,
  config: TakeProfitConfig,
  market: MarketSnapshot
): Promise<EvaluationResult> {
  const symbol = rule.symbol;
  if (!symbol) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: "No symbol set" };
  }

  const currentPrice = market.prices[symbol];
  if (currentPrice === undefined) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: `No price data for ${symbol}` };
  }

  const positions = getOpenPositions();
  const position = positions.find((p) => p.symbol === symbol);
  if (!position) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: `No open position in ${symbol}` };
  }

  const entryPrice = Number(position.entry_price);
  const triggerPrice = config.triggerPrice ?? entryPrice * (1 + config.percentage / 100);

  if (currentPrice < triggerPrice) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `${symbol} at $${currentPrice.toFixed(2)}, take profit at $${triggerPrice.toFixed(2)}`,
    };
  }

  markRuleTriggered(rule.id);

  const totalQty = Number(position.quantity);
  const sellQty = Math.max(1, Math.floor(totalQty * (config.sellPercentage / 100)));

  const proposal = await createOrderProposal({
    symbol,
    side: "sell",
    quantity: sellQty,
    orderType: "market",
    notes: `Take profit triggered: ${rule.name} (entry $${entryPrice.toFixed(2)}, target $${triggerPrice.toFixed(2)}, selling ${config.sellPercentage}%)`,
  });

  if (config.sellPercentage >= 100) {
    updateRule(rule.id, { status: "triggered" });
  }

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    triggered: true,
    action: "take_profit_sell",
    proposalId: proposal.proposal.id,
    message: `Take profit triggered: ${symbol} at $${currentPrice.toFixed(2)}. Selling ${sellQty} of ${totalQty} shares.`,
  };
}

async function evaluateTrailingStop(
  rule: TradingRule,
  config: TrailingStopConfig,
  market: MarketSnapshot
): Promise<EvaluationResult> {
  const symbol = rule.symbol;
  if (!symbol) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: "No symbol set" };
  }

  const currentPrice = market.prices[symbol];
  if (currentPrice === undefined) {
    return { ruleId: rule.id, ruleName: rule.name, triggered: false, message: `No price data for ${symbol}` };
  }

  // Update high water mark if price is higher
  let { highWaterMark, currentStopPrice } = config;

  if (currentPrice > highWaterMark) {
    highWaterMark = currentPrice;
    currentStopPrice = currentPrice * (1 - config.trailPercent / 100);

    // Persist updated trail
    const updatedConfig: TrailingStopConfig = {
      ...config,
      highWaterMark,
      currentStopPrice,
    };
    updateRule(rule.id, { config: updatedConfig });
  }

  if (currentPrice > currentStopPrice) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      triggered: false,
      message: `${symbol} at $${currentPrice.toFixed(2)}, trailing stop at $${currentStopPrice.toFixed(2)} (high: $${highWaterMark.toFixed(2)})`,
    };
  }

  // Triggered!
  markRuleTriggered(rule.id);

  const positions = getOpenPositions();
  const position = positions.find((p) => p.symbol === symbol);
  const quantity = position ? Number(position.quantity) : 1;

  const proposal = await createOrderProposal({
    symbol,
    side: "sell",
    quantity,
    orderType: "market",
    notes: `Trailing stop triggered: ${rule.name} (trail ${config.trailPercent}%, high $${highWaterMark.toFixed(2)}, stop $${currentStopPrice.toFixed(2)})`,
  });

  updateRule(rule.id, { status: "triggered" });

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    triggered: true,
    action: "trailing_stop_sell",
    proposalId: proposal.proposal.id,
    message: `Trailing stop triggered: ${symbol} dropped to $${currentPrice.toFixed(2)} (stop: $${currentStopPrice.toFixed(2)})`,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function checkDcaSchedule(
  config: DcaConfig,
  now: Date,
  lastTriggered?: string
): boolean {
  if (!lastTriggered) return true; // Never run → run now

  const last = new Date(lastTriggered);
  const hoursSinceLast = (now.getTime() - last.getTime()) / (1000 * 60 * 60);

  switch (config.frequency) {
    case "daily":
      return hoursSinceLast >= 20; // ~daily with some buffer
    case "weekly":
      if (hoursSinceLast < 144) return false; // 6 days minimum
      return config.dayOfWeek === undefined || now.getDay() === config.dayOfWeek;
    case "biweekly":
      return hoursSinceLast >= 312; // ~13 days
    case "monthly":
      if (hoursSinceLast < 648) return false; // ~27 days minimum
      return config.dayOfMonth === undefined || now.getDate() === config.dayOfMonth;
    default:
      return false;
  }
}

/**
 * Build a market snapshot from the broker (if connected) and positions.
 */
async function buildMarketSnapshot(
  rules: TradingRule[]
): Promise<MarketSnapshot> {
  const snapshot: MarketSnapshot = {
    prices: {},
    cash: 0,
    portfolioValue: 0,
  };

  const broker = getBroker();
  if (!broker || !broker.isConnected()) {
    return snapshot;
  }

  try {
    const account = await broker.getAccount();
    snapshot.cash = account.buyingPower;
    snapshot.portfolioValue = account.portfolioValue;

    // Get prices from positions
    const positions = await broker.getPositions();
    for (const pos of positions) {
      snapshot.prices[pos.symbol] = pos.currentPrice;
    }

    // For rules referencing symbols we don't hold, we'd need a quote API
    // TODO: Add getBrokerQuote() for symbols not in portfolio
  } catch {
    // Return partial snapshot
  }

  return snapshot;
}
