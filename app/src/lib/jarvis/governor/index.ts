/**
 * JARVIS Safety Governor — barrel export.
 */

export { checkContent, redactPii, type GuardrailResult } from "./content-guard";
export {
  detectCredentials,
  sanitizeText,
  detectPromptInjection,
  type CredentialMatch,
  type PromptInjectionMatch,
} from "./credential-detector";

/** Financial disclaimer appended when governor flags investment/research queries. */
export const FINANCIAL_DISCLAIMER =
  "\n\n---\n*Disclaimer: This is analysis only, not financial advice. Always consult a qualified financial advisor before making investment decisions. Past performance does not guarantee future results.*";
