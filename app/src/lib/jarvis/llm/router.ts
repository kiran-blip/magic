/**
 * Multi-tier LLM Router — routes tasks to the most cost-effective model.
 * Ported from jarvis-v4/src/llm/router.py + task_classifier.py
 *
 * Tier 1 (LIGHT)    → Cheap fast model          ~$0.0001/call
 * Tier 2 (STANDARD) → Mid-tier reasoning         ~$0.001/call
 * Tier 3 (PREMIUM)  → Best available model        ~$0.003/call
 *
 * OpenRouter-only: All tiers go through OpenRouter.
 * Anthropic-only:  All tiers use Claude directly.
 * Hybrid:          Light/Standard → OpenRouter, Premium → Anthropic.
 */

// ── Model tiers ──────────────────────────────────────

export const ModelTier = {
  LIGHT: "light",
  STANDARD: "standard",
  PREMIUM: "premium",
} as const;
export type ModelTier = (typeof ModelTier)[keyof typeof ModelTier];

/** Model names for Anthropic direct API. */
const ANTHROPIC_MODELS: Record<ModelTier, string> = {
  light: "claude-haiku-4-5-20251001",
  standard: "claude-sonnet-4-5-20250929",
  premium: "claude-sonnet-4-5-20250929",
};

/**
 * Default model names for OpenRouter API (requires provider/ prefix).
 * Light = fast & cheap, Standard = mid-tier reasoning, Premium = best quality.
 */
const OPENROUTER_MODELS: Record<ModelTier, string> = {
  light: "meta-llama/llama-3.1-8b-instruct",
  standard: "meta-llama/llama-3.1-70b-instruct",
  premium: "anthropic/claude-sonnet-4.5",
};

/**
 * Default models used in config resolution.
 * These are the defaults if no override is provided.
 */
const DEFAULT_MODELS: Record<ModelTier, string> = {
  light: "meta-llama/llama-3.1-8b-instruct",
  standard: "meta-llama/llama-3.1-70b-instruct",
  premium: "anthropic/claude-sonnet-4.5",
};

const TIER_FALLBACK_CHAIN: ModelTier[] = ["light", "standard", "premium"];

// ── Task → Tier mapping ──────────────────────────────

const TASK_TIER_MAP: Record<string, ModelTier> = {
  // LIGHT — fast extraction and classification
  parse_query: "light",
  extract_parameters: "light",
  classify_intent: "light",
  identify_niche: "light",
  extract_entities: "light",
  validate_input: "light",

  // STANDARD — interpretation and reasoning
  interpret_fundamentals: "standard",
  interpret_technicals: "standard",
  interpret_sentiment: "standard",
  analyze_trends: "standard",
  analyze_competition: "standard",
  estimate_market_size: "standard",
  identify_pain_points: "standard",
  summarize: "standard",
  generate_insights: "standard",
  process_data: "standard",

  // PREMIUM — complex reasoning and final decisions
  generate_recommendation: "premium",
  verify_output: "premium",
  generate_research_recommendations: "premium",
  supervisor_routing: "premium",
  general_chat: "premium",
  make_decision: "premium",
  final_analysis: "premium",
};

const ESTIMATED_COSTS: Record<ModelTier, number> = {
  light: 0.0001,
  standard: 0.001,
  premium: 0.003,
};

/** Get the recommended model tier for a task. */
export function getTierForTask(
  taskName: string,
  fallback: ModelTier = "standard"
): ModelTier {
  return TASK_TIER_MAP[taskName] ?? fallback;
}

/** Estimate cost savings vs. all-PREMIUM. */
export function estimateSavings(taskName: string): number {
  const tier = getTierForTask(taskName);
  return +(ESTIMATED_COSTS.premium - ESTIMATED_COSTS[tier]).toFixed(6);
}

// ── Router ───────────────────────────────────────────

export type RoutingMode =
  | "hybrid"
  | "openrouter_only"
  | "anthropic_only"
  | "none";

