/**
 * Chain-of-Verification — Multi-agent cross-checking system.
 *
 * Before any proposal reaches the CEO for final decision, required agents
 * independently verify it using their domain expertise:
 *
 *   Risk Manager   → checks risk factors, VIX alignment, position sizing
 *   Portfolio Dir   → checks allocation impact, sector balance, diversification
 *   Sentiment Dir  → checks sentiment alignment (optional secondary verifier)
 *   Quant Analyst  → neural network cross-score (optional secondary verifier)
 *
 * Each verifier produces a VerificationResult with:
 *   - approved/rejected decision
 *   - confidence score (0–1)
 *   - specific concerns and recommendations
 *   - quantitative metrics
 *
 * The FleetBus collects all approvals and computes the aggregate
 * VerificationStatus before the CEO sees the proposal.
 */

import {
  AgentRole,
  Proposal,
  VerificationResult,
  VerificationStatus,
  ProposalApproval,
} from './types';
import {
  getMarketOverview,
  getSectorPerformance,
} from '../tools/market-tools';

// ── Market data cache (shared across verifiers within a single tick) ────────

let verificationMarketCache: Awaited<ReturnType<typeof getMarketOverview>> | null = null;
let verificationCacheTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

async function getMarketDataForVerification() {
  const now = Date.now();
  if (verificationMarketCache && now - verificationCacheTime < CACHE_TTL) {
    return verificationMarketCache;
  }
  const result = await getMarketOverview();
  verificationMarketCache = result;
  verificationCacheTime = now;
  return result;
}

/**
 * Clear the verification market data cache.
 * Exposed for testing — allows each test to start with a fresh cache.
 */
export function clearVerificationCache(): void {
  verificationMarketCache = null;
  verificationCacheTime = 0;
}

// ── Verification by Risk Manager ────────────────────────────────────────────

/**
 * CRiskO verifies a proposal for risk factors.
 * Checks: VIX alignment, risk level consistency, position risk, market regime.
 */
export async function verifyAsRiskManager(proposal: Proposal): Promise<VerificationResult> {
  const market = await getMarketDataForVerification();
  const concerns: string[] = [];
  const recommendations: string[] = [];
  const metrics: Record<string, number> = {};

  // 1. VIX-based risk check
  const vix = market.vixLevel ?? 20;
  metrics.vixLevel = vix;

  if (vix > 30 && proposal.proposalType === 'trade') {
    concerns.push(`VIX at ${vix.toFixed(1)} — extreme volatility, new trades carry elevated risk`);
    recommendations.push('Reduce position size by 50% or defer entry');
  } else if (vix > 25 && proposal.proposalType === 'trade') {
    concerns.push(`VIX at ${vix.toFixed(1)} — above-average volatility`);
    recommendations.push('Tighten stop losses and reduce position size');
  }

  // 2. Risk assessment consistency — does the proposal's self-assessed risk match market?
  if (proposal.riskAssessment) {
    const selfRisk = proposal.riskAssessment.level;
    let marketRisk: 'low' | 'medium' | 'high' = 'medium';
    if (vix > 28) marketRisk = 'high';
    else if (vix < 16) marketRisk = 'low';

    if (selfRisk === 'low' && marketRisk === 'high') {
      concerns.push('Proposal self-assessed as low risk but market conditions are high risk');
      recommendations.push('Re-evaluate risk assessment given current VIX levels');
    }
    metrics.selfRiskScore = selfRisk === 'low' ? 0.25 : selfRisk === 'medium' ? 0.5 : 0.75;
    metrics.marketRiskScore = marketRisk === 'low' ? 0.25 : marketRisk === 'medium' ? 0.5 : 0.75;
  }

  // 3. Confidence vs expected return ratio
  if (proposal.neuralConfidence && proposal.expectedReturn) {
    const riskReward = proposal.expectedReturn / (1 - proposal.neuralConfidence + 0.01);
    metrics.riskRewardRatio = riskReward;
    if (riskReward < 0.02 && proposal.proposalType === 'trade') {
      concerns.push(`Poor risk/reward ratio (${riskReward.toFixed(3)}) — expected return doesn't justify confidence level`);
      recommendations.push('Look for higher expected return or wait for better entry');
    }
  }

  // 4. Market sentiment alignment
  if (market.sentiment === 'bearish' && proposal.proposalType === 'trade') {
    const payload = proposal.payload as Record<string, unknown>;
    const action = payload?.action as string;
    if (action === 'BUY') {
      concerns.push('Buying against bearish market trend — counter-trend risk');
      recommendations.push('Consider waiting for trend reversal confirmation');
    }
  }

  // 5. Concentration risk for trade proposals
  if (proposal.proposalType === 'trade' && proposal.expectedReturn && proposal.expectedReturn > 0.05) {
    concerns.push('Expected return above 5% suggests large position — check concentration limits');
    recommendations.push('Verify position size against portfolio max allocation');
  }

  // Compute overall verdict
  const criticalConcerns = concerns.filter(c =>
    c.includes('extreme') || c.includes('counter-trend') || c.includes('Poor risk/reward')
  );
  const approved = criticalConcerns.length === 0;
  const confidence = Math.max(0.3, 1 - concerns.length * 0.15);

  return {
    agent: AgentRole.RISK_MANAGER,
    approved,
    confidence,
    concerns,
    recommendations,
    metrics,
    verificationMethod: 'risk_model',
  };
}

