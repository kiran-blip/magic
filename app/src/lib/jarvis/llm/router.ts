/**
 * Multi-tier LLM Router — routes tasks to the most cost-effective model.
 * Ported from jarvis-v4/src/llm/router.py + task_classifier.py
 *
 * Tier 1 (LIGHT)    → OpenRouter cheap model     ~$0.0001/call
 * Tier 2 (STANDARD) → OpenRouter mid-tier         ~$0.001/call
 * Tier 3 (PREMIUM)  → Anthropic Claude Sonnet     ~$0.01/call
 *
 * In Magic's context, we call the Anthropic SDK directly (no LangChain).
 */

// ── Model tiers ──────────────────────────────────────

export const ModelTier = {
  LIGHT: "light",
  STANDARD: "standard",
  PREMIUM: "premium",
} as const;
export type ModelTier = (typeof ModelTier)[keyof typeof ModelTier];

const DEFAULT_MODELS: Record<ModelTier, string> = {
  light: "meta-llama/llama-3.1-8b-instruct",
  standard: "meta-llama/llama-3.1-70b-instruct",
  premium: "claude-sonnet-4-20250514",
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
  premium: 0.01,
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
      const tierIndex = TIER_FALLBACK_CHAIN.indexOf(currentTier);
      if (tierIndex < TIER_FALLBACK_CHAIN.length - 1) {
        currentTier = TIER_FALLBACK_CHAIN[tierIndex + 1];
        console.warn(
          `[JARVIS Router] ${triedTiers.at(-1)} failed, falling back to ${currentTier}`
        );
      } else {
        throw new Error(
          `All LLM tiers failed (tried: ${triedTiers.join(", ")}). Last error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
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

  const body: Record<string, unknown> = {
    model: cfg.models.premium,
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
  const model = cfg.models[tier];

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
      "HTTP-Referer": "https://jarvis-agi.local",
      "X-Title": "Gold Digger",
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Config resolution ────────────────────────────────

interface ResolvedConfig {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  models: Record<ModelTier, string>;
}

function resolveConfig(config?: RouterConfig): ResolvedConfig {
  return {
    anthropicApiKey:
      config?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    openrouterApiKey:
      config?.openrouterApiKey ?? process.env.OPENROUTER_API_KEY,
    models: {
      light:
        config?.lightModel ?? DEFAULT_MODELS.light,
      standard:
        config?.standardModel ?? DEFAULT_MODELS.standard,
      premium:
        config?.premiumModel ?? DEFAULT_MODELS.premium,
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

export { ESTIMATED_COSTS, TASK_TIER_MAP, DEFAULT_MODELS };
