/**
 * Content verification and certification type definitions.
 * Ported from jarvis-v4/src/models/verification.py
 */

import { randomUUID, createHash } from "crypto";

// ── Enums ────────────────────────────────────────────

export const VerificationStatus = {
  PENDING: "pending",
  GENERATED: "generated",
  VERIFIED: "verified",
  REFINED: "refined",
  VALIDATED: "validated",
  CERTIFIED: "certified",
  FAILED: "failed",
} as const;
export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const ContentType = {
  CODE: "code",
  ANALYSIS: "analysis",
  STRATEGY: "strategy",
  CREATIVE: "creative",
  FACTUAL: "factual",
  INVESTMENT: "investment",
} as const;
export type ContentType = (typeof ContentType)[keyof typeof ContentType];

// ── Interfaces ───────────────────────────────────────

export interface VerificationResult {
  id: string;
  originalOutput: string;
  verificationNotes: string;
  issuesFound: string[];
  improvementsMade: string[];
  confidenceScore: number; // 0.0 – 1.0
  status: VerificationStatus;
  timestamp: string;
  verifiedBy?: string;
}

export interface CertifiedOutput {
  id: string;
  content: string;
  contentType: ContentType;
  certificationId: string;
  verificationChain: VerificationResult[];
  finalConfidence: number; // 0.0 – 1.0
  timestamp: string;
  expiresAt: string;
  checksum: string;
  certifiedBy?: string;
  metadata: Record<string, unknown>;
}

// ── Helpers ──────────────────────────────────────────

/** Calculate SHA-256 checksum of content. */
export function calculateChecksum(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/** Check if a certification has expired. */
export function isExpired(cert: CertifiedOutput): boolean {
  return new Date() > new Date(cert.expiresAt);
}

/** Factory for CertifiedOutput (30-day default expiry). */
export function createCertifiedOutput(
  data: Omit<
    CertifiedOutput,
    "id" | "certificationId" | "timestamp" | "expiresAt" | "checksum"
  >
): CertifiedOutput {
  const now = new Date();
  const expires = new Date(now);
  expires.setDate(expires.getDate() + 30);

  return {
    id: randomUUID(),
    certificationId: randomUUID(),
    timestamp: now.toISOString(),
    expiresAt: expires.toISOString(),
    checksum: calculateChecksum(data.content),
    ...data,
  };
}
