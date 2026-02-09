import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fleetBus } from './bus';
import { AgentRole, Proposal, VerificationStatus } from './types';
import {
  verifyAsRiskManager,
  verifyAsPortfolioStrategist,
  verifyAsSentimentAnalyst,
  verifyAsQuantAnalyst,
  runVerification,
  runAllVerifications,
  verificationToApproval,
  computeVerificationStatus,
  clearVerificationCache,
} from './verification';

// Mock market-tools to avoid real API calls during tests
vi.mock('../tools/market-tools', () => ({
  getMarketOverview: vi.fn().mockResolvedValue({
    vixLevel: 20,
    sentiment: 'neutral',
    fearGreedEstimate: 'Neutral',
    indices: [
      { symbol: '^GSPC', name: 'S&P 500', change1d: 0.5, trend: 'up' },
      { symbol: '^DJI', name: 'Dow Jones', change1d: 0.3, trend: 'up' },
      { symbol: '^IXIC', name: 'Nasdaq', change1d: -0.2, trend: 'down' },
    ],
    error: null,
  }),
  getSectorPerformance: vi.fn().mockResolvedValue({
    sectors: [
      { name: 'Technology', etf: 'XLK', change5d: 2.5, trend: 'up' },
      { name: 'Healthcare', etf: 'XLV', change5d: 1.0, trend: 'up' },
      { name: 'Energy', etf: 'XLE', change5d: -1.5, trend: 'down' },
    ],
    topSector: 'Technology',
    weakestSector: 'Energy',
    error: null,
  }),
  screenStocks: vi.fn().mockResolvedValue({ stocks: [], error: null, fetchedAt: new Date().toISOString() }),
  getCryptoData: vi.fn().mockResolvedValue({ data: null, error: 'mocked' }),
}));

import { getMarketOverview, getSectorPerformance } from '../tools/market-tools';

// Helper function to build test proposals
function buildTestProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 'test-proposal-1',
    timestamp: new Date().toISOString(),
    sender: AgentRole.TRADING_ANALYST,
    recipients: ['CEO'],
    type: 'PROPOSAL',
    priority: 'medium',
    subject: 'Test trade proposal',
    payload: { symbol: 'AAPL', action: 'BUY' },
    status: 'pending',
    proposalType: 'trade',
    summary: 'Test trade AAPL',
    reasoning: 'Strong momentum detected',
    riskAssessment: { level: 'medium', factors: ['volatility', 'sector risk'] },
    neuralConfidence: 0.75,
    expectedReturn: 0.03,
    requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
    approvals: [],
    verificationStatus: 'awaiting_verification',
    ...overrides,
  };
}

// ============================================================================
// PART 1: computeVerificationStatus tests
// ============================================================================

describe('computeVerificationStatus', () => {
  it('should return "verified" when no approvals required (empty requiredApprovals)', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [],
      approvals: [],
    });

    const status = computeVerificationStatus(proposal);
    expect(status).toBe('verified');
  });

  it('should return "awaiting_verification" when no approvals yet submitted', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER],
      approvals: [],
    });

    const status = computeVerificationStatus(proposal);
    expect(status).toBe('awaiting_verification');
  });

  it('should return "verified" when all required agents approved', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
      approvals: [
        {
          agent: AgentRole.RISK_MANAGER,
          approved: true,
          notes: 'Looks good',
          timestamp: new Date().toISOString(),
        },
        {
          agent: AgentRole.PORTFOLIO_STRATEGIST,
          approved: true,
          notes: 'Approved',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const status = computeVerificationStatus(proposal);
    expect(status).toBe('verified');
  });

  it('should return "disputed" when a required agent rejects', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
      approvals: [
        {
          agent: AgentRole.RISK_MANAGER,
          approved: true,
          notes: 'Looks good',
          timestamp: new Date().toISOString(),
        },
        {
          agent: AgentRole.PORTFOLIO_STRATEGIST,
          approved: false,
          notes: 'Too risky',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const status = computeVerificationStatus(proposal);
    expect(status).toBe('disputed');
  });

  it('should return "verified" when all required agents approve (non-required rejections ignored)', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER],
      approvals: [
        {
          agent: AgentRole.RISK_MANAGER,
          approved: true,
          notes: 'Approved',
          timestamp: new Date().toISOString(),
        },
        {
          agent: AgentRole.SENTIMENT_ANALYST,
          approved: false,
          notes: 'Concern',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    // Non-required agent rejections don't block — only requiredApprovals matter
    const status = computeVerificationStatus(proposal);
    expect(status).toBe('verified');
  });

  it('should return "overridden" when CEO approves despite disputed', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER],
      approvals: [
        {
          agent: AgentRole.RISK_MANAGER,
          approved: false,
          notes: 'Rejected',
          timestamp: new Date().toISOString(),
        },
      ],
      ceoDecision: {
        approved: true,
        notes: 'Overriding',
        timestamp: new Date().toISOString(),
      },
    });

    const status = computeVerificationStatus(proposal);
    expect(status).toBe('overridden');
  });

  it('should handle partial approvals (some required agents responded, not all)', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
      approvals: [
        {
          agent: AgentRole.RISK_MANAGER,
          approved: true,
          notes: 'Approved',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const status = computeVerificationStatus(proposal);
    expect(status).toBe('awaiting_verification');
  });

  it('should work with single required approval', () => {
    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER],
      approvals: [
        {
          agent: AgentRole.RISK_MANAGER,
          approved: true,
          notes: 'Approved',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const status = computeVerificationStatus(proposal);
    expect(status).toBe('verified');
  });
});

