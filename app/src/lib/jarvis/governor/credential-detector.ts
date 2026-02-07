/**
 * Credential detection and prompt injection detection.
 * Ported from jarvis-v4/src/governor/credential_detector.py
 *
 * Key fix vs v3: full credential redaction (not partial 5-char).
 */

// ── Types ────────────────────────────────────────────

export interface CredentialMatch {
  type: string;
  match: string;
  position: [number, number];
}

export interface PromptInjectionMatch {
  pattern: string;
  match: string;
  position: [number, number];
}

// ── Patterns ─────────────────────────────────────────

/** 20+ credential patterns ported from v3 safety_governor.py. */
const CREDENTIAL_PATTERNS: Record<string, RegExp> = {
  openai_key: /sk-[a-zA-Z0-9]{20,}/g,
  anthropic_key: /sk-ant-[a-zA-Z0-9]{20,}/g,
  github_token: /ghp_[a-zA-Z0-9]{36}/g,
  gitlab_token: /glpat-[a-zA-Z0-9\-]{20}/g,
  aws_access_key: /AKIA[0-9A-Z]{16}/g,
  aws_secret_key: /aws_secret_access_key\s*=\s*[a-zA-Z0-9/+=]{40}/g,
  google_oauth: /ya29\.[a-zA-Z0-9_\-]+/g,
  private_key:
    /-----BEGIN[^\-]+PRIVATE KEY-----[\s\S]*?-----END[^\-]+PRIVATE KEY-----/gm,
  connection_string:
    /(mongodb|postgres|mysql|redis):\/\/[^@\s]+@[^\s]+/g,
  generic_api_key:
    /(api[_-]?key|token|secret)[=:]\s*['"]?[a-zA-Z0-9_\-]{20,}['"]?/gi,
  openrouter_key: /sk-or-[a-zA-Z0-9\-]{20,}/g,
  jwt_token:
    /eyJ[a-zA-Z0-9_\-]+\.eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g,
  huggingface_token: /hf_[a-zA-Z0-9]{34,}/g,
  slack_token:
    /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[0-9a-zA-Z]{24,34}/g,
  discord_token:
    /[MN][A-Za-z0-9_\-]{23,25}\.[A-Za-z0-9_\-]{6,7}\.[A-Za-z0-9_\-]{27}/g,
  stripe_key: /sk_live_[0-9a-zA-Z]{24}/g,
  sendgrid_key: /SG\.[a-zA-Z0-9_\-]{22}/g,
  twilio_key: /AC[a-zA-Z0-9_\-]{32}/g,
  azure_storage_key:
    /DefaultEndpointsProtocol=https;[^;]*AccountKey=[a-zA-Z0-9+/=]+/g,
  basic_auth: /https?:\/\/[^:]+:[^@]+@[^\s]+/g,
};

/** Prompt injection detection patterns. */
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+previous\s+instructions/gi,
  /disregard\s+(all\s+)?rules/gi,
  /(you\s+are\s+now|pretend\s+to\s+be|act\s+as\s+if)/gi,
  /leak\s+(your\s+)?prompt/gi,
  /show\s+(your\s+)?instructions/gi,
  /system\s+prompt/gi,
  /reveal\s+your/gi,
  /jailbreak/gi,
  /bypass\s+security/gi,
  /restrict|filter|censor/gi,
];

// ── Detector ─────────────────────────────────────────

/** Detect all credentials in text. */
export function detectCredentials(text: string): CredentialMatch[] {
  const matches: CredentialMatch[] = [];

  for (const [credType, pattern] of Object.entries(CREDENTIAL_PATTERNS)) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({
        type: credType,
        match: m[0],
        position: [m.index, m.index + m[0].length],
      });
    }
  }

  return matches;
}

/**
 * Replace all found credentials with [REDACTED].
 * Fixed vs v3: redacts ENTIRE match, not just 5 chars.
 */
export function sanitizeText(text: string): string {
  const allMatches: Array<[number, number]> = [];

  for (const pattern of Object.values(CREDENTIAL_PATTERNS)) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      allMatches.push([m.index, m.index + m[0].length]);
    }
  }

  // Sort descending by start position so replacements don't shift indices
  allMatches.sort((a, b) => b[0] - a[0]);

  let sanitized = text;
  for (const [start, end] of allMatches) {
    sanitized = sanitized.slice(0, start) + "[REDACTED]" + sanitized.slice(end);
  }

  return sanitized;
}

/** Detect prompt injection attempts. */
export function detectPromptInjection(
  text: string
): PromptInjectionMatch[] {
  const matches: PromptInjectionMatch[] = [];

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({
        pattern: pattern.source,
        match: m[0],
        position: [m.index, m.index + m[0].length],
      });
    }
  }

  return matches;
}
