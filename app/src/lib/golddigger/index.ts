/**
 * Gold Digger — main barrel export.
 *
 * Usage:
 *   import { runGoldDigger } from "@/lib/golddigger";
 *   const result = await runGoldDigger("Analyze AAPL stock", history);
 *   console.log(result.response);
 */

export { runGoldDigger, type GoldDiggerOptions } from "./agents";
export * from "./types";
export { checkContent, sanitizeText, FINANCIAL_DISCLAIMER } from "./governor";
export {
  getAgentPrompt,
  getEmotionalContext,
  formatGreeting,
  addPersonalityWrapper,
  GOLDDIGGER_CORE_IDENTITY,
} from "./personality";
export {
  invoke as llmInvoke,
  getTierForTask,
  ModelTier,
  type LLMMessage,
} from "./llm";
export {
  loadConfig,
  saveConfig,
  updateConfig,
  getPublicConfig,
  isSetupComplete,
  type GoldDiggerConfig,
  type GoldDiggerConfigPublic,
} from "./config";
