/**
 * Real autonomous agent behaviors for the Gold Digger fleet.
 * Each agent uses real market data tools to analyze markets and generate proposals.
 * No simulated data — all agents fetch live market data from Yahoo Finance.
 */

import { fleetBus } from './bus';
import { FLEET_AGENTS } from './agents';
import { AgentRole } from './types';
import type { Proposal, FleetMessage } from './types';
import {
  screenStocks,
  getMarketOverview,
  getSectorPerformance,
  getCryptoData,
} from '../tools/market-tools';
import {
  runVerification,
  verificationToApproval,
} from './verification';

// ── Helpers ──────────────────────────────────────────

/** Safe wrapper for agent operations — never throws, logs errors */
async function safeRun(agentRole: AgentRole, fn: () => Promise<void>): Promise<void> {
  const agentName = FLEET_AGENTS[agentRole]?.name ?? agentRole;
  try {
    fleetBus.updateAgentStatus(agentRole, { status: 'analyzing' });
    await fn();
    fleetBus.updateAgentStatus(agentRole, { status: 'idle' });
  } catch (error) {
    console.error(`[Fleet] ${agentName} error:`, error);
    fleetBus.updateAgentStatus(agentRole, { status: 'idle' });
    // Send error alert to CEO
    fleetBus.send({
      sender: agentRole,
      recipients: ['CEO'],
      type: 'ALERT',
      priority: 'medium',
      subject: `${agentName} encountered an error`,
      payload: { error: error instanceof Error ? error.message : 'Unknown error' },
    } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
  }
}

/** Create a proposal object (without id/timestamp/status — bus adds those) */
function buildProposal(
  sender: AgentRole,
  proposalType: Proposal['proposalType'],
  summary: string,
  reasoning: string,
  opts: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    confidence?: number;
    expectedReturn?: number;
    riskLevel?: 'low' | 'medium' | 'high';
    riskFactors?: string[];
    payload?: Record<string, unknown>;
  } = {}
): Omit<Proposal, 'id' | 'timestamp' | 'status'> {
  return {
    sender,
    recipients: ['CEO'],
    type: 'PROPOSAL',
    priority: opts.priority ?? 'medium',
    subject: `${FLEET_AGENTS[sender]?.shortName ?? sender} — ${proposalType} opportunity`,
    payload: opts.payload ?? {},
    proposalType,
    summary,
    reasoning,
    riskAssessment: {
      level: opts.riskLevel ?? 'medium',
      factors: opts.riskFactors ?? [],
    },
    neuralConfidence: opts.confidence ?? 0.5,
    expectedReturn: opts.expectedReturn ?? 0,
    requiredApprovals: [AgentRole.RISK_MANAGER, AgentRole.PORTFOLIO_STRATEGIST],
    approvals: [],
  };
}

// Track what each agent last analyzed to avoid repetition
const agentState = {
  lastScreenCriteria: 0,
  lastCryptoIndex: 0,
  lastSectorCheck: '',
  marketCache: null as Awaited<ReturnType<typeof getMarketOverview>> | null,
  marketCacheTime: 0,
};

const SCREEN_CRITERIA = ['growth', 'momentum', 'value', 'blue_chip', 'dividend', 'quick_wins'];
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'AVAX', 'DOGE', 'XRP', 'ADA', 'MATIC'];

/** Get market overview with 30-second caching to avoid hammering Yahoo Finance */
async function getCachedMarketOverview() {
  const now = Date.now();
  if (agentState.marketCache && now - agentState.marketCacheTime < 30_000) {
    return agentState.marketCache;
  }
  const result = await getMarketOverview();
  agentState.marketCache = result;
  agentState.marketCacheTime = now;
  return result;
}

// ── Agent Behaviors ──────────────────────────────────

/**
 * CRO — Chief Research Officer
 * Scans markets, screens stocks, identifies investment opportunities.
 * Rotates through different screening criteria each tick.
 */
