/**
 * Gold Digger Fleet Module — Autonomous Agent Fleet System
 *
 * The fleet is the core brain of the autonomous investment platform.
 * 6 specialized AI agents work together autonomously to:
 * - Research market opportunities
 * - Assess portfolio risk
 * - Optimize asset allocation
 * - Develop trading strategies
 * - Monitor market sentiment
 * - Run quantitative models
 *
 * All agents communicate via the FleetBus and propose actions to the CEO for approval.
 * The Orchestrator manages the autonomous loop that runs all agents.
 *
 * Export everything needed to integrate the fleet into Gold Digger.
 */

// Type definitions
export * from './types';

// Agent definitions and metadata
export * from './agents';

// Fleet communication bus
export { fleetBus } from './bus';

// Neural network models (TradeScorer, PositionSizer, RiskAssessor)
export * from './neural';

// Chain-of-Verification (multi-agent cross-checking)
export {
  runVerification,
  runAllVerifications,
  verificationToApproval,
  computeVerificationStatus,
} from './verification';

// Real agent behaviors (market data, neural networks, LLM)
export { AGENT_BEHAVIORS } from './agent-behaviors';

// Orchestrator (main autonomous loop — auto-starts on first access)
export { FleetOrchestrator, getOrchestrator } from './orchestrator';
