/**
 * Content-level safety guardrails for legal, privacy, and security.
 * Ported from jarvis-v4/src/governor/content_guard.py
 *
 * 6 guardrail checks:
 *  1. PII Detection (warn, flag for redaction)
 *  2. Legal Compliance (block insider trading, money laundering, etc.)
 *  3. Privacy Protection (block data exfiltration)
 *  4. Security (credential leak, prompt injection)
 *  5. Financial Disclaimer (flag for post-processing)
 *  6. Output Sanitization flags
 */

import {
  detectCredentials,
  detectPromptInjection,
} from "./credential-detector";

// ── Result type ──────────────────────────────────────

export interface GuardrailResult {
  passed: boolean;
  blocked: boolean;
  blockReason?: string;
  warnings: string[];

  // Post-processing flags
  sanitizeCredentials: boolean;
  addDisclaimer: boolean;
  redactPii: boolean;

  // Evidence for logging
  evidence: Record<string, unknown>;
}

function createResult(): GuardrailResult {
  return {
    passed: true,
    blocked: false,
    warnings: [],
    sanitizeCredentials: false,
    addDisclaimer: false,
    redactPii: false,
    evidence: {},
  };
}

// ── Pattern constants ────────────────────────────────

const PII_PATTERNS: Record<string, RegExp> = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
};

const INSIDER_TRADING_KEYWORDS = [
  "insider information",
  "material non-public",
  "mnpi",
  "tip from someone inside",
  "material information not yet disclosed",
  "inside information",
  "confidential tip",
];

const MONEY_LAUNDERING_KEYWORDS = [
  "money laundering",
  "wash trading",
  "structuring deposits",
  "smurfing",
  "placement of illicit funds",
  "layering transactions",
  "integration schemes",
];

const GUARANTEED_RETURNS_KEYWORDS = [
  "guaranteed profit",
  "risk-free investment",
  "100% guaranteed",
  "can't lose money",
  "guaranteed returns",
  "guaranteed gains",
  "sure profit",
  "certain return",
];

const FINANCIAL_ANALYSIS_KEYWORDS = [
  "stock price",
  "investment",
  "portfolio",
  "trading strategy",
  "market analysis",
  "buy recommendation",
  "sell recommendation",
  "fund allocation",
  "asset allocation",
  "financial forecast",
  "earnings forecast",
  "price target",
  "bull case",
  "bear case",
];

const DATA_EXTRACTION_PATTERNS = [
  /list\s+all\s+users/i,
  /export\s+database/i,
  /dump\s+users/i,
  /get\s+everyone'?s\s+data/i,
  /extract\s+personal\s+info/i,
  /retrieve\s+sensitive\s+data/i,
  /all\s+customers?\s+information/i,
];

const DANGEROUS_PATHS = [
  "/etc/passwd",
  ".env",
  "credentials",
  "secrets",
  "private key",
];

// ── Guard checks ─────────────────────────────────────

function checkPii(query: string, result: GuardrailResult): void {
  const foundPii: Record<string, number> = {};

  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    pattern.lastIndex = 0;
    const matches = query.match(pattern);
    if (matches && matches.length > 0) {
      foundPii[piiType] = matches.length;
    }
  }

  if (Object.keys(foundPii).length > 0) {
    result.warnings.push(
      `PII detected in query: ${JSON.stringify(foundPii)}. This will be redacted from logs.`
    );
    result.redactPii = true;
    result.evidence.pii_types = foundPii;
  }
}