export async function runResearchAnalyst(): Promise<void> {
  await safeRun(AgentRole.RESEARCH_ANALYST, async () => {
    const criteria = SCREEN_CRITERIA[agentState.lastScreenCriteria % SCREEN_CRITERIA.length];
    agentState.lastScreenCriteria++;

    console.log(`[Fleet CRO] Screening ${criteria} stocks...`);

    const [screenResult, sectorResult] = await Promise.all([
      screenStocks(criteria),
      getSectorPerformance(),
    ]);

    if (screenResult.error || screenResult.stocks.length === 0) {
      fleetBus.send({
        sender: AgentRole.RESEARCH_ANALYST,
        recipients: ['CEO'],
        type: 'INSIGHT',
        priority: 'low',
        subject: `Market scan: ${criteria} — no data available`,
        payload: { criteria, error: screenResult.error },
      } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
      return;
    }

    // Find top performers (change > 2%)
    const topStocks = screenResult.stocks.filter(s => s.change5d > 2);
    // Find oversold opportunities (change < -3%)
    const oversold = screenResult.stocks.filter(s => s.change5d < -3);

    // Send research insight
    fleetBus.send({
      sender: AgentRole.RESEARCH_ANALYST,
      recipients: ['CEO', AgentRole.TRADING_ANALYST, AgentRole.PORTFOLIO_STRATEGIST],
      type: 'INSIGHT',
      priority: topStocks.length > 3 ? 'high' : 'medium',
      subject: `${criteria.replace('_', ' ')} scan: ${screenResult.stocks.length} stocks analyzed`,
      payload: {
        criteria,
        totalStocks: screenResult.stocks.length,
        topPerformers: topStocks.map(s => ({ symbol: s.symbol, change: s.change5d, price: s.price })),
        oversold: oversold.map(s => ({ symbol: s.symbol, change: s.change5d, price: s.price })),
        topSector: sectorResult.topSector,
        weakestSector: sectorResult.weakestSector,
      },
    } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);

    // Generate proposal if strong opportunities found
    if (topStocks.length >= 2) {
      const bestStock = topStocks[0];
      fleetBus.updateAgentStatus(AgentRole.RESEARCH_ANALYST, { status: 'proposing' });

      fleetBus.submitProposal(buildProposal(
        AgentRole.RESEARCH_ANALYST,
        'research',
        `Strong ${criteria} momentum detected: ${topStocks.map(s => s.symbol).join(', ')} showing ${topStocks[0].change5d.toFixed(1)}%+ gains over 5 days`,
        `Screening ${criteria} category found ${topStocks.length} stocks with >2% 5-day gains. Top performer: ${bestStock.symbol} at $${bestStock.price} (+${bestStock.change5d.toFixed(1)}%). ${sectorResult.topSector ? `Leading sector: ${sectorResult.topSector}.` : ''} ${oversold.length > 0 ? `Also noted ${oversold.length} oversold opportunities for potential mean-reversion plays.` : ''}`,
        {
          priority: topStocks[0].change5d > 5 ? 'high' : 'medium',
          confidence: Math.min(0.5 + topStocks.length * 0.08, 0.92),
          expectedReturn: topStocks[0].change5d / 100,
          riskLevel: topStocks[0].change5d > 8 ? 'high' : 'medium',
          riskFactors: [
            'Momentum may reverse',
            `${criteria} category correlation risk`,
            ...(topStocks[0].change5d > 8 ? ['Overextended rally — potential pullback'] : []),
          ],
          payload: {
            topStocks: topStocks.slice(0, 5).map(s => ({ symbol: s.symbol, change: s.change5d, price: s.price, volume: s.volume })),
            criteria,
            screenedAt: screenResult.fetchedAt,
          },
        }
      ));
    }

    // Propose oversold opportunities as value plays
    if (oversold.length >= 2) {
      const deepestDip = oversold[oversold.length - 1]; // Most oversold
      fleetBus.submitProposal(buildProposal(
        AgentRole.RESEARCH_ANALYST,
        'research',
        `Oversold ${criteria} stocks: ${oversold.map(s => s.symbol).join(', ')} down ${Math.abs(deepestDip.change5d).toFixed(1)}%+ — potential value play`,
        `Found ${oversold.length} ${criteria} stocks with >3% 5-day declines. Most oversold: ${deepestDip.symbol} at $${deepestDip.price} (${deepestDip.change5d.toFixed(1)}%). Could be a mean-reversion opportunity if fundamentals are intact. Recommend further technical analysis before entry.`,
        {
          priority: 'medium',
          confidence: 0.55,
          expectedReturn: Math.abs(deepestDip.change5d) * 0.5 / 100,
          riskLevel: 'high',
          riskFactors: ['Falling knife risk', 'May be declining for fundamental reasons', 'Requires confirmation of support level'],
          payload: {
            oversoldStocks: oversold.map(s => ({ symbol: s.symbol, change: s.change5d, price: s.price })),
            criteria,
          },
        }
      ));
    }
  });
}

/**
 * CRiskO — Chief Risk Officer
 * Monitors market risk indicators (VIX, fear/greed), reviews pending proposals.
 */
export async function runRiskManager(): Promise<void> {
  await safeRun(AgentRole.RISK_MANAGER, async () => {
    console.log('[Fleet CRiskO] Checking market risk conditions...');

    const market = await getCachedMarketOverview();

    if (market.error) {
      fleetBus.send({
        sender: AgentRole.RISK_MANAGER,
        recipients: ['CEO'],
        type: 'ALERT',
        priority: 'high',
        subject: 'Risk: Unable to fetch market data — risk assessment degraded',
        payload: { error: market.error },
      } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
      return;
    }

    // VIX-based risk alerts
    if (market.vixLevel > 25) {
      fleetBus.send({
        sender: AgentRole.RISK_MANAGER,
        recipients: ['CEO', AgentRole.TRADING_ANALYST, AgentRole.PORTFOLIO_STRATEGIST],
        type: 'ALERT',
        priority: market.vixLevel > 30 ? 'critical' : 'high',
        subject: `RISK ALERT: VIX at ${market.vixLevel.toFixed(1)} — elevated volatility`,
        payload: {
          vixLevel: market.vixLevel,
          fearGreed: market.fearGreedEstimate,
          sentiment: market.sentiment,
          recommendation: market.vixLevel > 30
            ? 'Reduce position sizes. Consider hedging. Avoid new long entries.'
            : 'Increase caution on new positions. Tighten stop losses.',
        },
      } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
    }

    // Market sentiment warning
    if (market.sentiment === 'bearish') {
      fleetBus.send({
        sender: AgentRole.RISK_MANAGER,
        recipients: ['CEO', AgentRole.PORTFOLIO_STRATEGIST],
        type: 'ALERT',
        priority: 'high',
        subject: 'RISK: Broad market bearish — multiple indices declining',
        payload: {
          sentiment: market.sentiment,
          indices: market.indices.map(i => ({ symbol: i.symbol, change: i.change1d, trend: i.trend })),
          recommendation: 'Consider defensive positioning. Increase cash allocation.',
        },
      } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
    }

    // ── Chain-of-Verification: Review pending proposals for risk ──
    const awaitingVerification = fleetBus.getProposalsAwaitingVerification(AgentRole.RISK_MANAGER);
    if (awaitingVerification.length > 0) {
      fleetBus.updateAgentStatus(AgentRole.RISK_MANAGER, { status: 'analyzing', currentTask: 'Verifying proposals' });

      for (const proposal of awaitingVerification.slice(0, 3)) {
        const result = await runVerification(AgentRole.RISK_MANAGER, proposal);
        if (result) {
          const approval = verificationToApproval(result);
          fleetBus.submitApproval(proposal.id, approval);

          console.log(
            `[Fleet CRiskO] ${result.approved ? 'Verified' : 'Disputed'} proposal ${proposal.id} (${(result.confidence * 100).toFixed(0)}% confidence)`,
          );
        }
      }
    }

    // Also send ad-hoc risk warnings for pending proposals (regardless of verification)
    const pendingProposals = fleetBus.getPendingProposals();
    for (const proposal of pendingProposals.slice(0, 3)) {
      let riskNote = '';
      if (market.vixLevel > 25 && proposal.proposalType === 'trade') {
        riskNote = `⚠ High VIX (${market.vixLevel.toFixed(1)}) — elevated risk for new trades. `;
      }
      if (market.sentiment === 'bearish' && proposal.proposalType === 'trade') {
        riskNote += '⚠ Bearish market conditions — increased downside risk. ';
      }

      if (riskNote) {
        fleetBus.send({
          sender: AgentRole.RISK_MANAGER,
          recipients: ['CEO'],
          type: 'RESPONSE',
          priority: 'high',
          subject: `Risk review of: ${proposal.subject}`,
          payload: {
            proposalId: proposal.id,
            riskNote,
            vixLevel: market.vixLevel,
            marketSentiment: market.sentiment,
            recommendation: market.vixLevel > 30 ? 'REJECT — too risky' : 'PROCEED WITH CAUTION',
          },
          parentId: proposal.id,
        } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
      }
    }

    // Generate periodic risk report
    fleetBus.send({
      sender: AgentRole.RISK_MANAGER,
      recipients: ['CEO'],
      type: 'INSIGHT',
      priority: 'low',
      subject: `Risk status: VIX ${market.vixLevel.toFixed(1)} | Sentiment: ${market.sentiment} | Fear/Greed: ${market.fearGreedEstimate}`,
      payload: {
        vixLevel: market.vixLevel,
        sentiment: market.sentiment,
        fearGreedEstimate: market.fearGreedEstimate,
        indexSummary: market.indices.map(i => ({ symbol: i.symbol, name: i.name, change: i.change1d, trend: i.trend })),
      },
    } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
  });
}

/**
 * PD — Portfolio Director
 * Analyzes sector performance, recommends allocation adjustments and rebalancing.
 */
export async function runPortfolioStrategist(): Promise<void> {
  await safeRun(AgentRole.PORTFOLIO_STRATEGIST, async () => {
    console.log('[Fleet PD] Analyzing sector allocation...');

    const [sectorResult, market] = await Promise.all([
      getSectorPerformance(),
      getCachedMarketOverview(),
    ]);

    if (sectorResult.error || sectorResult.sectors.length === 0) {
      return; // Skip this tick silently
    }

    // Sector rotation analysis
    const strongSectors = sectorResult.sectors.filter(s => s.change5d > 1.5);
    const weakSectors = sectorResult.sectors.filter(s => s.change5d < -1.5);
    const spread = sectorResult.sectors.length > 1
      ? sectorResult.sectors[0].change5d - sectorResult.sectors[sectorResult.sectors.length - 1].change5d
      : 0;

    // Send sector insight
    fleetBus.send({
      sender: AgentRole.PORTFOLIO_STRATEGIST,
      recipients: ['CEO', AgentRole.RESEARCH_ANALYST],
      type: 'INSIGHT',
      priority: spread > 5 ? 'high' : 'medium',
      subject: `Sector review: ${sectorResult.topSector ?? 'N/A'} leads, ${sectorResult.weakestSector ?? 'N/A'} lags (spread: ${spread.toFixed(1)}%)`,
      payload: {
        topSector: sectorResult.topSector,
        weakestSector: sectorResult.weakestSector,
        spread: spread.toFixed(1),
        sectors: sectorResult.sectors.map(s => ({ name: s.name, etf: s.etf, change: s.change5d, trend: s.trend })),
      },
    } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);

    // Propose sector rotation if significant divergence
    if (spread > 4 && strongSectors.length >= 2) {
      fleetBus.updateAgentStatus(AgentRole.PORTFOLIO_STRATEGIST, { status: 'proposing' });

      fleetBus.submitProposal(buildProposal(
        AgentRole.PORTFOLIO_STRATEGIST,
        'rebalance',
        `Sector rotation opportunity: Overweight ${strongSectors.map(s => s.name).join(', ')} — underweight ${weakSectors.map(s => s.name).join(', ')}`,
        `Sector performance spread of ${spread.toFixed(1)}% detected. ${sectorResult.topSector} leading with +${strongSectors[0]?.change5d.toFixed(1)}% while ${sectorResult.weakestSector} lagging at ${weakSectors[weakSectors.length - 1]?.change5d.toFixed(1)}%. ${market.sentiment === 'bullish' ? 'Bullish market supports rotation into growth sectors.' : market.sentiment === 'bearish' ? 'Bearish market — consider defensive sector rotation.' : 'Neutral market — sector rotation may capture relative value.'}`,
        {
          priority: spread > 6 ? 'high' : 'medium',
          confidence: Math.min(0.6 + spread * 0.03, 0.88),
          expectedReturn: spread * 0.2 / 100,
          riskLevel: market.sentiment === 'bearish' ? 'high' : 'medium',
          riskFactors: ['Sector rotation may reverse', 'Correlation risk in sector ETFs', 'Market regime change possible'],
          payload: {
            strongSectors: strongSectors.map(s => ({ name: s.name, etf: s.etf, change: s.change5d })),
            weakSectors: weakSectors.map(s => ({ name: s.name, etf: s.etf, change: s.change5d })),
            spread,
          },
        }
      ));
    }

    // ── Chain-of-Verification: Review pending proposals for portfolio impact ──
    const awaitingPDVerification = fleetBus.getProposalsAwaitingVerification(AgentRole.PORTFOLIO_STRATEGIST);
    if (awaitingPDVerification.length > 0) {
      fleetBus.updateAgentStatus(AgentRole.PORTFOLIO_STRATEGIST, { status: 'analyzing', currentTask: 'Verifying proposals' });

      for (const proposal of awaitingPDVerification.slice(0, 3)) {
        const result = await runVerification(AgentRole.PORTFOLIO_STRATEGIST, proposal);
        if (result) {
          const approval = verificationToApproval(result);
          fleetBus.submitApproval(proposal.id, approval);

          console.log(
            `[Fleet PD] ${result.approved ? 'Verified' : 'Disputed'} proposal ${proposal.id} (${(result.confidence * 100).toFixed(0)}% confidence)`,
          );
        }
      }
    }

    // Check CEO directives for allocation guidance
    const directives = fleetBus.getAllDirectives().filter(d => d.active);
    const focusSectorDirective = directives.find(d => d.type === 'focus_sectors');
    if (focusSectorDirective) {
      fleetBus.send({
        sender: AgentRole.PORTFOLIO_STRATEGIST,
        recipients: ['CEO'],
        type: 'RESPONSE',
        priority: 'low',
        subject: `Following CEO directive: Focus on ${focusSectorDirective.value}`,
        payload: {
          directiveId: focusSectorDirective.id,
          directiveValue: focusSectorDirective.value,
          sectorStatus: sectorResult.sectors.find(s => s.name.toLowerCase().includes(focusSectorDirective.value.toLowerCase())) ?? 'Not found in current scan',
        },
      } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
    }
  });
}

/**
 * HoT — Head of Trading
 * Scans for momentum and quick-win stocks, generates specific trade proposals.
 */
export async function runTradingAnalyst(): Promise<void> {
  await safeRun(AgentRole.TRADING_ANALYST, async () => {
    console.log('[Fleet HoT] Scanning for trade setups...');

    const [momentumResult, market] = await Promise.all([
      screenStocks('momentum'),
      getCachedMarketOverview(),
    ]);

    if (momentumResult.error || momentumResult.stocks.length === 0) {
      return;
    }

    // Check directives for trading style
    const directives = fleetBus.getAllDirectives().filter(d => d.active);
    const tradingStyleDirective = directives.find(d => d.type === 'trading_style');
    const riskToleranceDirective = directives.find(d => d.type === 'risk_tolerance');
    const isConservative = riskToleranceDirective?.value?.toLowerCase().includes('low') || riskToleranceDirective?.value?.toLowerCase().includes('conservative');

    // Find strong momentum signals
    const strongMomentum = momentumResult.stocks.filter(s => s.change5d > 3 && s.trend === 'up');

    // Skip new trades in very high VIX or if conservative
    if (market.vixLevel > 30 && isConservative) {
      fleetBus.send({
        sender: AgentRole.TRADING_ANALYST,
        recipients: ['CEO'],
        type: 'INSIGHT',
        priority: 'medium',
        subject: 'Trading desk: Holding off — VIX too high for conservative risk tolerance',
        payload: { vixLevel: market.vixLevel, riskTolerance: riskToleranceDirective?.value },
      } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
      return;
    }

    // Generate trade proposals for strong momentum
    for (const stock of strongMomentum.slice(0, 2)) {
      fleetBus.updateAgentStatus(AgentRole.TRADING_ANALYST, { status: 'proposing' });

      const entryPrice = stock.price;
      const stopLoss = +(entryPrice * 0.95).toFixed(2); // 5% stop
      const takeProfit = +(entryPrice * (1 + stock.change5d / 100 * 0.8)).toFixed(2); // Target 80% of recent move

      fleetBus.submitProposal(buildProposal(
        AgentRole.TRADING_ANALYST,
        'trade',
        `LONG ${stock.symbol} at $${entryPrice} — Momentum +${stock.change5d.toFixed(1)}% over 5d | SL: $${stopLoss} | TP: $${takeProfit}`,
        `${stock.symbol} showing strong upward momentum (+${stock.change5d.toFixed(1)}% in 5 days) with volume of ${stock.volume.toLocaleString()}. ${market.sentiment === 'bullish' ? 'Bullish market supports momentum trades.' : market.sentiment === 'bearish' ? 'Caution: Trading against bearish market trend.' : 'Neutral market — trade on individual stock merit.'} Stop loss set at $${stopLoss} (-5%), take profit at $${takeProfit}.`,
        {
          priority: stock.change5d > 6 ? 'high' : 'medium',
          confidence: Math.min(0.55 + stock.change5d * 0.04, 0.90),
          expectedReturn: stock.change5d * 0.5 / 100,
          riskLevel: stock.change5d > 8 ? 'high' : market.vixLevel > 20 ? 'high' : 'medium',
          riskFactors: [
            `Momentum reversal risk`,
            `VIX at ${market.vixLevel.toFixed(1)}`,
            stock.change5d > 8 ? 'Overextended — pullback likely' : 'Normal momentum range',
            market.sentiment === 'bearish' ? 'Against market trend' : 'Aligned with market',
          ],
          payload: {
            symbol: stock.symbol,
            action: 'BUY',
            entryPrice,
            stopLoss,
            takeProfit,
            volume: stock.volume,
            change5d: stock.change5d,
            tradingStyle: tradingStyleDirective?.value ?? 'default',
          },
        }
      ));
    }

    // Send general trading desk update
    fleetBus.send({
      sender: AgentRole.TRADING_ANALYST,
      recipients: ['CEO'],
      type: 'INSIGHT',
      priority: 'low',
      subject: `Trading desk: ${strongMomentum.length} momentum signals, ${momentumResult.stocks.filter(s => s.trend === 'up').length}/${momentumResult.stocks.length} trending up`,
      payload: {
        momentumStocks: momentumResult.stocks.slice(0, 5).map(s => ({
          symbol: s.symbol,
          price: s.price,
          change5d: s.change5d,
          trend: s.trend,
        })),
        marketSentiment: market.sentiment,
        vixLevel: market.vixLevel,
      },
    } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
  });
}

/**
 * SD — Sentiment Director
 * Monitors market sentiment, VIX, fear/greed, and crypto sentiment.
 */
export async function runSentimentAnalyst(): Promise<void> {
  await safeRun(AgentRole.SENTIMENT_ANALYST, async () => {
    console.log('[Fleet SD] Analyzing market sentiment...');

    const market = await getCachedMarketOverview();

    if (market.error) {
      return;
    }

    // Check crypto sentiment too (rotate through symbols)
    const cryptoSymbol = CRYPTO_SYMBOLS[agentState.lastCryptoIndex % CRYPTO_SYMBOLS.length];
    agentState.lastCryptoIndex++;

    let cryptoInsight = '';
    try {
      const crypto = await getCryptoData(cryptoSymbol);
      if (crypto.data) {
        cryptoInsight = `${crypto.data.symbol}: $${crypto.data.price} (24h: ${crypto.data.change24h > 0 ? '+' : ''}${crypto.data.change24h.toFixed(1)}%, 7d: ${crypto.data.change7d > 0 ? '+' : ''}${crypto.data.change7d.toFixed(1)}%)`;
      }
    } catch {
      // Crypto data unavailable — skip
    }

    // Determine sentiment regime
    let sentimentRegime = 'NORMAL';
    if (market.vixLevel > 30) sentimentRegime = 'FEAR';
    else if (market.vixLevel > 25) sentimentRegime = 'CAUTION';
    else if (market.vixLevel < 15 && market.sentiment === 'bullish') sentimentRegime = 'GREED';
    else if (market.sentiment === 'bullish') sentimentRegime = 'OPTIMISTIC';
    else if (market.sentiment === 'bearish') sentimentRegime = 'PESSIMISTIC';

    // Send sentiment update
    fleetBus.send({
      sender: AgentRole.SENTIMENT_ANALYST,
      recipients: ['CEO', AgentRole.RISK_MANAGER, AgentRole.TRADING_ANALYST],
      type: 'INSIGHT',
      priority: sentimentRegime === 'FEAR' || sentimentRegime === 'GREED' ? 'high' : 'medium',
      subject: `Sentiment: ${sentimentRegime} | VIX: ${market.vixLevel.toFixed(1)} | ${market.fearGreedEstimate}${cryptoInsight ? ` | ${cryptoInsight}` : ''}`,
      payload: {
        regime: sentimentRegime,
        vixLevel: market.vixLevel,
        fearGreedEstimate: market.fearGreedEstimate,
        marketSentiment: market.sentiment,
        indices: market.indices.map(i => ({ symbol: i.symbol, change: i.change1d, trend: i.trend })),
        crypto: cryptoInsight || null,
      },
    } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);

    // Generate contrarian proposal at extremes
    if (sentimentRegime === 'FEAR') {
      fleetBus.updateAgentStatus(AgentRole.SENTIMENT_ANALYST, { status: 'proposing' });
      fleetBus.submitProposal(buildProposal(
        AgentRole.SENTIMENT_ANALYST,
        'strategy_change',
        `Extreme fear detected (VIX: ${market.vixLevel.toFixed(1)}) — contrarian buy signal`,
        `Market is in FEAR regime with VIX at ${market.vixLevel.toFixed(1)} and ${market.fearGreedEstimate} sentiment. Historically, extreme fear creates buying opportunities. Consider gradually scaling into quality positions. This is a contrarian signal — requires strong conviction and risk management.`,
        {
          priority: 'high',
          confidence: 0.62,
          expectedReturn: 0.05,
          riskLevel: 'high',
          riskFactors: ['Fear may intensify', 'Catching falling knife risk', 'Systemic risk if black swan event'],
          payload: { vixLevel: market.vixLevel, regime: sentimentRegime },
        }
      ));
    } else if (sentimentRegime === 'GREED') {
      fleetBus.updateAgentStatus(AgentRole.SENTIMENT_ANALYST, { status: 'proposing' });
      fleetBus.submitProposal(buildProposal(
        AgentRole.SENTIMENT_ANALYST,
        'strategy_change',
        `Extreme greed detected (VIX: ${market.vixLevel.toFixed(1)}) — consider taking profits`,
        `Market is in GREED regime with very low VIX (${market.vixLevel.toFixed(1)}) and bullish sentiment. Extreme greed often precedes corrections. Consider trimming positions, tightening stop losses, or increasing cash allocation as a hedge.`,
        {
          priority: 'high',
          confidence: 0.58,
          expectedReturn: -0.02,
          riskLevel: 'medium',
          riskFactors: ['Bull run may continue', 'FOMO risk from early exit', 'Market timing is difficult'],
          payload: { vixLevel: market.vixLevel, regime: sentimentRegime },
        }
      ));
    }
  });
}

/**
 * HoQ — Head of Quantitative
 * Runs neural network models on market data for quantitative scoring.
 * Uses TradeScorer, PositionSizer, and RiskAssessor.
 */
export async function runQuantAnalyst(): Promise<void> {
  await safeRun(AgentRole.QUANT_ANALYST, async () => {
    console.log('[Fleet HoQ] Running quantitative models...');

    const [market, sectorResult] = await Promise.all([
      getCachedMarketOverview(),
      getSectorPerformance(),
    ]);

    if (market.error) {
      return;
    }

    // Import neural models dynamically to avoid circular deps
    let TradeScorer: any, RiskAssessor: any;
    try {
      const neural = await import('./neural');
      TradeScorer = neural.TradeScorer;
      RiskAssessor = neural.RiskAssessor;
    } catch {
      fleetBus.send({
        sender: AgentRole.QUANT_ANALYST,
        recipients: ['CEO'],
        type: 'ALERT',
        priority: 'low',
        subject: 'Quant models unavailable — running basic analysis only',
        payload: {},
      } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);
      return;
    }

    // Screen growth stocks for neural scoring
    const screenResult = await screenStocks('growth');
    if (screenResult.stocks.length === 0) {
      return;
    }

    // Score each stock with TradeScorer neural network
    const scorer = new TradeScorer();
    const scored: Array<{ symbol: string; price: number; change: number; score: number; signal: string }> = [];

    for (const stock of screenResult.stocks.slice(0, 6)) {
      try {
        // TradeScorer inputs: [price_normalized, volume_normalized, change_5d, vix_normalized, sentiment_score, sector_strength, momentum, volatility]
        const sectorStrength = sectorResult.sectors.length > 0
          ? sectorResult.sectors[0].change5d / 10
          : 0;
        const sentimentScore = market.sentiment === 'bullish' ? 0.8 : market.sentiment === 'bearish' ? 0.2 : 0.5;

        const inputs = [
          Math.min(stock.price / 500, 1),           // price normalized
          Math.min(stock.volume / 50_000_000, 1),    // volume normalized
          stock.change5d / 20,                        // change normalized
          market.vixLevel / 50,                       // VIX normalized
          sentimentScore,                             // sentiment
          sectorStrength,                             // sector strength
          stock.trend === 'up' ? 0.8 : stock.trend === 'down' ? 0.2 : 0.5,  // momentum
          market.vixLevel / 40,                       // volatility proxy
        ];

        const result = scorer.scoreOpportunity(inputs);
        scored.push({
          symbol: stock.symbol,
          price: stock.price,
          change: stock.change5d,
          score: result.confidence,
          signal: result.signal,
        });
      } catch {
        // Skip scoring errors for individual stocks
      }
    }

    // Sort by neural score
    scored.sort((a, b) => b.score - a.score);

    // Run RiskAssessor on overall market
    let marketRisk = { riskScore: 0.5, stressScore: 0.5, recommendations: ['No data'] };
    try {
      const riskAssessor = new RiskAssessor();
      // RiskAssessor inputs: [vix_normalized, portfolio_concentration, market_correlation, drawdown_risk, volatility, exposure, leverage]
      marketRisk = riskAssessor.assessRisk([
        market.vixLevel / 50,
        0.3,  // Assume moderate concentration
        0.6,  // Market correlation
        market.sentiment === 'bearish' ? 0.7 : 0.3,
        market.vixLevel / 40,
        0.5,  // Moderate exposure
        0.0,  // No leverage
      ]);
    } catch {
      // Risk assessment failed — use defaults
    }

    // Send quant analysis results
    fleetBus.send({
      sender: AgentRole.QUANT_ANALYST,
      recipients: ['CEO', AgentRole.TRADING_ANALYST, AgentRole.RISK_MANAGER],
      type: 'INSIGHT',
      priority: scored.length > 0 && scored[0].score > 0.75 ? 'high' : 'medium',
      subject: `Quant analysis: ${scored.length} stocks scored | Market risk: ${(marketRisk.riskScore * 100).toFixed(0)}% | Top: ${scored[0]?.symbol ?? 'N/A'} (${((scored[0]?.score ?? 0) * 100).toFixed(0)}%)`,
      payload: {
        scores: scored,
        marketRisk: {
          riskScore: marketRisk.riskScore,
          stressScore: marketRisk.stressScore,
          recommendations: marketRisk.recommendations,
        },
      },
    } as Omit<FleetMessage, 'id' | 'timestamp' | 'status'>);

    // Propose top-scored stock if confidence is high
    if (scored.length > 0 && scored[0].score > 0.7) {
      const topPick = scored[0];
      fleetBus.updateAgentStatus(AgentRole.QUANT_ANALYST, { status: 'proposing' });

      fleetBus.submitProposal(buildProposal(
        AgentRole.QUANT_ANALYST,
        'trade',
        `Neural network STRONG signal: ${topPick.symbol} scored ${(topPick.score * 100).toFixed(0)}% — ${topPick.signal}`,
        `TradeScorer neural network rated ${topPick.symbol} at ${(topPick.score * 100).toFixed(0)}% confidence (${topPick.signal}). Current price: $${topPick.price}, 5-day change: ${topPick.change > 0 ? '+' : ''}${topPick.change.toFixed(1)}%. Market risk score: ${(marketRisk.riskScore * 100).toFixed(0)}%. This is a quantitative signal — combine with fundamental and technical analysis for best results.`,
        {
          priority: topPick.score > 0.85 ? 'high' : 'medium',
          confidence: topPick.score,
          expectedReturn: topPick.change * 0.3 / 100,
          riskLevel: marketRisk.riskScore > 0.6 ? 'high' : 'medium',
          riskFactors: [
            'Neural network predictions are probabilistic',
            `Market risk score: ${(marketRisk.riskScore * 100).toFixed(0)}%`,
            'Past patterns may not repeat',
            `Model stress score: ${(marketRisk.stressScore * 100).toFixed(0)}%`,
          ],
          payload: {
            neuralScore: topPick.score,
            signal: topPick.signal,
            allScores: scored.slice(0, 5),
            marketRisk,
          },
        }
      ));
    }
  });
}

/**
 * Map of agent roles to their behavior functions.
 */
export const AGENT_BEHAVIORS: Record<AgentRole, () => Promise<void>> = {
  [AgentRole.RESEARCH_ANALYST]: runResearchAnalyst,
  [AgentRole.RISK_MANAGER]: runRiskManager,
  [AgentRole.PORTFOLIO_STRATEGIST]: runPortfolioStrategist,
  [AgentRole.TRADING_ANALYST]: runTradingAnalyst,
  [AgentRole.SENTIMENT_ANALYST]: runSentimentAnalyst,
  [AgentRole.QUANT_ANALYST]: runQuantAnalyst,
};
