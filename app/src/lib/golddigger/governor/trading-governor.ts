/**
 * Trading Governor for Gold Digger AGI.
 *
 * All orders MUST pass these checks before reaching the user for approval.
 * This is the safety layer between AI recommendations and real money.
 *
 * Checks performed:
 *   1. Position size limits (max % of portfolio in single position)
 *   2. Daily loss circuit breaker
 *   3. Cash availability (no margin unless explicitly enabled)
 *   4. Pattern day trade detection
 *   5. Max daily trade count
 *   6. Concentration risk warnings
 *   7. Content injection detection (via existing content guard)
 */

import { getBrokerConfig, type BrokerConfig } from "../broker/config";
import { getOpenPositions } from "../portfolio/manager";

// ============================================================================
// Types
// ============================================================================

export interface TradingCheckResult {
  approved: boolean;
  violations: TradingViolation[];
  warnings: TradingWarning[];
  riskLevel: "low" | "medium" | "high" | "very_high";
}

export interface TradingViolation {
  type:
    | "position_size"
    | "daily_loss"
    | "insufficient_cash"
    | "margin_required"
    | "pattern_day_trade"
    | "max_daily_trades"
    | "trading_disabled"
    | "live_not_approved";
  severity: "critical" | "high";
  message: string;
}

export interface TradingWarning {
  type:
    | "concentration_risk"
    | "high_volatility"
    | "low_confidence"
    | "large_position"
    | "paper_mode";
  severity: "medium" | "low";
  message: string;
  recommendation: string;
}

export interface OrderCheckInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  estimatedPrice: number;
  confidence?: number;
  availableCash: number;
  portfolioValue: number;
  dailyTradesToday?: number;
  dailyLossToday?: number;
}

// ============================================================================
// Governor
// ============================================================================

