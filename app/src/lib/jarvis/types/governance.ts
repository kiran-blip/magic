/**
 * Governance, safety, and policy violation type definitions.
 * Ported from jarvis-v4/src/models/governance.py
 */

import { randomUUID } from "crypto";

// ── Enums ────────────────────────────────────────────

export const ViolationType = {
  CREDENTIAL_LEAK: "credential_leak",
  ILLEGAL_ACTIVITY: "illegal_activity",
  RESOURCE_EXHAUSTION: "resource_exhaustion",
  UNAUTHORIZED_ACCESS: "unauthorized_access",
  PROMPT_INJECTION: "prompt_injection",
  DATA_EXFILTRATION: "data_exfiltration",
  BUDGET_EXCEEDED: "budget_exceeded",
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  UNSAFE_OPERATION: "unsafe_operation",
  POLICY_VIOLATION: "policy_violation",
} as const;
export type ViolationType =
  (typeof ViolationType)[keyof typeof ViolationType];

export const Severity = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  INFO: "info",
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const Action = {
  BLOCK: "block",
  WARN: "warn",
  LOG: "log",
  NOTIFY: "notify",
  QUARANTINE: "quarantine",
} as const;
export type Action = (typeof Action)[keyof typeof Action];

// ── Interfaces ───────────────────────────────────────

export interface Policy {
  id: string;
  name: string;
  maxDaily?: number;
  maxHourly?: number;
  requireApprovalAbove?: number;
  blockedKeywords: string[];
  allowedHours?: [number, number]; // [startHour, endHour]
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Violation {
  id: string;
  timestamp: string;
  violationType: ViolationType;
  severity: Severity;
  description: string;
  source: string;
  actionTaken: Action;
  evidence: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
}

export interface GovernanceDecision {
  id: string;
  approved: boolean;
  reason: string;
  riskLevel: string;
  requiresHumanApproval: boolean;
  violations: Violation[];
  timestamp: string;
  reviewedBy?: string;
  metadata: Record<string, unknown>;
}

export interface ActionRequest {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  estimatedCost: number;
  riskLevel: string;
  requestingAgent: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Factories ────────────────────────────────────────

export function createViolation(
  data: Omit<Violation, "id" | "timestamp" | "resolved">
): Violation {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    resolved: false,
    ...data,
  };
}

export function createGovernanceDecision(
  data: Omit<GovernanceDecision, "id" | "timestamp">
): GovernanceDecision {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...data,
  };
}
