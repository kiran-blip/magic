/**
 * Gold Digger Supervisor — the core orchestrator.
 * Ported from jarvis-v4/src/nodes/supervisor_node.py + src/graphs/supervisor.py
 *
 * Pipeline: supervisor → governor → agent → (verification) → end
 *
 * This is a simple TypeScript state machine (no LangGraph dependency).
 * Each stage transforms the AgentState and passes it to the next.
 */

import type { AgentState } from "../types";
import { checkContent, sanitizeText, FINANCIAL_DISCLAIMER } from "../governor";
import {
  getAgentPrompt,
  getEmotionalContext,
  addPersonalityWrapper,
  formatGreeting,
} from "../personality";
import { invoke as llmInvoke, type LLMMessage } from "../llm";
import { createGovernanceDecision } from "../types/governance";

// ── Supervisor: classify and route ───────────────────

const ROUTING_PROMPT = `ROUTING TASK:
You must route the user's query to one of these specialized agents:
- "investment": For stock analysis, crypto analysis, portfolio recommendations, market data, price targets, financial analysis
- "research": For market research, niche analysis, competitive landscapes, industry trends, opportunity scoring
- "end": For general conversation, greetings, questions, brainstorming, or anything not investment/research related

Respond with ONLY the agent name: "investment", "research", or "end".
Do NOT include any other text.`;

async function supervisorNode(state: AgentState): Promise<AgentState> {
  const systemPrompt = getAgentPrompt("supervisor") + "\n\n" + ROUTING_PROMPT;

  const messages: LLMMessage[] = [
    { role: "user", content: state.query },
  ];

  try {
    const routingResult = await llmInvoke("premium", messages, systemPrompt);
    const route = routingResult.trim().toLowerCase().replace(/[^a-z]/g, "");

    if (route === "investment" || route === "research") {
      state.agentType = route;
    } else {
      state.agentType = "general";
    }
  } catch {
    // On routing failure, default to general
    state.agentType = "general";
  }

  state.stage = "governor";
  return state;
}

// ── Governor: content safety check ───────────────────

function governorNode(state: AgentState): AgentState {
  const result = checkContent(state.query, state.agentType);

  const decision = createGovernanceDecision({
    approved: !result.blocked,
    reason: result.blocked
      ? result.blockReason ?? "Blocked by content guard"
      : "Content passed safety checks",
    riskLevel: result.blocked ? "high" : result.warnings.length > 0 ? "medium" : "low",
    requiresHumanApproval: false,
    violations: [],
    metadata: {
      sanitizeCredentials: result.sanitizeCredentials,
      addDisclaimer: result.addDisclaimer,
      redactPii: result.redactPii,
      warnings: result.warnings,
    },
  });

  state.governance = decision;

  if (result.blocked) {
    state.response = result.blockReason ?? "This request has been blocked by safety guardrails.";
    state.stage = "blocked";
  } else {
    state.stage = "agent";
  }

  return state;
}

// ── Agent: execute the right agent ───────────────────

async function agentNode(state: AgentState): Promise<AgentState> {
  const agentType = state.agentType === "general" ? "general" : state.agentType;
  const systemPrompt = getAgentPrompt(agentType);

  // Build emotional context from conversation history
  const emotionalContext = getEmotionalContext(state.messages);
  const fullSystem = emotionalContext
    ? `${systemPrompt}\n\n${emotionalContext}`
    : systemPrompt;

  // Build message chain
  const messages: LLMMessage[] = [];

  // Include recent history (last 10 messages)
  for (const msg of state.messages.slice(-10)) {
    messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
  }

  // Current query
  messages.push({ role: "user", content: state.query });

  try {
    const response = await llmInvoke("premium", messages, fullSystem);
    state.response = addPersonalityWrapper(response, agentType);
  } catch (err) {
    state.response =
      "I apologize, but I'm having difficulty processing that request at the moment. Could you try rephrasing it?";
    console.error("[JARVIS Agent] Error:", err);
  }

  state.stage = "end";
  return state;
}

// ── End: post-processing ─────────────────────────────

function endNode(state: AgentState): AgentState {
  if (!state.response) {
    state.response = "I'm not sure how to respond to that. Could you rephrase?";
  }

  // Apply post-processing flags from governor
  const meta = state.governance?.metadata ?? {};

  if (meta.sanitizeCredentials) {
    state.response = sanitizeText(state.response);
  }

  if (meta.addDisclaimer) {
    if (!state.response.toLowerCase().includes("not financial advice")) {
      state.response += FINANCIAL_DISCLAIMER;
    }
  }

  if (meta.redactPii) {
    console.warn("[JARVIS] PII detected in query — flagged for audit log");
  }

  state.stage = "end";
  return state;
}

// ── Main pipeline ────────────────────────────────────

export interface JarvisOptions {
  /** Skip supervisor routing and go directly to this agent type */
  forceAgentType?: "investment" | "research" | "general";
  /** Skip LLM routing — just process through governor + general chat */
  quickChat?: boolean;
}

/**
 * Run the full JARVIS pipeline on a user message.
 *
 * @param query - User message
 * @param history - Conversation history
 * @param options - Pipeline options
 * @returns Final AgentState with response
 */
export async function runJarvis(
  query: string,
  history: Array<{ role: "user" | "assistant" | "system"; content: string }> = [],
  options: JarvisOptions = {}
): Promise<AgentState> {
  // Initialize state
  let state: AgentState = {
    threadId: crypto.randomUUID(),
    query,
    agentType: "general",
    messages: history,
    stage: "supervisor",
    metadata: {},
  };

  // Check for greetings (skip routing)
  const greetingPatterns = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))\b/i;
  const isGreeting = greetingPatterns.test(query.trim());

  if (isGreeting && !options.forceAgentType) {
    // Short-circuit: respond with a greeting
    state.agentType = "general";
    state = governorNode(state);
    if (state.stage === "blocked") return endNode(state);

    const greeting = formatGreeting("Sir");
    state.response = greeting + " What can I help you with today?";
    state.stage = "end";
    return endNode(state);
  }

  // Step 1: Supervisor routing
  if (options.forceAgentType) {
    state.agentType = options.forceAgentType;
    state.stage = "governor";
  } else if (options.quickChat) {
    state.agentType = "general";
    state.stage = "governor";
  } else {
    state = await supervisorNode(state);
  }

  // Step 2: Governor safety check
  state = governorNode(state);
  if (state.stage === "blocked") {
    return endNode(state);
  }

  // Step 3: Agent execution
  state = await agentNode(state);

  // Step 4: End (post-processing)
  state = endNode(state);

  return state;
}
