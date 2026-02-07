/**
 * Market research and analysis type definitions.
 * Ported from jarvis-v4/src/models/research.py
 */

import { randomUUID } from "crypto";

// ── Enums ────────────────────────────────────────────

export const TrendDirection = {
  GROWING: "growing",
  STABLE: "stable",
  DECLINING: "declining",
} as const;
export type TrendDirection =
  (typeof TrendDirection)[keyof typeof TrendDirection];

export const CompetitionLevel = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;
export type CompetitionLevel =
  (typeof CompetitionLevel)[keyof typeof CompetitionLevel];

export const OpportunityTier = {
  STRONG: "strong",
  MODERATE: "moderate",
  WEAK: "weak",
} as const;
export type OpportunityTier =
  (typeof OpportunityTier)[keyof typeof OpportunityTier];

// ── Interfaces ───────────────────────────────────────

export interface ResearchResult {
  id: string;
  niche: string;
  trends: string[];
  competitionLevel: CompetitionLevel;
  marketSizeEstimate: string;
  painPoints: string[];
  opportunityScore: number; // 0–100
  opportunityTier: OpportunityTier;
  recommendations: string[];
  revenuePotential: string;
  timestamp: string;
  additionalNotes?: string;
}

// ── Scoring Algorithm ────────────────────────────────

/**
 * Calculate opportunity score using the JARVIS scoring algorithm.
 *
 * Base: 50
 * +20 per GROWING trend, -20 per DECLINING trend
 * +15 for LOW competition, -10 for HIGH competition
 * +min(painPoints * 3, 15)
 * Clamped to 0–100.
 */
export function calculateOpportunityScore(
  trends: TrendDirection[],
  competitionLevel: CompetitionLevel,
  painPoints: string[]
): number {
  let score = 50;

  for (const trend of trends) {
    if (trend === TrendDirection.GROWING) score += 20;
    else if (trend === TrendDirection.DECLINING) score -= 20;
  }

  if (competitionLevel === CompetitionLevel.LOW) score += 15;
  else if (competitionLevel === CompetitionLevel.HIGH) score -= 10;

  score += Math.min(painPoints.length * 3, 15);

  return Math.max(0, Math.min(100, score));
}

/** Determine opportunity tier from score. */
export function getOpportunityTier(score: number): OpportunityTier {
  if (score >= 70) return OpportunityTier.STRONG;
  if (score >= 40) return OpportunityTier.MODERATE;
  return OpportunityTier.WEAK;
}

/** Factory for ResearchResult. */
export function createResearchResult(
  data: Omit<ResearchResult, "id" | "timestamp">
): ResearchResult {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...data,
  };
}