export interface RouterConfig {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  lightModel?: string;
  standardModel?: string;
  premiumModel?: string;
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Invoke an LLM with the appropriate tier.
 *
 * Handles routing + fallback:
 *  - If OpenRouter + Anthropic keys → hybrid mode
 *  - If only Anthropic → Claude for everything
 *  - If only OpenRouter → OpenRouter for everything
 *  - Falls up the tier chain on failure
 */
export async function invoke(
  tier: ModelTier,
  messages: LLMMessage[],
  systemPrompt?: string,
  config?: RouterConfig
): Promise<string> {
  const cfg = resolveConfig(config);
  const mode = getRoutingMode(cfg);

  if (mode === "none") {
    throw new Error(
      "No LLM API keys configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY."
    );
  }

  let currentTier = tier;
  const triedTiers: ModelTier[] = [];
  let lastError: unknown;

  while (true) {
    triedTiers.push(currentTier);

    try {
      const useAnthropic =
        mode === "anthropic_only" ||
        (mode === "hybrid" && currentTier === "premium");

      if (useAnthropic) {
        return await callAnthropic(messages, systemPrompt, cfg);
      } else {
        return await callOpenRouter(
          currentTier,
          messages,
          systemPrompt,
          cfg
        );
      }
    } catch (err) {
      lastError = err;
      const tierIndex = TIER_FALLBACK_CHAIN.indexOf(currentTier);

      // If not at the end of the chain, escalate to next tier
      if (tierIndex >= 0 && tierIndex < TIER_FALLBACK_CHAIN.length - 1) {
        currentTier = TIER_FALLBACK_CHAIN[tierIndex + 1];
        console.warn(
          `[Gold Digger Router] ${triedTiers.at(-1)} failed, falling back to ${currentTier}`
        );
        continue;
      }

      // If premium failed in hybrid mode, try OpenRouter as last resort
      if (mode === "hybrid" && currentTier === "premium" && cfg.openrouterApiKey) {
        try {
          console.warn("[Gold Digger Router] Premium Anthropic failed, trying OpenRouter premium model");
          return await callOpenRouter("premium", messages, systemPrompt, cfg);
        } catch {
          // Both failed
        }
      }

      // If OpenRouter failed, try Anthropic as last resort
      if (mode === "hybrid" && currentTier !== "premium" && cfg.anthropicApiKey) {
        try {
          console.warn("[Gold Digger Router] OpenRouter failed, trying Anthropic as fallback");
          return await callAnthropic(messages, systemPrompt, cfg);
        } catch {
          // Both failed
        }
      }

      const rawMsg = lastError instanceof Error ? lastError.message : String(lastError);
      const userMsg = rawMsg.includes("abort") || rawMsg.includes("timeout")
        ? "Request timed out — the AI model took too long to respond"
        : rawMsg.includes("fetch failed")
          ? "Could not connect to the AI service — check your internet connection and API keys"
          : rawMsg;
      throw new Error(
        `All LLM tiers failed (tried: ${triedTiers.join(", ")}). ${userMsg}`
      );
    }
  }
}

// ── Provider calls ───────────────────────────────────

async function callAnthropic(
  messages: LLMMessage[],
  systemPrompt: string | undefined,
  cfg: ResolvedConfig
): Promise<string> {
  const apiMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  // Anthropic API doesn't use provider/ prefix — strip it if present
  let model = cfg.models.premium;
  if (model.includes("/")) {
    model = model.split("/").pop() ?? model;
  }
  // If the model isn't a Claude model, fall back to the Anthropic default
  if (!model.startsWith("claude-")) {
    model = ANTHROPIC_MODELS.premium;
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: apiMessages,
  };

  // Combine system prompts
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  if (systemPrompt) systemParts.unshift(systemPrompt);
  if (systemParts.length > 0) {
    body.system = systemParts.join("\n\n");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.anthropicApiKey!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlocks = (data.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "");

  return textBlocks.join("\n");
}

async function callOpenRouter(
  tier: ModelTier,
  messages: LLMMessage[],
  systemPrompt: string | undefined,
  cfg: ResolvedConfig
): Promise<string> {
  // Resolve the model name for OpenRouter
  let model = cfg.models[tier];

  // If the model doesn't have a provider/ prefix, it needs one for OpenRouter
  if (!model.includes("/")) {
    model = OPENROUTER_MODELS[tier] ?? `anthropic/${model}`;
  }

  console.log(`[Gold Digger Router] OpenRouter call: tier=${tier}, model=${model}`);

  const apiMessages: LLMMessage[] = [];
  if (systemPrompt) {
    apiMessages.push({ role: "system", content: systemPrompt });
  }
  apiMessages.push(...messages);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.openrouterApiKey}`,
      "HTTP-Referer": "https://gold-digger.app",
      "X-Title": "Gold Digger",
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  let content = message?.content;

  // Handle reasoning models (e.g., kimi-k2.5) that return empty content
  // with the actual response in the reasoning field
  if (!content && message?.reasoning) {
    const reasoning = typeof message.reasoning === "string"
      ? message.reasoning
      : message.reasoning_details?.[0]?.text ?? message.reasoning?.text ?? "";
    if (reasoning) {
      console.warn("[Gold Digger Router] Content empty, using reasoning field as fallback");
      content = reasoning;
    }
  }

  if (!content && data.error) {
    throw new Error(`OpenRouter error: ${data.error.message ?? JSON.stringify(data.error)}`);
  }

  return content ?? "";
}

// ── Config resolution ────────────────────────────────

interface ResolvedConfig {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  models: Record<ModelTier, string>;
}

/**
 * Resolve config by checking (in order):
 *   1. Explicitly passed RouterConfig
 *   2. Gold Digger config file (data/golddigger-config.json)
 *   3. Environment variables
 *   4. Defaults
 */
function resolveConfig(config?: RouterConfig): ResolvedConfig {
  // Try to load from Gold Digger settings file
  let savedAnthropicKey: string | undefined;
  let savedOpenrouterKey: string | undefined;
  let savedModels: Partial<Record<ModelTier, string>> | undefined;

  try {
    // Dynamic require to avoid bundling issues in client code
    const { loadConfig } = require("../config/settings");
    const gdConfig = loadConfig();
    savedAnthropicKey = gdConfig.anthropicApiKey || undefined;
    savedOpenrouterKey = gdConfig.openrouterApiKey || undefined;

    // Load custom model overrides from config if present
    if (gdConfig.models) {
      savedModels = gdConfig.models;
    }
  } catch {
    // Config module not available (e.g., in edge runtime) — skip
  }

  return {
    anthropicApiKey:
      config?.anthropicApiKey ?? savedAnthropicKey ?? process.env.ANTHROPIC_API_KEY,
    openrouterApiKey:
      config?.openrouterApiKey ?? savedOpenrouterKey ?? process.env.OPENROUTER_API_KEY,
    models: {
      light:
        config?.lightModel ?? savedModels?.light ?? process.env.GOLDDIGGER_MODEL_LIGHT ?? DEFAULT_MODELS.light,
      standard:
        config?.standardModel ?? savedModels?.standard ?? process.env.GOLDDIGGER_MODEL_STANDARD ?? DEFAULT_MODELS.standard,
      premium:
        config?.premiumModel ?? savedModels?.premium ?? process.env.GOLDDIGGER_MODEL_PREMIUM ?? DEFAULT_MODELS.premium,
    },
  };
}

function getRoutingMode(cfg: ResolvedConfig): RoutingMode {
  const hasOpenRouter = !!cfg.openrouterApiKey;
  const hasAnthropic = !!cfg.anthropicApiKey;

  if (hasOpenRouter && hasAnthropic) return "hybrid";
  if (hasOpenRouter) return "openrouter_only";
  if (hasAnthropic) return "anthropic_only";
  return "none";
}

// ── Exports for cost tracking ────────────────────────

export { ESTIMATED_COSTS, TASK_TIER_MAP, DEFAULT_MODELS, OPENROUTER_MODELS, ANTHROPIC_MODELS };