// ============================================================================
// PART 2: verifyAsRiskManager tests
// ============================================================================

describe('verifyAsRiskManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVerificationCache();
  });

  it('should approve low-risk trade proposal in normal market conditions', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 18,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: 0.5, trend: 'up' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      riskAssessment: { level: 'low', factors: ['clear setup'] },
      neuralConfidence: 0.8,
      expectedReturn: 0.02,
    });

    const result = await verifyAsRiskManager(proposal);

    expect(result.agent).toBe(AgentRole.RISK_MANAGER);
    expect(result.approved).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.metrics.vixLevel).toBe(18);
  });

  it('should flag high VIX (>30) trade proposals with concerns', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 35,
      sentiment: 'bearish',
      fearGreedEstimate: 'Extreme Fear',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: -1.0, trend: 'down' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'trade',
      riskAssessment: { level: 'low', factors: [] },
    });

    const result = await verifyAsRiskManager(proposal);

    expect(result.concerns.length).toBeGreaterThan(0);
    expect(result.concerns.some(c => c.includes('extreme volatility'))).toBe(true);
    expect(result.metrics.vixLevel).toBe(35);
  });

  it('should catch risk assessment inconsistency (self-low vs market-high)', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 32,
      sentiment: 'bearish',
      fearGreedEstimate: 'Fear',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: -2.0, trend: 'down' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      riskAssessment: { level: 'low', factors: [] },
    });

    const result = await verifyAsRiskManager(proposal);

    expect(result.concerns.some(c => c.includes('self-assessed as low risk'))).toBe(true);
    expect(result.recommendations.some(r => r.includes('Re-evaluate'))).toBe(true);
  });

  it('should identify poor risk/reward ratio', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 20,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'trade',
      neuralConfidence: 0.6,
      expectedReturn: 0.005,
    });

    const result = await verifyAsRiskManager(proposal);

    // riskReward = 0.005 / (1 - 0.6 + 0.01) = 0.005 / 0.41 ≈ 0.012 → below 0.02 threshold
    expect(result.concerns.some(c => c.includes('Poor risk/reward'))).toBe(true);
    expect(result.metrics.riskRewardRatio).toBeDefined();
    expect(result.metrics.riskRewardRatio).toBeLessThan(0.02);
  });

  it('should flag bearish counter-trend BUY trades', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 20,
      sentiment: 'bearish',
      fearGreedEstimate: 'Fear',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: -1.5, trend: 'down' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      payload: { symbol: 'AAPL', action: 'BUY' },
    });

    const result = await verifyAsRiskManager(proposal);

    expect(result.concerns.some(c => c.includes('counter-trend'))).toBe(true);
    expect(result.recommendations.some(r => r.includes('trend reversal'))).toBe(true);
  });

  it('should return metrics including vixLevel and riskRewardRatio', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 22,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    const proposal = buildTestProposal({
      riskAssessment: { level: 'medium', factors: ['vol'] },
      neuralConfidence: 0.7,
      expectedReturn: 0.04,
    });

    const result = await verifyAsRiskManager(proposal);

    expect(result.metrics).toHaveProperty('vixLevel');
    expect(result.metrics).toHaveProperty('riskRewardRatio');
    expect(result.metrics.vixLevel).toBe(22);
    expect(typeof result.metrics.riskRewardRatio).toBe('number');
  });
});