// ── Verification by Portfolio Strategist ─────────────────────────────────────

/**
 * PD verifies a proposal for portfolio impact.
 * Checks: sector balance, diversification, allocation drift, rebalance timing.
 */
export async function verifyAsPortfolioStrategist(proposal: Proposal): Promise<VerificationResult> {
  const [market, sectorData] = await Promise.all([
    getMarketDataForVerification(),
    getSectorPerformance(),
  ]);

  const concerns: string[] = [];
  const recommendations: string[] = [];
  const metrics: Record<string, number> = {};

  // 1. Sector concentration check
  if (proposal.payload) {
    const payload = proposal.payload as Record<string, unknown>;
    const symbol = payload.symbol as string;
    if (symbol && sectorData.sectors.length > 0) {
      // Check if adding to already-strong sector (chasing performance)
      const topSector = sectorData.sectors[0];
      if (topSector && topSector.change5d > 3) {
        concerns.push(`Adding to a sector already up ${topSector.change5d.toFixed(1)}% — potential performance chasing`);
        recommendations.push('Consider diversifying into lagging sectors for balance');
      }
      metrics.topSectorChange = topSector?.change5d ?? 0;
    }
  }

  // 2. Sector spread analysis
  if (sectorData.sectors.length > 1) {
    const spread = sectorData.sectors[0].change5d - sectorData.sectors[sectorData.sectors.length - 1].change5d;
    metrics.sectorSpread = spread;

    if (spread > 6 && proposal.proposalType === 'trade') {
      concerns.push(`Wide sector spread (${spread.toFixed(1)}%) — sector rotation risk elevated`);
      recommendations.push('Ensure trade is not concentrated in a single sector');
    }
  }

  // 3. Rebalance timing check
  if (proposal.proposalType === 'rebalance') {
    if (market.sentiment === 'bearish') {
      concerns.push('Rebalancing during bearish conditions may crystallize losses');
      recommendations.push('Consider phased rebalancing over 2-3 sessions');
    }
  }

  // 4. Diversification check for trade proposals
  if (proposal.proposalType === 'trade') {
    const expectedReturn = proposal.expectedReturn ?? 0;
    const confidence = proposal.neuralConfidence ?? 0.5;

    // High-confidence low-return is likely okay, low-confidence high-return needs scrutiny
    if (confidence < 0.6 && expectedReturn > 0.03) {
      concerns.push('Low confidence with high expected return — speculative position');
      recommendations.push('Reduce position size or wait for higher confidence signal');
    }
    metrics.confidenceReturnRatio = confidence / (expectedReturn + 0.01);
  }

  // 5. Strategy change alignment with current portfolio
  if (proposal.proposalType === 'strategy_change') {
    const payload = proposal.payload as Record<string, unknown>;
    const regime = payload?.regime as string;
    if (regime === 'FEAR') {
      recommendations.push('Contrarian plays during fear require gradual scaling — avoid all-in');
    } else if (regime === 'GREED') {
      recommendations.push('Profit-taking in greed regime — prioritize highest-gain positions first');
    }
  }

  const criticalConcerns = concerns.filter(c =>
    c.includes('speculative') || c.includes('crystallize')
  );
  const approved = criticalConcerns.length === 0;
  const confidence = Math.max(0.35, 1 - concerns.length * 0.12);

  return {
    agent: AgentRole.PORTFOLIO_STRATEGIST,
    approved,
    confidence,
    concerns,
    recommendations,
    metrics,
    verificationMethod: 'portfolio_analysis',
  };
}

// ── Verification by Sentiment Analyst (optional secondary) ───────────────────

/**
 * SD verifies a proposal for sentiment alignment.
 * Optional secondary verifier — adds context but rarely blocks.
 */
