/**
 * JARVIS type definitions — barrel export.
 */

export * from "./investment";
export * from "./research";
export * from "./governance";
export * from "./verification";

/** Agent state flowing through the supervisor pipeline. */
export interface AgentState {
  /** Unique thread/conversation ID */
  threadId: string;
  /** Original user message */
  query: string;
  /** Classified agent type: investment | research | general */
  agentType: "investment" | "research" | "general";
  /** Conversation history */
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  /** Governance decision for this query */
  governance?: import("./governance").GovernanceDecision;
  /** Agent response text */
  response?: string;
  /** Current pipeline stage */
  stage:
    | "supervisor"
    | "governor"
    | "agent"
    | "verification"
    | "end"
    | "blocked";
  /** Accumulated metadata */
  metadata: Record<string, unknown>;
}