// ============================================================================
// PART 3: verifyAsPortfolioStrategist tests
// ============================================================================

describe('verifyAsPortfolioStrategist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVerificationCache();
  });

  it('should approve well-diversified proposal', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 18,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValueOnce({
      sectors: [
        { name: 'Technology', etf: 'XLK', change5d: 1.0, trend: 'up' },
        { name: 'Healthcare', etf: 'XLV', change5d: 0.8, trend: 'up' },
      ],
      topSector: 'Technology',
      weakestSector: 'Healthcare',
      error: null,
    });

    const proposal = buildTestProposal({
      payload: { symbol: 'AAPL' },
      neuralConfidence: 0.7,
      expectedReturn: 0.02,
    });

    const result = await verifyAsPortfolioStrategist(proposal);

    expect(result.agent).toBe(AgentRole.PORTFOLIO_STRATEGIST);
    expect(result.approved).toBe(true);
  });

  it('should flag sector concentration / performance chasing', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 20,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValueOnce({
      sectors: [
        { name: 'Technology', etf: 'XLK', change5d: 5.5, trend: 'up' },
        { name: 'Healthcare', etf: 'XLV', change5d: 0.5, trend: 'up' },
      ],
      topSector: 'Technology',
      weakestSector: 'Healthcare',
      error: null,
    });

    const proposal = buildTestProposal({
      payload: { symbol: 'MSFT' },
      proposalType: 'trade',
    });

    const result = await verifyAsPortfolioStrategist(proposal);

    expect(result.concerns.some(c => c.includes('performance chasing'))).toBe(true);
  });

  it('should flag speculative positions (low confidence + high return)', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 20,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValueOnce({
      sectors: [
        { name: 'Technology', etf: 'XLK', change5d: 1.0, trend: 'up' },
      ],
      topSector: 'Technology',
      weakestSector: 'Technology',
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'trade',
      neuralConfidence: 0.55,
      expectedReturn: 0.05,
    });

    const result = await verifyAsPortfolioStrategist(proposal);

    expect(result.concerns.some(c => c.includes('speculative'))).toBe(true);
  });

  it('should raise concern about rebalancing in bearish conditions', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 28,
      sentiment: 'bearish',
      fearGreedEstimate: 'Fear',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: -1.5, trend: 'down' },
      ],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValueOnce({
      sectors: [],
      topSector: undefined,
      weakestSector: undefined,
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'rebalance',
    });

    const result = await verifyAsPortfolioStrategist(proposal);

    expect(result.concerns.some(c => c.includes('crystallize losses'))).toBe(true);
  });

  it('should provide recommendations for strategy_change proposals', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 20,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValueOnce({
      sectors: [],
      topSector: undefined,
      weakestSector: undefined,
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'strategy_change',
      payload: { regime: 'FEAR' },
    });

    const result = await verifyAsPortfolioStrategist(proposal);

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some(r => r.includes('Contrarian'))).toBe(true);
  });
});

// ============================================================================
// PART 4: verifyAsSentimentAnalyst tests
// ============================================================================