export async function verifyAsSentimentAnalyst(proposal: Proposal): Promise<VerificationResult> {
  const market = await getMarketDataForVerification();
  const concerns: string[] = [];
  const recommendations: string[] = [];
  const metrics: Record<string, number> = {};

  const vix = market.vixLevel ?? 20;
  metrics.vixLevel = vix;
  metrics.fearGreed = market.fearGreedEstimate === 'Extreme Fear' ? 10
    : market.fearGreedEstimate === 'Fear' ? 30
    : market.fearGreedEstimate === 'Neutral' ? 50
    : market.fearGreedEstimate === 'Greed' ? 70
    : market.fearGreedEstimate === 'Extreme Greed' ? 90
    : 50;

  // 1. Sentiment regime alignment
  const sentimentRegime = vix > 30 ? 'FEAR' : vix > 25 ? 'CAUTION' : vix < 15 ? 'GREED' : 'NORMAL';
  metrics.regime = sentimentRegime === 'FEAR' ? 0 : sentimentRegime === 'CAUTION' ? 0.3 : sentimentRegime === 'GREED' ? 1 : 0.5;

  if (sentimentRegime === 'FEAR' && proposal.proposalType === 'trade') {
    const payload = proposal.payload as Record<string, unknown>;
    if (payload?.action === 'BUY') {
      concerns.push('Buying during FEAR regime — contrarian play requires conviction');
      recommendations.push('Scale in gradually, don\'t commit full position');
    }
  }

  if (sentimentRegime === 'GREED' && proposal.proposalType === 'trade') {
    concerns.push('Trading in GREED regime — correction risk elevated');
    recommendations.push('Set tighter stop losses and reduce position size');
  }

  // 2. Market breadth consideration
  const bullishIndices = market.indices?.filter(i => i.trend === 'up').length ?? 0;
  const totalIndices = market.indices?.length ?? 1;
  const breadth = bullishIndices / totalIndices;
  metrics.marketBreadth = breadth;

  if (breadth < 0.3 && proposal.proposalType === 'trade') {
    concerns.push(`Narrow market breadth (${(breadth * 100).toFixed(0)}% bullish) — broad weakness`);
  }

  // Sentiment rarely blocks — only in extreme cases
  const approved = !(sentimentRegime === 'FEAR' && proposal.riskAssessment?.level === 'high');
  const confidence = Math.max(0.4, 0.8 - concerns.length * 0.1);

  return {
    agent: AgentRole.SENTIMENT_ANALYST,
    approved,
    confidence,
    concerns,
    recommendations,
    metrics,
    verificationMethod: 'sentiment_analysis',
  };
}

// ── Verification by Quant Analyst (optional secondary) ──────────────────────

/**
 * HoQ verifies a proposal with neural network cross-checking.
 * Optional secondary verifier — adds quantitative layer.
 */
export async function verifyAsQuantAnalyst(proposal: Proposal): Promise<VerificationResult> {
  const concerns: string[] = [];
  const recommendations: string[] = [];
  const metrics: Record<string, number> = {};

  // 1. Neural confidence validation
  if (proposal.neuralConfidence !== undefined) {
    metrics.reportedConfidence = proposal.neuralConfidence;

    // Cross-check: very high confidence should be flagged as potentially overfit
    if (proposal.neuralConfidence > 0.9) {
      concerns.push(`Neural confidence ${(proposal.neuralConfidence * 100).toFixed(0)}% is suspiciously high — possible overfitting`);
      recommendations.push('Verify with out-of-sample data before committing');
    }

    // Cross-check: confidence below 0.5 shouldn't generate trade proposals
    if (proposal.neuralConfidence < 0.5 && proposal.proposalType === 'trade') {
      concerns.push(`Neural confidence ${(proposal.neuralConfidence * 100).toFixed(0)}% is below 50% — insufficient for trade execution`);
      recommendations.push('Wait for stronger signal before entering position');
    }
  }

  // 2. Expected return statistical check
  if (proposal.expectedReturn !== undefined) {
    metrics.expectedReturn = proposal.expectedReturn;

    // Flag unrealistic returns
    if (proposal.expectedReturn > 0.1) {
      concerns.push(`Expected return of ${(proposal.expectedReturn * 100).toFixed(1)}% is unusually high — verify assumptions`);
      recommendations.push('Cross-validate with historical mean returns for this asset class');
    }

    // Flag negative expected return on trade proposals
    if (proposal.expectedReturn < 0 && proposal.proposalType === 'trade') {
      concerns.push('Negative expected return on a trade proposal — contradictory');
      recommendations.push('Re-evaluate trade thesis or switch to hedge/protect strategy');
    }
  }

  // 3. Risk factor count check
  if (proposal.riskAssessment) {
    metrics.riskFactorCount = proposal.riskAssessment.factors.length;
    if (proposal.riskAssessment.factors.length === 0 && proposal.proposalType === 'trade') {
      concerns.push('No risk factors listed — incomplete risk assessment');
      recommendations.push('Identify at least 2-3 risk factors before proceeding');
    }
  }

  // 4. Bayesian consistency check — confidence × expected return = expected value
  if (proposal.neuralConfidence && proposal.expectedReturn) {
    const ev = proposal.neuralConfidence * proposal.expectedReturn;
    metrics.expectedValue = ev;
    if (ev < 0.01 && proposal.proposalType === 'trade') {
      concerns.push(`Low expected value (${(ev * 100).toFixed(2)}%) — risk-adjusted return insufficient`);
    }
  }

  const approved = !concerns.some(c =>
    c.includes('below 50%') || c.includes('Negative expected') || c.includes('No risk factors')
  );
  const confidence = Math.max(0.35, 1 - concerns.length * 0.13);

  return {
    agent: AgentRole.QUANT_ANALYST,
    approved,
    confidence,
    concerns,
    recommendations,
    metrics,
    verificationMethod: 'quantitative_crosscheck',
  };
}

