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
import { checkContent, sanitizeText, redactPii, FINANCIAL_DISCLAIMER } from "../governor";
import {
  getAgentPrompt,
  getEmotionalContext,
  addPersonalityWrapper,
  formatGreeting,
} from "../personality";
import { invoke as llmInvoke, type LLMMessage } from "../llm";
import { createGovernanceDecision } from "../types/governance";
import { runInvestmentPipeline } from "./investment-agent";
import { runResearchPipeline } from "./research-agent";

// ── Supervisor: classify and route ───────────────────

const ROUTING_PROMPT = `You are the Gold Digger routing engine. Your ONLY job is to classify the user's message into one of three categories.

CATEGORIES:
- "investment" → Stock analysis, crypto analysis, portfolio recommendations, market data, price targets, financial analysis, buy/sell/hold questions, trading, comparing assets, earnings, dividends. ALSO: any vague request about making money, finding opportunities, growing wealth, what to invest in, what's good/hot/trending, or any finance-adjacent question where the user wants guidance.
- "research" → Market research, niche analysis, competitive landscapes, industry trends, opportunity scoring, TAM/SAM/SOM, startup ideas, business validation, finding market gaps, sector analysis.
- "general" → Greetings, general conversation, questions about Gold Digger, non-finance topics, or clearly unrelated to money/markets.

RULES:
1. Look at the FULL conversation context, not just the last message
2. If the user continues a topic from earlier messages, stay in that category
3. IMPORTANT: When in doubt between "general" and "investment", prefer "investment" — this is a financial intelligence platform and users come here for money advice
4. Respond with ONLY ONE WORD: investment, research, or general
5. No explanations, no punctuation, just the single word`;