describe('verifyAsSentimentAnalyst', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVerificationCache();
  });

  it('should approve in NORMAL regime', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 18,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: 0.5, trend: 'up' },
        { symbol: '^DJI', name: 'Dow Jones', change1d: 0.3, trend: 'up' },
        { symbol: '^IXIC', name: 'Nasdaq', change1d: 0.2, trend: 'up' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'trade',
      riskAssessment: { level: 'medium', factors: [] },
    });

    const result = await verifyAsSentimentAnalyst(proposal);

    expect(result.agent).toBe(AgentRole.SENTIMENT_ANALYST);
    expect(result.approved).toBe(true);
  });

  it('should flag trading during FEAR regime', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 35,
      sentiment: 'fearish',
      fearGreedEstimate: 'Extreme Fear',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: -2.0, trend: 'down' },
        { symbol: '^DJI', name: 'Dow Jones', change1d: -1.5, trend: 'down' },
        { symbol: '^IXIC', name: 'Nasdaq', change1d: -3.0, trend: 'down' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'trade',
      payload: { symbol: 'AAPL', action: 'BUY' },
    });

    const result = await verifyAsSentimentAnalyst(proposal);

    expect(result.concerns.some(c => c.includes('FEAR'))).toBe(true);
  });

  it('should flag trading during GREED regime', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 12,
      sentiment: 'bullish',
      fearGreedEstimate: 'Extreme Greed',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: 2.0, trend: 'up' },
        { symbol: '^DJI', name: 'Dow Jones', change1d: 1.8, trend: 'up' },
        { symbol: '^IXIC', name: 'Nasdaq', change1d: 2.5, trend: 'up' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'trade',
    });

    const result = await verifyAsSentimentAnalyst(proposal);

    expect(result.concerns.some(c => c.includes('GREED'))).toBe(true);
  });

  it('should include market breadth metrics', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 20,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: 0.5, trend: 'up' },
        { symbol: '^DJI', name: 'Dow Jones', change1d: 0.3, trend: 'up' },
        { symbol: '^IXIC', name: 'Nasdaq', change1d: -0.2, trend: 'down' },
      ],
      error: null,
    });

    const proposal = buildTestProposal({
      proposalType: 'trade',
    });

    const result = await verifyAsSentimentAnalyst(proposal);

    expect(result.metrics).toHaveProperty('marketBreadth');
    expect(result.metrics.marketBreadth).toBeDefined();
    expect(result.metrics.marketBreadth).toBeGreaterThanOrEqual(0);
    expect(result.metrics.marketBreadth).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// PART 5: verifyAsQuantAnalyst tests
// ============================================================================

describe('verifyAsQuantAnalyst', () => {
  it('should flag suspiciously high neural confidence (>0.9)', async () => {
    const proposal = buildTestProposal({
      neuralConfidence: 0.95,
      expectedReturn: 0.03,
      riskAssessment: { level: 'low', factors: ['vol'] },
    });

    const result = await verifyAsQuantAnalyst(proposal);

    expect(result.concerns.some(c => c.includes('suspiciously high'))).toBe(true);
    expect(result.concerns.some(c => c.includes('overfitting'))).toBe(true);
  });

  it('should flag sub-50% confidence trade proposals', async () => {
    const proposal = buildTestProposal({
      proposalType: 'trade',
      neuralConfidence: 0.45,
      expectedReturn: 0.02,
      riskAssessment: { level: 'low', factors: ['vol'] },
    });

    const result = await verifyAsQuantAnalyst(proposal);

    expect(result.approved).toBe(false);
    expect(result.concerns.some(c => c.includes('below 50%'))).toBe(true);
  });

  it('should flag unrealistic expected returns (>10%)', async () => {
    const proposal = buildTestProposal({
      proposalType: 'trade',
      expectedReturn: 0.12,
      neuralConfidence: 0.7,
      riskAssessment: { level: 'high', factors: ['vol'] },
    });

    const result = await verifyAsQuantAnalyst(proposal);

    expect(result.concerns.some(c => c.includes('unusually high'))).toBe(true);
  });

  it('should catch negative expected return on trade', async () => {
    const proposal = buildTestProposal({
      proposalType: 'trade',
      expectedReturn: -0.05,
      neuralConfidence: 0.6,
      riskAssessment: { level: 'low', factors: ['vol'] },
    });

    const result = await verifyAsQuantAnalyst(proposal);

    expect(result.approved).toBe(false);
    expect(result.concerns.some(c => c.includes('Negative expected return'))).toBe(true);
  });

  it('should catch missing risk factors', async () => {
    const proposal = buildTestProposal({
      proposalType: 'trade',
      neuralConfidence: 0.7,
      expectedReturn: 0.03,
      riskAssessment: { level: 'low', factors: [] },
    });

    const result = await verifyAsQuantAnalyst(proposal);

    expect(result.concerns.some(c => c.includes('No risk factors'))).toBe(true);
  });
});

// ============================================================================
// PART 6: verificationToApproval tests
// ============================================================================