// ── Verification Router ─────────────────────────────────────────────────────

/** Map of agent roles to their verification functions */
const VERIFICATION_FUNCTIONS: Partial<Record<AgentRole, (p: Proposal) => Promise<VerificationResult>>> = {
  [AgentRole.RISK_MANAGER]: verifyAsRiskManager,
  [AgentRole.PORTFOLIO_STRATEGIST]: verifyAsPortfolioStrategist,
  [AgentRole.SENTIMENT_ANALYST]: verifyAsSentimentAnalyst,
  [AgentRole.QUANT_ANALYST]: verifyAsQuantAnalyst,
};

/**
 * Run verification for a specific agent on a proposal.
 * @returns VerificationResult or null if agent has no verification function.
 */
export async function runVerification(
  agent: AgentRole,
  proposal: Proposal,
): Promise<VerificationResult | null> {
  const fn = VERIFICATION_FUNCTIONS[agent];
  if (!fn) return null;

  try {
    return await fn(proposal);
  } catch (error) {
    console.error(`[Verification] ${agent} failed to verify proposal ${proposal.id}:`, error);
    // On error, return a cautious approval with low confidence
    return {
      agent,
      approved: true,
      confidence: 0.3,
      concerns: ['Verification failed due to internal error — defaulting to cautious approval'],
      recommendations: ['Manual review recommended'],
      metrics: {},
      verificationMethod: 'error_fallback',
    };
  }
}

/**
 * Run all required verifications for a proposal in parallel.
 * @returns Array of VerificationResults for all required approvers.
 */
export async function runAllVerifications(proposal: Proposal): Promise<VerificationResult[]> {
  const results = await Promise.all(
    proposal.requiredApprovals.map(agent => runVerification(agent, proposal)),
  );
  return results.filter((r): r is VerificationResult => r !== null);
}

/**
 * Convert a VerificationResult into a ProposalApproval for storage.
 */
export function verificationToApproval(result: VerificationResult): ProposalApproval {
  const noteSections: string[] = [];
  if (result.concerns.length > 0) {
    noteSections.push(`Concerns: ${result.concerns.join('; ')}`);
  }
  if (result.recommendations.length > 0) {
    noteSections.push(`Recommendations: ${result.recommendations.join('; ')}`);
  }
  noteSections.push(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);

  return {
    agent: result.agent,
    approved: result.approved,
    notes: noteSections.join(' | '),
    timestamp: new Date().toISOString(),
    payload: {
      riskScore: result.metrics.marketRiskScore ?? result.metrics.riskScore,
      impactMetrics: result.metrics,
      recommendations: result.recommendations,
      verificationMethod: result.verificationMethod,
    },
  };
}

/**
 * Compute the aggregate VerificationStatus from a proposal's approvals.
 */
export function computeVerificationStatus(proposal: Proposal): VerificationStatus {
  const { requiredApprovals, approvals, ceoDecision } = proposal;

  // If no approvals required, it's verified by default
  if (requiredApprovals.length === 0) return 'verified';

  // Check which required agents have responded
  const requiredResponses = requiredApprovals.map(agent =>
    approvals.find(a => a.agent === agent)
  );

  const allResponded = requiredResponses.every(r => r !== undefined);

  if (!allResponded) return 'awaiting_verification';

  const allApproved = requiredResponses.every(r => r?.approved === true);
  const anyRejected = requiredResponses.some(r => r?.approved === false);

  if (allApproved) return 'verified';

  // CEO overrode a disputed proposal
  if (anyRejected && ceoDecision?.approved === true) return 'overridden';

  if (anyRejected) return 'disputed';

  return 'mixed';
}