function checkLegalCompliance(
  queryLower: string,
  result: GuardrailResult
): void {
  for (const keyword of INSIDER_TRADING_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      result.blocked = true;
      result.passed = false;
      result.blockReason =
        "Query appears to involve insider trading information. This is illegal and I cannot assist with it.";
      result.evidence.violation = "insider_trading_attempt";
      return;
    }
  }

  for (const keyword of MONEY_LAUNDERING_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      result.blocked = true;
      result.passed = false;
      result.blockReason =
        "Query appears to involve money laundering. This is illegal and I cannot assist with it.";
      result.evidence.violation = "money_laundering_attempt";
      return;
    }
  }

  for (const keyword of GUARANTEED_RETURNS_KEYWORDS) {
    if (queryLower.includes(keyword)) {
      result.blocked = true;
      result.passed = false;
      result.blockReason =
        "Query requests guaranteed returns, which are unrealistic and typically indicate fraud. I cannot assist with marketing or promoting such claims.";
      result.evidence.violation = "guaranteed_returns_claim";
      return;
    }
  }

  if (
    queryLower.includes("tax evasion") ||
    queryLower.includes("avoid taxes")
  ) {
    result.blocked = true;
    result.passed = false;
    result.blockReason =
      "Tax evasion is illegal. I cannot assist with it.";
    result.evidence.violation = "tax_evasion_attempt";
  }
}

function checkPrivacyProtection(
  queryLower: string,
  result: GuardrailResult
): void {
  for (const pattern of DATA_EXTRACTION_PATTERNS) {
    if (pattern.test(queryLower)) {
      result.blocked = true;
      result.passed = false;
      result.blockReason =
        "Query appears to request unauthorized extraction of other users' data. This violates privacy protections.";
      result.evidence.violation = "data_exfiltration_attempt";
      return;
    }
  }

  for (const path of DANGEROUS_PATHS) {
    if (queryLower.includes(path)) {
      result.blocked = true;
      result.passed = false;
      result.blockReason = `Query appears to request access to sensitive system files (${path}). This is not permitted.`;
      result.evidence.violation = "unauthorized_system_access";
      return;
    }
  }
}

function checkSecurityGuardrails(
  query: string,
  result: GuardrailResult
): void {
  const credentialMatches = detectCredentials(query);
  if (credentialMatches.length > 0) {
    result.warnings.push(
      `Credentials detected in query: ${credentialMatches.map((m) => m.type).join(", ")}. These will be redacted.`
    );
    result.sanitizeCredentials = true;
    result.evidence.credentials_found = credentialMatches.map((m) => m.type);
  }

  const injectionMatches = detectPromptInjection(query);
  if (injectionMatches.length > 0) {
    result.blocked = true;
    result.passed = false;
    result.blockReason = `Prompt injection detected: ${injectionMatches[0].match}. This is not permitted.`;
    result.evidence.injection_patterns = injectionMatches.map(
      (m) => m.pattern
    );
  }
}

function checkFinancialDisclaimer(
  queryLower: string,
  result: GuardrailResult
): void {
  const isFinancial = FINANCIAL_ANALYSIS_KEYWORDS.some((kw) =>
    queryLower.includes(kw)
  );
  if (isFinancial) {
    result.addDisclaimer = true;
    result.evidence.financial_analysis_requested = true;
  }
}

// ── Public API ───────────────────────────────────────

/**
 * Run all content guardrails on a query.
 *
 * @param query - User query to check
 * @param agentType - Type of agent handling the query
 * @returns GuardrailResult with passed status, warnings, and post-processing flags
 */
export function checkContent(
  query: string,
  agentType: string = "unknown"
): GuardrailResult {
  const result = createResult();
  const queryLower = query.toLowerCase();

  // 1. PII Detection (warn, don't block)
  checkPii(query, result);

  // 2. Legal Compliance (block)
  if (!result.blocked) checkLegalCompliance(queryLower, result);

  // 3. Privacy Protection (block)
  if (!result.blocked) checkPrivacyProtection(queryLower, result);

  // 4. Security Guardrails (credential leak & injection)
  if (!result.blocked) checkSecurityGuardrails(query, result);

  // 5. Financial Disclaimer flagging
  if (agentType === "investment" || agentType === "research") {
    checkFinancialDisclaimer(queryLower, result);
  }

  return result;
}
