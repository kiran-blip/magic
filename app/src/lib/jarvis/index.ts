/**
 * Gold Digger — main barrel export.
 *
 * Usage:
 *   import { runJarvis } from "@/lib/jarvis";
 *   const result = await runJarvis("Analyze AAPL stock", history);
 *   console.log(result.response);
 */

export { runJarvis, type JarvisOptions } from "./agents";
export * from "./types";
export { checkContent, sanitizeText, FINANCIAL_DISCLAIMER } from "./governor";
export {
  getAgentPrompt,
  getEmotionalContext,
  formatGreeting,
  addPersonalityWrapper,
  JARVIS_CORE_IDENTITY,
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