async function supervisorNode(state: AgentState): Promise<AgentState> {
  const systemPrompt = getAgentPrompt("supervisor") + "\n\n" + ROUTING_PROMPT;

  // Include recent conversation history for context-aware routing
  const messages: LLMMessage[] = [];

  // Add up to last 4 messages of history for routing context
  const recentHistory = state.messages.slice(-4);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content,
    });
  }

  // Add the current query
  messages.push({ role: "user", content: state.query });

  try {
    const routingResult = await llmInvoke("premium", messages, systemPrompt);

    // Extract just the agent keyword from the response
    const cleaned = routingResult.trim().toLowerCase();

    // Try exact match first, then substring match
    if (cleaned === "investment" || cleaned === "research" || cleaned === "general") {
      state.agentType = cleaned === "general" ? "general" : cleaned;
    } else if (cleaned.includes("investment")) {
      state.agentType = "investment";
    } else if (cleaned.includes("research")) {
      state.agentType = "research";
    } else {
      state.agentType = "general";
    }

    console.log(`[Gold Digger] Supervisor routed to: ${state.agentType} (raw: "${cleaned.slice(0, 30)}")`);
  } catch (err) {
    // On routing failure, use keyword-based fallback instead of blind "general"
    console.error("[Gold Digger] Supervisor routing failed, using keyword fallback:", err);

    // Research keywords (check first — more specific than investment)
    const hasResearchSignal =
      /\b(research|market\s+(size|opportunity|trend|report)|competitive\s+landscape|niche|tam\b|sam\b|som\b|opportunity\s+score|industry\s+analysis|market\s+research|go.to.market)\b/i.test(state.query);

    // Investment keywords: tickers, financial terms
    // Ticker regex: 2-5 uppercase letters, excluding common English words
    const COMMON_WORDS = new Set(["AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "HE", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US", "WE", "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "HAS", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "GET", "HAS", "HIM", "LET", "SAY", "SHE", "TOO", "USE"]);
    const tickerMatch = state.query.match(/\b[A-Z]{2,5}\b/g);
    const hasTickerSignal = tickerMatch ? tickerMatch.some((t) => !COMMON_WORDS.has(t)) : false;

    const hasInvestmentSignal =
      /\b(stocks?|shares?|invest\w*|buy\w*|sell\w*|hold\w*|portfolio|dividends?|earnings|ipo|etfs?|crypto\w*|bitcoin|btc|eth)\b/i.test(state.query) ||
      hasTickerSignal ||
      /\b(price target|bull|bear|valuation|p\/e|roi)\b/i.test(state.query);

    // Proactive intent: vague finance/money queries → treat as investment
    // Users who say "opportunities", "make money", "what's good" want proactive advice
    // NOTE: No trailing \b on stems — "opportunit" must match "opportunities"
    const hasProactiveFinanceIntent =
      /\b(opportunit\w*|money|profit\w*|revenue|income|wealth|rich|gain\w*|returns?|grow\s+my|where\s+to\s+put|what.?s?\s+(good|hot|trending|worth)|recommend\w*|suggest\w*|ideas?)\b/i.test(state.query);

    if (hasResearchSignal) {
      state.agentType = "research";
    } else if (hasInvestmentSignal || hasProactiveFinanceIntent) {
      state.agentType = "investment";
    } else {
      state.agentType = "general";
    }
    console.log(`[Gold Digger] Keyword fallback routed to: ${state.agentType}`);
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
    // Sanitize credentials from the query BEFORE passing to LLM
    // This prevents the model from ever seeing raw API keys/tokens
    if (result.sanitizeCredentials) {
      console.warn("[JARVIS] Credentials detected in query — sanitizing before LLM");
      state.query = sanitizeText(state.query);
    }
    // Redact PII from the query before the LLM sees it too
    if (result.redactPii) {
      console.warn("[JARVIS] PII detected in query — redacting before LLM");
      state.query = redactPii(state.query);
    }
    state.stage = "agent";
  }

  return state;
}

// ── Agent: execute the right agent ───────────────────

async function agentNode(state: AgentState): Promise<AgentState> {
  try {
    if (state.agentType === "investment") {
      // Run the full 6-node investment pipeline
      console.log("[Gold Digger] Routing to investment pipeline");
      state.response = await runInvestmentPipeline(state.query, state.messages);
    } else if (state.agentType === "research") {
      // Run the full 7-node research pipeline
      console.log("[Gold Digger] Routing to research pipeline");
      state.response = await runResearchPipeline(state.query, state.messages);
    } else {
      // General chat — LLM with personality
      console.log("[Gold Digger] Routing to general chat");
      state.response = await generalChatAgent(state);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Gold Digger Agent] ${state.agentType} pipeline error:`, errMsg);

    // Detect if the error is an LLM connectivity issue
    const isServiceDown = errMsg.includes("LLM tiers failed") ||
      errMsg.includes("connect") ||
      errMsg.includes("ECONNREFUSED") ||
      errMsg.includes("timeout") ||
      errMsg.includes("API") ||
      errMsg.includes("fetch");

    if (isServiceDown) {
      // Don't blame the user — provide useful offline content
      state.response = getOfflineFallback(state.agentType, state.query);
    } else if (state.agentType === "investment") {
      state.response =
        "I ran into an issue while analyzing that investment. Market data services may be temporarily unavailable.\n\n" +
        "You can try:\n" +
        "• Specifying a ticker symbol (e.g. \"Analyze AAPL\")\n" +
        "• Asking about a specific market or sector\n" +
        "• Trying again in a moment";
    } else if (state.agentType === "research") {
      state.response =
        "I hit a snag while researching that market. Let me know if you'd like to try a more specific query, like:\n\n" +
        "• \"Research the AI coding tools market\"\n" +
        "• \"What's the opportunity score for EV charging?\"\n" +
        "• \"Competitive landscape in fintech\"";
    } else {
      state.response =
        "I wasn't able to process that right now due to a service issue. " +
        "Please check that your API keys are configured in Settings, then try again.";
    }
  }

  state.stage = "end";
  return state;
}

// ── Offline Fallbacks: useful responses when LLM is unreachable ──

function getOfflineFallback(agentType: string, query: string): string {
  const serviceNotice =
    "\n\n---\n⚠️ *The AI service is currently unreachable. The advice above is general guidance. " +
    "Once connectivity is restored, I'll be able to give you real-time, personalized analysis. " +
    "Check that your API keys are configured in Settings and your internet connection is working.*";

  if (agentType === "investment") {
    // Check if they mentioned a specific ticker
    const COMMON_WORDS = new Set(["AM","AN","AS","AT","BE","BY","DO","GO","HE","IF","IN","IS","IT","ME","MY","NO","OF","ON","OR","SO","TO","UP","US","WE","THE","AND","FOR","ARE","BUT","NOT","YOU","ALL","CAN","HER","WAS","ONE","OUR","OUT"]);
    const tickerMatch = query.match(/\b[A-Z]{2,5}\b/g);
    const tickers = tickerMatch ? tickerMatch.filter((t) => !COMMON_WORDS.has(t)) : [];

    if (tickers.length > 0) {
      return (
        `I'm unable to pull live data for **${tickers.join(", ")}** right now, but here's what I'd normally analyze for you:\n\n` +
        "**My standard analysis framework:**\n" +
        "1. **Price Action** — Current price vs. 52-week range, recent trend direction\n" +
        "2. **Fundamentals** — P/E ratio, revenue growth, profit margins, debt levels\n" +
        "3. **Technical Signals** — 20-day and 50-day moving averages, support/resistance levels\n" +
        "4. **Sentiment** — What the broader market is doing (SPY, QQQ) and sector rotation patterns\n\n" +
        "**While you wait, here's a quick checklist:**\n" +
        "• Check the stock's earnings date — avoid buying right before earnings if you're risk-averse\n" +
        "• Look at the sector trend — is the sector in favor or rotating out?\n" +
        "• Never invest more than you can afford to lose in any single position\n\n" +
        "Once I'm back online, just ask me again and I'll pull live data with a full bull/bear/base case analysis." +
        serviceNotice
      );
    }

    // Vague investment query — give proactive general market guidance
    return (
      "While I can't pull live market data right now, here's my standing guidance for smart investing:\n\n" +
      "**Current Market Awareness (General Principles):**\n" +
      "• **Diversification is king** — Don't put all your eggs in one basket. A balanced mix of stocks, bonds, and alternatives reduces risk.\n" +
      "• **Dollar-cost averaging** — If you're unsure about timing, invest a fixed amount regularly. It smooths out volatility.\n" +
      "• **Watch the macro** — Interest rate decisions, inflation data, and employment numbers drive market direction. Keep an eye on Fed announcements.\n\n" +
      "**Sectors to watch (general guidance):**\n" +
      "• **AI & Technology** — The AI revolution is still in early innings. Look at companies with real revenue, not just hype.\n" +
      "• **Energy transition** — Solar, EVs, and battery storage continue to have strong government tailwinds.\n" +
      "• **Healthcare/Biotech** — Aging populations globally create steady demand.\n\n" +
      "**Red flags to avoid:**\n" +
      "• Stocks that have run up 500%+ with no earnings\n" +
      "• \"Hot tips\" from social media without your own due diligence\n" +
      "• FOMO — the best trades are the patient ones\n\n" +
      "Once I'm back online, I'll be able to give you real-time analysis with live market data, sentiment readings, and specific recommendations." +
      serviceNotice
    );
  }

  if (agentType === "research") {
    return (
      "I can't access live market data right now, but here are high-opportunity areas worth researching:\n\n" +
      "**Trending Markets & Niches (General Guidance):**\n\n" +
      "1. **AI Infrastructure** — Not just chatbots, but the picks-and-shovels: GPU providers, data centers, AI dev tools, MLOps platforms.\n" +
      "   - Opportunity: High demand, limited supply, enterprise budgets shifting rapidly\n" +
      "   - Risk: Concentration in few players, potential overcapacity\n\n" +
      "2. **Climate Tech & Carbon Markets** — Carbon credits, emission tracking SaaS, green hydrogen, grid-scale storage.\n" +
      "   - Opportunity: Regulatory tailwinds globally, massive TAM\n" +
      "   - Risk: Policy-dependent, long development cycles\n\n" +
      "3. **Creator Economy Tools** — Monetization platforms, AI content tools, audience management.\n" +
      "   - Opportunity: Creator market is growing 20%+ annually\n" +
      "   - Risk: Low switching costs, high competition\n\n" +
      "**How to evaluate any niche:**\n" +
      "• Market size > $1B and growing 15%+ annually\n" +
      "• Clear pain point with willingness to pay\n" +
      "• Fragmented competition (no single dominant player)\n" +
      "• Strong tailwinds (regulatory, demographic, or technological)\n\n" +
      "Once I'm back online, tell me which area interests you and I'll run a full opportunity analysis with scoring." +
      serviceNotice
    );
  }

  // General fallback — Gold Digger AGI voice
  return (
    "**Gold Digger AGI — Offline Mode**\n\n" +
    "Wealth radar is temporarily limited (AI service unreachable), but here's what you should be doing right now:\n\n" +
    "**3 Standing Wealth Principles:**\n" +
    "1. **Don't let cash sit idle** — Every dollar not deployed is losing to inflation. If you have cash reserves beyond 6 months expenses, deploy the rest.\n" +
    "2. **Asymmetric bets > safe bets** — Find opportunities where the downside is capped but the upside is 3-10x. These exist in every market cycle.\n" +
    "3. **Skill-to-cash conversion** — Your highest ROI investment might be yourself. One high-value skill can generate income for decades.\n\n" +
    "**Once I'm back online, I'll deliver:**\n" +
    "• Live investment analysis with real-time data, BUY/SELL/HOLD recommendations, and specific price targets\n" +
    "• Market research with opportunity scoring (0-100) and TAM/SAM/SOM sizing\n" +
    "• Proactive wealth scanning — I'll tell you what you're missing\n\n" +
    "---\n*Check API keys in Settings if this persists.*"
  );
}

