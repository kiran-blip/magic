/**
 * Rules module re-exports.
 */

export {
  type RuleType,
  type RuleStatus,
  type TradingRule,
  type RuleConfig,
  type PriceAlertConfig,
  type DcaConfig,
  type RebalanceConfig,
  type StopLossConfig,
  type TakeProfitConfig,
  type TrailingStopConfig,
  createRule,
  getRules,
  getRule,
  updateRule,
  deleteRule,
  markRuleTriggered,
  markRuleEvaluated,
} from "./engine";

export {
  type EvaluationResult,
  type MarketSnapshot,
  evaluateAllRules,
} from "./evaluator";
