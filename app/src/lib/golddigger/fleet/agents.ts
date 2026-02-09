/**
 * Agent definitions for the autonomous fleet.
 * 6 specialized AI agents with distinct roles and capabilities.
 */

import { AgentRole, AgentDefinition } from './types';

/**
 * Chief Research Officer - Scans markets and finds investment opportunities
 */
const RESEARCH_ANALYST: AgentDefinition = {
  role: AgentRole.RESEARCH_ANALYST,
  name: 'Chief Research Officer',
  shortName: 'CRO',
  description:
    'Scans market data, identifies opportunities, and researches potential investments',
  capabilities: [
    'Market scanning',
    'Opportunity identification',
    'Fundamental analysis',
    'Industry research',
    'Competitor analysis',
    'Earnings research',
    'SEC filings analysis',
  ],
  triggers: [
    'Market opening',
    'Earnings announcement',
    'Sector rotation signal',
    'New research request',
    'CEO directive for research',
  ],
  color: '#3B82F6',
};

/**
 * Chief Risk Officer - Evaluates risk in portfolio and proposed trades
 */
const RISK_MANAGER: AgentDefinition = {
  role: AgentRole.RISK_MANAGER,
  name: 'Chief Risk Officer',
  shortName: 'CRiskO',
  description: 'Evaluates portfolio risk, analyzes trade proposals, and manages exposure',
  capabilities: [
    'Risk assessment',
    'Correlation analysis',
    'Portfolio stress testing',
    'Drawdown analysis',
    'Value at Risk (VaR)',
    'Stop loss evaluation',
    'Concentration risk detection',
    'Volatility measurement',
  ],
  triggers: [
    'Proposal submitted',
    'Portfolio rebalancing',
    'Market volatility spike',
    'Position concentration alert',
    'Risk limit review',
  ],
  color: '#EF4444',
};

/**
 * Portfolio Director - Manages allocations, rebalancing, and diversification
 */
const PORTFOLIO_STRATEGIST: AgentDefinition = {
  role: AgentRole.PORTFOLIO_STRATEGIST,
  name: 'Portfolio Director',
  shortName: 'PD',
  description:
    'Manages asset allocation, portfolio rebalancing, and overall diversification strategy',
  capabilities: [
    'Asset allocation optimization',
    'Portfolio rebalancing',
    'Diversification analysis',
    'Sector weighting',
    'Factor exposure management',
    'Tactical allocation',
    'Strategic positioning',
    'Drawdown recovery planning',
  ],
  triggers: [
    'Periodic rebalancing schedule',
    'Market drift beyond thresholds',
    'CEO directive on allocation',
    'Risk manager alert',
    'New capital deployment',
    'Major position trade',
  ],
  color: '#8B5CF6',
};

/**
 * Head of Trading - Develops entry/exit strategies and timing
 */
const TRADING_ANALYST: AgentDefinition = {
  role: AgentRole.TRADING_ANALYST,
  name: 'Head of Trading',
  shortName: 'HoT',
  description: 'Develops trading strategies, entry/exit points, and trade execution timing',
  capabilities: [
    'Technical analysis',
    'Entry point optimization',
    'Exit strategy development',
    'Order execution planning',
    'Trading signal generation',
    'Breakout identification',
    'Support/resistance analysis',
    'Execution cost optimization',
  ],
  triggers: [
    'Trade opportunity identified',
    'Technical signal triggered',
    'CEO approval for trade',
    'Portfolio rebalancing needed',
    'Stop loss triggered',
    'Momentum shift detected',
  ],
  color: '#10B981',
};

/**
 * Sentiment Director - Monitors market sentiment and news
 */
const SENTIMENT_ANALYST: AgentDefinition = {
  role: AgentRole.SENTIMENT_ANALYST,
  name: 'Sentiment Director',
  shortName: 'SD',
  description:
    'Monitors market sentiment, analyzes news flow, and tracks investor psychology',
  capabilities: [
    'Sentiment analysis',
    'News monitoring',
    'Social media tracking',
    'Options flow analysis',
    'Investor positioning',
    'Volatility regime detection',
    'Market breadth analysis',
    'Contrarian signal identification',
  ],
  triggers: [
    'Market open',
    'Major news event',
    'Earnings season',
    'Fed announcement',
    'Market moving news',
    'Sentiment extreme reached',
  ],
  color: '#F59E0B',
};

/**
 * Head of Quantitative - Neural networks, statistical models, and predictions
 */
const QUANT_ANALYST: AgentDefinition = {
  role: AgentRole.QUANT_ANALYST,
  name: 'Head of Quantitative',
  shortName: 'HoQ',
  description:
    'Develops neural networks, statistical models, and generates quantitative predictions',
  capabilities: [
    'Machine learning modeling',
    'Neural network development',
    'Statistical forecasting',
    'Pattern recognition',
    'Anomaly detection',
    'Predictive analytics',
    'Factor model creation',
    'Backtesting & validation',
  ],
  triggers: [
    'Daily model updates',
    'New training data available',
    'Model retraining schedule',
    'Prediction request',
    'Statistical significance event',
    'Model performance degradation',
  ],
  color: '#EC4899',
};

/**
 * All fleet agents indexed by role.
 */
export const FLEET_AGENTS: Record<AgentRole, AgentDefinition> = {
  [AgentRole.RESEARCH_ANALYST]: RESEARCH_ANALYST,
  [AgentRole.RISK_MANAGER]: RISK_MANAGER,
  [AgentRole.PORTFOLIO_STRATEGIST]: PORTFOLIO_STRATEGIST,
  [AgentRole.TRADING_ANALYST]: TRADING_ANALYST,
  [AgentRole.SENTIMENT_ANALYST]: SENTIMENT_ANALYST,
  [AgentRole.QUANT_ANALYST]: QUANT_ANALYST,
};

/**
 * Get agent definition by role.
 * @param role - The agent role
 * @returns The agent definition
 */
export function getAgentDef(role: AgentRole): AgentDefinition {
  const agent = FLEET_AGENTS[role];
  if (!agent) {
    throw new Error(`Unknown agent role: ${role}`);
  }
  return agent;
}

/**
 * Get all agent definitions.
 * @returns Array of all agent definitions
 */
export function getAllAgents(): AgentDefinition[] {
  return Object.values(FLEET_AGENTS);
}

/**
 * Get agent names indexed by role for UI display.
 * @returns Mapping of roles to display names
 */
export function getAgentNames(): Record<AgentRole, string> {
  return Object.entries(FLEET_AGENTS).reduce(
    (acc, [role, def]) => {
      acc[role as AgentRole] = def.name;
      return acc;
    },
    {} as Record<AgentRole, string>,
  );
}

/**
 * Get agent colors indexed by role for UI theming.
 * @returns Mapping of roles to color codes
 */
export function getAgentColors(): Record<AgentRole, string> {
  return Object.entries(FLEET_AGENTS).reduce(
    (acc, [role, def]) => {
      acc[role as AgentRole] = def.color;
      return acc;
    },
    {} as Record<AgentRole, string>,
  );
}