/** General chat agent — LLM with personality and emotional context. */
async function generalChatAgent(state: AgentState): Promise<string> {
  const systemPrompt = getAgentPrompt("general");
  const emotionalContext = getEmotionalContext(state.messages);
  const fullSystem = emotionalContext
    ? `${systemPrompt}\n\n${emotionalContext}`
    : systemPrompt;

  const messages: LLMMessage[] = [];

  // Include recent history — adaptive window (last 20 messages, capped at ~6000 chars)
  let charBudget = 6000;
  const historySlice = state.messages.slice(-20);
  for (let i = historySlice.length - 1; i >= 0; i--) {
    const msg = historySlice[i];
    if (charBudget <= 0) break;
    charBudget -= msg.content.length;
    messages.unshift({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // Current query
  messages.push({ role: "user", content: state.query });

  const response = await llmInvoke("premium", messages, fullSystem);
  return addPersonalityWrapper(response, "general");
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
    console.warn("[JARVIS] PII detected — redacting from response");
    state.response = redactPii(state.response);
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

  // Check for PURE greetings — route to general agent with wealth radar active
  // Gold Digger AGI NEVER gives a dead-end greeting. Even "hi" triggers wealth scanning.
  const pureGreetingPattern = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|what'?s?\s+up|yo|sup)[!.?]?$/i;
  const isGreeting = pureGreetingPattern.test(query.trim());

  if (isGreeting && !options.forceAgentType) {
    // Route to general agent — the Gold Digger AGI persona will deliver
    // proactive wealth insights even for casual greetings
    state.agentType = "general";
    state = governorNode(state);
    if (state.stage === "blocked") return endNode(state);

    // Let the LLM handle it with the Gold Digger AGI personality —
    // it will automatically respond with wealth radar output
    console.log("[Gold Digger] Greeting detected — routing to general agent with wealth radar");
    state.response = await generalChatAgent(state);
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