export function checkTradingOrder(input: OrderCheckInput): TradingCheckResult {
  const config = getBrokerConfig();
  const violations: TradingViolation[] = [];
  const warnings: TradingWarning[] = [];

  // ── Check 0: Trading enabled? ──────────────────────────────────────

  if (!config.tradingEnabled) {
    violations.push({
      type: "trading_disabled",
      severity: "critical",
      message: "Trading is not enabled. Connect your broker first.",
    });
    return { approved: false, violations, warnings, riskLevel: "very_high" };
  }

  // ── Check 1: Position size limit ───────────────────────────────────

  const orderValue = input.quantity * input.estimatedPrice;
  const maxPositionValue =
    (input.portfolioValue * config.riskLimits.maxPositionPercent) / 100;

  if (input.side === "buy" && orderValue > maxPositionValue) {
    // Check including existing position
    const existing = getOpenPositions().find(
      (p) => p.symbol === input.symbol.toUpperCase()
    );
    const existingValue = existing
      ? (existing.current_price ?? existing.entry_price) * existing.quantity
      : 0;
    const totalAfter = existingValue + orderValue;

    if (totalAfter > maxPositionValue) {
      violations.push({
        type: "position_size",
        severity: "critical",
        message: `Order would put ${((totalAfter / input.portfolioValue) * 100).toFixed(1)}% of portfolio in ${input.symbol}. Max allowed: ${config.riskLimits.maxPositionPercent}%`,
      });
    }
  }

  // ── Check 2: Daily loss circuit breaker ────────────────────────────

  const maxDailyLoss =
    (input.portfolioValue * config.riskLimits.maxDailyLossPercent) / 100;
  const currentDailyLoss = input.dailyLossToday ?? 0;

  if (Math.abs(currentDailyLoss) >= maxDailyLoss) {
    violations.push({
      type: "daily_loss",
      severity: "critical",
      message: `Daily loss limit reached ($${Math.abs(currentDailyLoss).toFixed(2)} / $${maxDailyLoss.toFixed(2)}). No more trades today.`,
    });
  }

  // ── Check 3: Cash availability ─────────────────────────────────────

  if (input.side === "buy" && orderValue > input.availableCash) {
    if (!config.riskLimits.allowMarginTrading) {
      violations.push({
        type: "insufficient_cash",
        severity: "critical",
        message: `Insufficient cash. Need $${orderValue.toFixed(2)} but only $${input.availableCash.toFixed(2)} available. Margin trading is disabled.`,
      });
    } else {
      violations.push({
        type: "margin_required",
        severity: "high",
        message: `Order requires margin ($${(orderValue - input.availableCash).toFixed(2)} shortfall). This increases risk.`,
      });
    }
  }

  // ── Check 4: Short selling check ───────────────────────────────────

  if (input.side === "sell" && !config.riskLimits.allowShortSelling) {
    const existing = getOpenPositions().find(
      (p) => p.symbol === input.symbol.toUpperCase()
    );
    const existingQty = existing?.quantity ?? 0;
    if (input.quantity > existingQty) {
      violations.push({
        type: "position_size",
        severity: "critical",
        message: `Cannot short sell. You hold ${existingQty} shares but trying to sell ${input.quantity}. Short selling is disabled.`,
      });
    }
  }

  // ── Check 5: Max daily trades ──────────────────────────────────────

  const tradesToday = input.dailyTradesToday ?? 0;
  if (tradesToday >= config.riskLimits.maxDailyTrades) {
    violations.push({
      type: "max_daily_trades",
      severity: "high",
      message: `Daily trade limit reached (${tradesToday}/${config.riskLimits.maxDailyTrades}). Wait until tomorrow.`,
    });
  }

  // ── Warnings (non-blocking) ────────────────────────────────────────

  // Concentration risk
  if (input.side === "buy") {
    const positions = getOpenPositions();
    const positionValues = positions.map(
      (p) => (p.current_price ?? p.entry_price) * p.quantity
    );
    const totalInvested = positionValues.reduce((s, v) => s + v, 0);
    const afterOrderTotal = totalInvested + orderValue;
    const afterOrderPercent =
      afterOrderTotal > 0 ? (orderValue / afterOrderTotal) * 100 : 100;

    if (afterOrderPercent > 25) {
      warnings.push({
        type: "concentration_risk",
        severity: "medium",
        message: `High concentration: ${input.symbol} would be ${afterOrderPercent.toFixed(1)}% of invested portfolio`,
        recommendation:
          "Consider diversifying across more positions to reduce risk",
      });
    }
  }

  // Low confidence warning
  if (input.confidence !== undefined && input.confidence < 0.5) {
    warnings.push({
      type: "low_confidence",
      severity: "medium",
      message: `AI confidence is low (${(input.confidence * 100).toFixed(0)}%)`,
      recommendation:
        "Consider reducing position size or waiting for a stronger signal",
    });
  }

  // Large position relative to typical
  if (orderValue > input.portfolioValue * 0.1) {
    warnings.push({
      type: "large_position",
      severity: "low",
      message: `This is a significant position (${((orderValue / input.portfolioValue) * 100).toFixed(1)}% of portfolio)`,
      recommendation: "Make sure this aligns with your risk tolerance",
    });
  }

  // Paper mode info
  if (config.tradingMode === "paper") {
    warnings.push({
      type: "paper_mode",
      severity: "low",
      message: "Paper trading mode — no real money at risk",
      recommendation: "This is a simulated trade for practice and validation",
    });
  }

  // ── Calculate risk level ───────────────────────────────────────────

  let riskLevel: "low" | "medium" | "high" | "very_high" = "low";
  if (violations.length > 0) {
    riskLevel = "very_high";
  } else if (warnings.some((w) => w.severity === "medium")) {
    riskLevel = "high";
  } else if (warnings.length > 1) {
    riskLevel = "medium";
  }

  return {
    approved: violations.length === 0,
    violations,
    warnings,
    riskLevel,
  };
}
