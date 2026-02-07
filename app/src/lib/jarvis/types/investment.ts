/**
 * Investment analysis type definitions.
 * Ported from jarvis-v4/src/models/investment.py
 */

import { randomUUID } from "crypto";

// ── Enums ────────────────────────────────────────────

export const AssetType = {
  STOCK: "stock",
  CRYPTO: "crypto",
  ETF: "etf",
  FOREX: "forex",
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const PositionType = {
  LONG: "long",
  SHORT: "short",
} as const;
export type PositionType = (typeof PositionType)[keyof typeof PositionType];

export const RiskLevel = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  VERY_HIGH: "very_high",
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const Timeframe = {
  INTRADAY: "intraday",
  SHORT_TERM: "short_term",
  MEDIUM_TERM: "medium_term",
  LONG_TERM: "long_term",
} as const;
export type Timeframe = (typeof Timeframe)[keyof typeof Timeframe];

// ── Interfaces ───────────────────────────────────────

export interface InvestmentDecision {
  id: string;
  asset: string;
  assetType: AssetType;
  positionType: PositionType;
  action: "buy" | "sell" | "hold";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number; // 0.0 - 1.0
  riskLevel: RiskLevel;
  timeframe: Timeframe;
  reasoning: string;
  timestamp: string; // ISO 8601
  additionalNotes?: string;
}

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  marketCap?: number;
  peRatio?: number;
  high52w: number;
  low52w: number;
  sma20: number;
  sma50: number;
  trend: "uptrend" | "downtrend" | "sideways";
  volume: number;
  historicalData: Record<string, unknown>;
  timestamp: string;
}

export interface PortfolioPosition {
  id: string;
  asset: string;
  assetType: AssetType;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  positionType: PositionType;
  stopLoss?: number;
  takeProfit?: number;
  status: "open" | "closed" | "pending";
  openedAt: string;
  closedAt?: string;
  pnl?: number;
  pnlPercentage?: number;
}

// ── Factory ──────────────────────────────────────────

export function createInvestmentDecision(
  data: Omit<InvestmentDecision, "id" | "timestamp">
): InvestmentDecision {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...data,
  };
}

export function createPortfolioPosition(
  data: Omit<PortfolioPosition, "id" | "openedAt" | "status">
): PortfolioPosition {
  return {
    id: randomUUID(),
    openedAt: new Date().toISOString(),
    status: "open",
    ...data,
  };
}

/** Calculate unrealized P&L for a position. */
export function unrealizedPnl(position: PortfolioPosition): number {
  if (position.positionType === PositionType.LONG) {
    return (position.currentPrice - position.entryPrice) * position.quantity;
  }
  return (position.entryPrice - position.currentPrice) * position.quantity;
}

/** Calculate unrealized P&L percentage. */
export function unrealizedPnlPercent(position: PortfolioPosition): number {
  if (position.entryPrice === 0) return 0;
  return (
    (unrealizedPnl(position) / (position.entryPrice * position.quantity)) * 100
  );
}