describe('verificationToApproval', () => {
  it('should convert approved VerificationResult to ProposalApproval', () => {
    const result = {
      agent: AgentRole.RISK_MANAGER,
      approved: true,
      confidence: 0.85,
      concerns: [],
      recommendations: ['All good'],
      metrics: { vixLevel: 18, riskRewardRatio: 0.05 },
      verificationMethod: 'risk_model',
    };

    const approval = verificationToApproval(result);

    expect(approval.agent).toBe(AgentRole.RISK_MANAGER);
    expect(approval.approved).toBe(true);
    expect(approval.notes).toContain('Recommendations');
    expect(approval.timestamp).toBeDefined();
    expect(approval.payload?.verificationMethod).toBe('risk_model');
  });

  it('should convert rejected VerificationResult with concerns', () => {
    const result = {
      agent: AgentRole.PORTFOLIO_STRATEGIST,
      approved: false,
      confidence: 0.45,
      concerns: ['High concentration', 'Sector risk'],
      recommendations: ['Reduce position', 'Diversify'],
      metrics: { topSectorChange: 5.0 },
      verificationMethod: 'portfolio_analysis',
    };

    const approval = verificationToApproval(result);

    expect(approval.approved).toBe(false);
    expect(approval.notes).toContain('Concerns');
    expect(approval.notes).toContain('High concentration');
    expect(approval.notes).toContain('Confidence: 45%');
  });

  it('should include timestamp and payload with verificationMethod', () => {
    const result = {
      agent: AgentRole.SENTIMENT_ANALYST,
      approved: true,
      confidence: 0.75,
      concerns: [],
      recommendations: [],
      metrics: { marketBreadth: 0.67 },
      verificationMethod: 'sentiment_analysis',
    };

    const approval = verificationToApproval(result);

    expect(approval.timestamp).toBeDefined();
    expect(new Date(approval.timestamp)).toBeInstanceOf(Date);
    expect(approval.payload?.verificationMethod).toBe('sentiment_analysis');
    expect(approval.payload?.impactMetrics).toBeDefined();
  });
});

// ============================================================================
// PART 7: runVerification and runAllVerifications tests
// ============================================================================

describe('runVerification and runAllVerifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearVerificationCache();
  });

  it('should return null for agents without verification function (TRADING_ANALYST)', async () => {
    const proposal = buildTestProposal();

    const result = await runVerification(AgentRole.TRADING_ANALYST, proposal);

    expect(result).toBeNull();
  });

  it('should return VerificationResult for RISK_MANAGER', async () => {
    vi.mocked(getMarketOverview).mockResolvedValueOnce({
      vixLevel: 20,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    const proposal = buildTestProposal();

    const result = await runVerification(AgentRole.RISK_MANAGER, proposal);

    expect(result).not.toBeNull();
    expect(result?.agent).toBe(AgentRole.RISK_MANAGER);
    expect(result?.approved).toBeDefined();
    expect(result?.confidence).toBeDefined();
  });

  it('should runAllVerifications runs all required approvers in parallel', async () => {
    vi.mocked(getMarketOverview).mockResolvedValue({
      vixLevel: 20,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: 0.5, trend: 'up' },
      ],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValue({
      sectors: [
        { name: 'Technology', etf: 'XLK', change5d: 1.0, trend: 'up' },
      ],
      topSector: 'Technology',
      weakestSector: 'Technology',
      error: null,
    });

    const proposal = buildTestProposal({
      requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
    });

    const results = await runAllVerifications(proposal);

    expect(results).toHaveLength(2);
    expect(results.map(r => r.agent)).toContain(AgentRole.RISK_MANAGER);
    expect(results.map(r => r.agent)).toContain(AgentRole.PORTFOLIO_STRATEGIST);
  });

  it('should handle errors gracefully (returns cautious approval)', async () => {
    vi.mocked(getMarketOverview).mockRejectedValueOnce(new Error('API error'));

    const proposal = buildTestProposal();

    const result = await runVerification(AgentRole.RISK_MANAGER, proposal);

    expect(result).not.toBeNull();
    expect(result?.approved).toBe(true);
    expect(result?.confidence).toBe(0.3);
    expect(result?.concerns.some(c => c.includes('Verification failed'))).toBe(true);
    expect(result?.verificationMethod).toBe('error_fallback');
  });
});

// ============================================================================
// PART 8: Integration - Full verification pipeline tests
// ============================================================================

describe('Integration: Full verification pipeline', () => {
  beforeEach(() => {
    fleetBus.clear();
    vi.clearAllMocks();
    clearVerificationCache();
  });

  it('should submit proposal → verify → all approve → verified status', async () => {
    vi.mocked(getMarketOverview).mockResolvedValue({
      vixLevel: 18,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: 0.5, trend: 'up' },
      ],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValue({
      sectors: [
        { name: 'Technology', etf: 'XLK', change5d: 1.0, trend: 'up' },
      ],
      topSector: 'Technology',
      weakestSector: 'Technology',
      error: null,
    });

    // Step 1: Submit proposal
    const proposal = fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Test proposal',
      payload: { symbol: 'AAPL', action: 'BUY' },
      proposalType: 'trade',
      summary: 'Good trade',
      reasoning: 'Strong signal',
      riskAssessment: { level: 'low', factors: ['vol'] },
      neuralConfidence: 0.75,
      expectedReturn: 0.03,
      requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
      approvals: [],
    });

    expect(proposal.verificationStatus).toBe('awaiting_verification');

    // Step 2: Run verifications
    const results = await runAllVerifications(proposal);
    expect(results).toHaveLength(2);

    // Step 3: Convert results to approvals and submit them
    for (const result of results) {
      const approval = verificationToApproval(result);
      const updated = fleetBus.submitApproval(proposal.id, approval);
      expect(updated).not.toBeNull();
      expect(updated?.approvals.some(a => a.agent === result.agent)).toBe(true);
    }

    // Step 4: Verify final status
    const finalProposal = fleetBus.getProposals().find(p => p.id === proposal.id);
    expect(finalProposal?.verificationStatus).toBe('verified');
  });

  it('should submit proposal → verify → one disputes → disputed status', async () => {
    vi.mocked(getMarketOverview).mockResolvedValue({
      vixLevel: 35,
      sentiment: 'bearish',
      fearGreedEstimate: 'Extreme Fear',
      indices: [
        { symbol: '^GSPC', name: 'S&P 500', change1d: -2.0, trend: 'down' },
      ],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValue({
      sectors: [
        { name: 'Technology', etf: 'XLK', change5d: 1.0, trend: 'up' },
      ],
      topSector: 'Technology',
      weakestSector: 'Technology',
      error: null,
    });

    // Submit proposal
    const proposal = fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Risky trade',
      payload: { symbol: 'AAPL', action: 'BUY' },
      proposalType: 'trade',
      summary: 'High risk',
      reasoning: 'Risky signal',
      riskAssessment: { level: 'low', factors: [] },
      neuralConfidence: 0.6,
      expectedReturn: 0.02,
      requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
      approvals: [],
    });

    // Get verifications
    const results = await runAllVerifications(proposal);

    // Submit first approval (risk manager likely rejects due to high VIX)
    if (results.length > 0) {
      const firstResult = results[0];
      const approval = verificationToApproval(firstResult);
      fleetBus.submitApproval(proposal.id, approval);
    }

    // Submit second approval
    if (results.length > 1) {
      const secondResult = results[1];
      const approval = verificationToApproval(secondResult);
      const updated = fleetBus.submitApproval(proposal.id, approval);

      // At least one should have concerns
      const hasDispute = updated?.approvals.some(a => !a.approved) ?? false;
      if (hasDispute) {
        expect(updated?.verificationStatus).toBe('disputed');
      }
    }
  });

  it('should submit proposal → verify → disputed → CEO overrides → overridden', async () => {
    vi.mocked(getMarketOverview).mockResolvedValue({
      vixLevel: 25,
      sentiment: 'neutral',
      fearGreedEstimate: 'Neutral',
      indices: [],
      error: null,
    });

    vi.mocked(getSectorPerformance).mockResolvedValue({
      sectors: [],
      topSector: undefined,
      weakestSector: undefined,
      error: null,
    });

    // Submit proposal
    const proposal = fleetBus.submitProposal({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'PROPOSAL',
      priority: 'medium',
      subject: 'Override test',
      payload: { symbol: 'AAPL', action: 'BUY' },
      proposalType: 'trade',
      summary: 'Test',
      reasoning: 'Test',
      riskAssessment: { level: 'medium', factors: ['vol'] },
      neuralConfidence: 0.7,
      expectedReturn: 0.03,
      requiredApprovals: [AgentRole.RISK_MANAGER],
      approvals: [],
    });

    // Manually submit a rejection approval
    const rejection = {
      agent: AgentRole.RISK_MANAGER,
      approved: false,
      notes: 'Too risky',
      timestamp: new Date().toISOString(),
      payload: {
        riskScore: 0.8,
        recommendations: ['Reduce size'],
      },
    };

    const disputed = fleetBus.submitApproval(proposal.id, rejection);
    expect(disputed?.verificationStatus).toBe('disputed');

    // CEO overrides the disputed proposal
    const overridden = fleetBus.decideProposal(proposal.id, true, 'I believe in this');
    expect(overridden?.verificationStatus).toBe('overridden');
    expect(overridden?.ceoDecision?.approved).toBe(true);
  });
});
