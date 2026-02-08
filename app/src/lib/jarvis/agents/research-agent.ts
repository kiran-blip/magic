/**
 * Gold Digger Research Agent — 7-node market research pipeline.
 * Ported from jarvis-v4/src/nodes/research_nodes.py
 *
 * Pipeline:
 *   1. identifyNiche              — LLM extracts niche / depth
 *   2. analyzeTrends              — LLM analyzes growth & opportunities
 *   3. analyzeCompetition         — LLM maps competitive landscape
 *   4. estimateMarketSize         — LLM estimates TAM / SAM / SOM
 *   5. identifyPainPoints         — LLM surfaces customer pain points
 *   6. calculateOpportunityScore  — Algorithm (v3 scoring, no LLM)
 *   7. generateRecommendations    — Premium LLM produces strategic report
 *
 * Returns a formatted research report string ready for the chat UI.
 */

import { invoke as llmInvoke, getTierForTask, type LLMMessage } from "../llm";
import { getAgentPrompt } from "../personality";

// ── Pipeline result types ───────────────────────────

interface NicheResult {
  niche: string;
  depth: "quick" | "standard" | "deep";
  queryUnderstood: boolean;
}

interface TrendsResult {
  growthRate: "growing" | "stable" | "declining";
  seasonality: "high" | "moderate" | "low";
  keyTrends: string[];
  emergingOpportunities: string[];
}

interface CompetitionResult {
  competitionLevel: "low" | "medium" | "high";
  marketLeaders: string[];
  barriersToEntry: string[];
  differentiationOpportunities: string[];
}

interface MarketSizeResult {
  estimatedTam: string;
  estimatedSam: string;
  estimatedSom: string;
  confidenceLevel: "high" | "medium" | "low";
  dataSourcesNote: string;
}

interface PainPointsResult {
  painPoints: string[];
  severityAssessment: string;
  targetAudience: string[];
}

interface OpportunityScoreResult {
  score: number;
  tier: "strong" | "moderate" | "weak";
  calculationNotes: {
    base: number;
    growthAdjustment: number;
    competitionAdjustment: number;
    painPointsAdjustment: number;
  };
}

// ── Helpers ─────────────────────────────────────────

/**
 * Extract JSON from an LLM response that might include markdown fences.
 * Returns a fallback object instead of crashing if parsing fails.
 */
function extractJson(raw: string, fallback?: Record<string, unknown>): Record<string, unknown> {
  try {
    const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      if (fallback) return fallback;
      throw new Error("No JSON object found in LLM response");
    }
    return JSON.parse(match[0]);
  } catch (err) {
    if (fallback) {
      console.warn("[Gold Digger] Research JSON extraction failed, using fallback:", err instanceof Error ? err.message : err);
      return fallback;
    }
    throw err;
  }
}

// ── Node 1: Identify niche ──────────────────────────

async function identifyNiche(query: string): Promise<NicheResult> {
  console.log("[Gold Digger] Research Node 1: Identifying niche");

  const systemPrompt = `You are a market research query analyzer. Extract the niche/market/industry from user queries.

Return a JSON object with exactly these fields:
- niche: The market/industry/niche identified (string)
- depth: One of "quick", "standard", or "deep" based on query complexity
- query_understood: boolean indicating if the query is clear

Only return valid JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: "user", content: `Analyze this market research query and extract the niche: ${query}` },
  ];

  const tier = getTierForTask("identify_niche");
  const response = await llmInvoke(tier, messages, systemPrompt);
  const parsed = extractJson(response, {
    niche: query.length > 10 ? query.slice(0, 60) : "General Market",
    depth: "standard",
    query_understood: true,
  });

  const result: NicheResult = {
    niche: (parsed.niche as string) || query.slice(0, 60),
    depth: ((parsed.depth as string) || "standard") as NicheResult["depth"],
    queryUnderstood: parsed.query_understood === true,
  };

  console.log(`[Gold Digger] Niche identified: "${result.niche}" (depth: ${result.depth})`);
  return result;
}

// ── Node 2: Analyze trends ──────────────────────────

async function analyzeTrends(niche: string): Promise<TrendsResult> {
  console.log(`[Gold Digger] Research Node 2: Analyzing trends for "${niche}"`);

  const systemPrompt = `You are a market trends analyst. Analyze trends for a given market niche.

Return a JSON object with exactly these fields:
- growth_rate: One of "growing", "stable", or "declining"
- seasonality: "high", "moderate", or "low"
- key_trends: list of 3-5 current market trends (strings)
- emerging_opportunities: list of 3-5 emerging opportunities (strings)

Base your analysis on current market knowledge. Only return valid JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: "user", content: `Analyze current trends and opportunities in the ${niche} market:` },
  ];

  const tier = getTierForTask("analyze_trends");
  const response = await llmInvoke(tier, messages, systemPrompt);
  const parsed = extractJson(response, {
    growth_rate: "stable", seasonality: "moderate", key_trends: [], emerging_opportunities: [],
  });

  return {
    growthRate: ((parsed.growth_rate as string) || "stable") as TrendsResult["growthRate"],
    seasonality: ((parsed.seasonality as string) || "moderate") as TrendsResult["seasonality"],
    keyTrends: (parsed.key_trends as string[]) || [],
    emergingOpportunities: (parsed.emerging_opportunities as string[]) || [],
  };
}

// ── Node 3: Analyze competition ─────────────────────

async function analyzeCompetition(niche: string): Promise<CompetitionResult> {
  console.log(`[Gold Digger] Research Node 3: Analyzing competition in "${niche}"`);

  const systemPrompt = `You are a competitive intelligence analyst. Analyze the competitive landscape.

Return a JSON object with exactly these fields:
- competition_level: One of "low", "medium", or "high"
- market_leaders: list of 3-5 major competitors/leaders (strings)
- barriers_to_entry: list of 3-5 barriers (strings)
- differentiation_opportunities: list of 3-5 ways to differentiate (strings)

Only return valid JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: "user", content: `Analyze the competitive landscape in the ${niche} market:` },
  ];

  const tier = getTierForTask("analyze_competition");
  const response = await llmInvoke(tier, messages, systemPrompt);
  const parsed = extractJson(response, {
    competition_level: "medium", market_leaders: [], barriers_to_entry: [], differentiation_opportunities: [],
  });

  return {
    competitionLevel: ((parsed.competition_level as string) || "medium") as CompetitionResult["competitionLevel"],
    marketLeaders: (parsed.market_leaders as string[]) || [],
    barriersToEntry: (parsed.barriers_to_entry as string[]) || [],
    differentiationOpportunities: (parsed.differentiation_opportunities as string[]) || [],
  };
}

// ── Node 4: Estimate market size ────────────────────

async function estimateMarketSize(niche: string): Promise<MarketSizeResult> {
  console.log(`[Gold Digger] Research Node 4: Estimating market size for "${niche}"`);

  const systemPrompt = `You are a market sizing analyst. Estimate TAM/SAM/SOM for a market niche.

Return a JSON object with exactly these fields:
- estimated_tam: estimated total addressable market in USD (number or string with estimate)
- estimated_sam: estimated serviceable addressable market in USD (number or string with estimate)
- estimated_som: estimated serviceable obtainable market in USD (number or string with estimate)
- confidence_level: "high", "medium", or "low"
- data_sources_note: brief note on data sources used (string)

Provide realistic estimates. Only return valid JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: "user", content: `Estimate the market size (TAM/SAM/SOM) for the ${niche} market:` },
  ];

  const tier = getTierForTask("estimate_market_size");
  const response = await llmInvoke(tier, messages, systemPrompt);
  const parsed = extractJson(response, {
    estimated_tam: "N/A", estimated_sam: "N/A", estimated_som: "N/A",
    confidence_level: "low", data_sources_note: "Estimates unavailable",
  });

  return {
    estimatedTam: String(parsed.estimated_tam ?? "N/A"),
    estimatedSam: String(parsed.estimated_sam ?? "N/A"),
    estimatedSom: String(parsed.estimated_som ?? "N/A"),
    confidenceLevel: ((parsed.confidence_level as string) || "medium") as MarketSizeResult["confidenceLevel"],
    dataSourcesNote: (parsed.data_sources_note as string) || "",
  };
}

// ── Node 5: Identify pain points ────────────────────

async function identifyPainPoints(niche: string): Promise<PainPointsResult> {
  console.log(`[Gold Digger] Research Node 5: Identifying pain points in "${niche}"`);

  const systemPrompt = `You are a customer research analyst. Identify pain points in a market niche.

Return a JSON object with exactly these fields:
- pain_points: list of 4-7 specific customer pain points (strings)
- severity_assessment: brief assessment of pain point severity (string)
- target_audience: list of 2-4 target audience segments (strings)

Focus on real, addressable pain points. Only return valid JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: "user", content: `Identify the key pain points and target audiences in the ${niche} market:` },
  ];

  const tier = getTierForTask("identify_pain_points");
  const response = await llmInvoke(tier, messages, systemPrompt);
  const parsed = extractJson(response, {
    pain_points: [], severity_assessment: "Unable to assess", target_audience: [],
  });

  return {
    painPoints: (parsed.pain_points as string[]) || [],
    severityAssessment: (parsed.severity_assessment as string) || "",
    targetAudience: (parsed.target_audience as string[]) || [],
  };
}

// ── Node 6: Calculate opportunity score (algorithm) ─

function calculateOpportunityScore(
  trends: TrendsResult,
  competition: CompetitionResult,
  painPoints: PainPointsResult
): OpportunityScoreResult {
  console.log("[Gold Digger] Research Node 6: Calculating opportunity score");

  // v3 algorithm — base 50, adjustments, clamp 0–100
  let score = 50.0;

  // Growth rate adjustment
  let growthAdjustment = 0;
  if (trends.growthRate === "growing") growthAdjustment = 20;
  else if (trends.growthRate === "declining") growthAdjustment = -20;
  score += growthAdjustment;

  // Competition adjustment
  let competitionAdjustment = 0;
  if (competition.competitionLevel === "low") competitionAdjustment = 15;
  else if (competition.competitionLevel === "high") competitionAdjustment = -10;
  score += competitionAdjustment;

  // Pain points adjustment (3 pts each, max 15)
  const painPointCount = painPoints?.painPoints?.length ?? 0;
  const painPointsAdjustment = Math.min(painPointCount * 3, 15);
  score += painPointsAdjustment;

  // Clamp to 0–100
  score = Math.max(0, Math.min(100, score));

  // Tier classification
  let tier: OpportunityScoreResult["tier"];
  if (score >= 70) tier = "strong";
  else if (score >= 40) tier = "moderate";
  else tier = "weak";

  console.log(`[Gold Digger] Opportunity score: ${score}/100 (${tier})`);

  return {
    score,
    tier,
    calculationNotes: {
      base: 50,
      growthAdjustment,
      competitionAdjustment,
      painPointsAdjustment,
    },
  };
}

// ── Node 7: Generate recommendations ────────────────

async function generateRecommendations(
  niche: string,
  trends: TrendsResult,
  competition: CompetitionResult,
  marketSize: MarketSizeResult,
  painPoints: PainPointsResult,
  opportunityScore: OpportunityScoreResult
): Promise<string> {
  console.log(
    `[Gold Digger] Research Node 7: Generating recommendations for "${niche}" (${opportunityScore.tier})`
  );

  const tierContext: Record<string, string> = {
    strong:
      "This is a STRONG market opportunity with high growth potential, manageable competition, and significant addressable pain points.",
    moderate:
      "This is a MODERATE market opportunity with reasonable growth prospects and definable market niches.",
    weak:
      "This is a WEAK market opportunity with limited growth prospects or high competitive barriers.",
  };

  const systemPrompt =
    getAgentPrompt("research") +
    `

TASK: Generate wealth-focused strategic recommendations.

The opportunity tier for this market is: ${opportunityScore.tier.toUpperCase()} (${opportunityScore.score}/100)
Context: ${tierContext[opportunityScore.tier]}

Generate specific, ACTIONABLE recommendations that answer: "How does the user make money from this?"

STRUCTURE YOUR RESPONSE:
1. **Verdict** — One sentence: Is this worth pursuing? Yes/No/Conditional
2. **The Money Play** — The #1 way to profit from this market (invest in it, build for it, or leverage the trend)
3. **Picks & Shovels** — Who profits regardless of which specific company wins?
4. **Entry Strategy** — Specific steps to get started (timeline, capital needed, first moves)
5. **Risk Factors** — What could kill this opportunity (specific, not vague)
6. **30/90/365 Day View** — What to watch and when to act

Every recommendation must tie back to: revenue potential, investment opportunity, or competitive advantage.
Be specific about stocks/ETFs to watch, business models to consider, or skills to develop.
Be concise but comprehensive. No fluff.`;

  const researchSummary = {
    niche,
    score: opportunityScore.score,
    tier: opportunityScore.tier,
    trends,
    competition,
    market_size: marketSize,
    pain_points: painPoints,
  };

  const messages: LLMMessage[] = [
    {
      role: "user",
      content: `Generate strategic recommendations based on this market research:\n${JSON.stringify(researchSummary, null, 2)}`,
    },
  ];

  const tier = getTierForTask("generate_research_recommendations");
  return await llmInvoke(tier, messages, systemPrompt);
}

// ── Format report ───────────────────────────────────

function formatResearchReport(
  niche: string,
  trends: TrendsResult,
  competition: CompetitionResult,
  marketSize: MarketSizeResult,
  painPoints: PainPointsResult,
  opportunityScore: OpportunityScoreResult,
  recommendations: string
): string {
  const divider = "=".repeat(56);
  const lines: string[] = [];

  lines.push(`MARKET RESEARCH REPORT: ${niche.toUpperCase()}`);
  lines.push("");
  lines.push(`OPPORTUNITY SCORE: ${opportunityScore.score}/100 (${opportunityScore.tier.toUpperCase()})`);
  lines.push("");
  lines.push(divider);
  lines.push("");

  // Executive summary
  lines.push("EXECUTIVE SUMMARY");
  lines.push(`Market: ${niche}`);
  lines.push(`Opportunity Tier: ${opportunityScore.tier.toUpperCase()}`);
  lines.push(`Confidence Score: ${opportunityScore.score}/100`);
  lines.push("");
  lines.push(divider);
  lines.push("");

  // Safe array helper — LLM responses could return non-arrays
  const safeArray = (arr: unknown): string[] =>
    Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : [];

  // Trends
  lines.push("MARKET TRENDS");
  lines.push(`Growth Rate: ${trends.growthRate ?? "N/A"}`);
  lines.push(`Seasonality: ${trends.seasonality ?? "N/A"}`);
  lines.push("Key Trends:");
  for (const trend of safeArray(trends.keyTrends)) {
    lines.push(`  • ${trend}`);
  }
  lines.push("Emerging Opportunities:");
  for (const opp of safeArray(trends.emergingOpportunities)) {
    lines.push(`  • ${opp}`);
  }
  lines.push("");

  // Competitive landscape
  lines.push("COMPETITIVE LANDSCAPE");
  lines.push(`Competition Level: ${competition.competitionLevel ?? "N/A"}`);
  lines.push("Market Leaders:");
  for (const leader of safeArray(competition.marketLeaders)) {
    lines.push(`  • ${leader}`);
  }
  lines.push("Barriers to Entry:");
  for (const barrier of safeArray(competition.barriersToEntry)) {
    lines.push(`  • ${barrier}`);
  }
  lines.push("Differentiation Opportunities:");
  for (const diff of safeArray(competition.differentiationOpportunities)) {
    lines.push(`  • ${diff}`);
  }
  lines.push("");

  // Market sizing
  lines.push("MARKET SIZING");
  lines.push(`TAM (Total Addressable Market): ${marketSize.estimatedTam ?? "N/A"}`);
  lines.push(`SAM (Serviceable Addressable Market): ${marketSize.estimatedSam ?? "N/A"}`);
  lines.push(`SOM (Serviceable Obtainable Market): ${marketSize.estimatedSom ?? "N/A"}`);
  lines.push(`Data Confidence: ${marketSize.confidenceLevel ?? "N/A"}`);
  lines.push(`Sources: ${marketSize.dataSourcesNote ?? "N/A"}`);
  lines.push("");

  // Pain points
  lines.push("CUSTOMER PAIN POINTS");
  lines.push("Target Audience Segments:");
  for (const segment of safeArray(painPoints.targetAudience)) {
    lines.push(`  • ${segment}`);
  }
  lines.push("");
  lines.push("Pain Points:");
  for (const pp of safeArray(painPoints.painPoints)) {
    lines.push(`  • ${pp}`);
  }
  lines.push(`Severity: ${painPoints.severityAssessment}`);
  lines.push("");

  // Score breakdown
  lines.push("SCORE BREAKDOWN");
  const notes = opportunityScore.calculationNotes;
  lines.push(`  Base Score:            ${notes.base}`);
  lines.push(`  Growth Adjustment:     ${notes.growthAdjustment >= 0 ? "+" : ""}${notes.growthAdjustment}`);
  lines.push(`  Competition Adjustment: ${notes.competitionAdjustment >= 0 ? "+" : ""}${notes.competitionAdjustment}`);
  lines.push(`  Pain Points Bonus:     +${notes.painPointsAdjustment}`);
  lines.push(`  Final Score:           ${opportunityScore.score}/100`);
  lines.push("");

  // Recommendations
  lines.push("STRATEGIC RECOMMENDATIONS");
  lines.push(recommendations);
  lines.push("");
  lines.push(divider);
  lines.push("");

  // Next steps
  lines.push("NEXT STEPS");
  lines.push("Based on this research, consider:");
  lines.push("  1. Validating key assumptions with customer interviews");
  lines.push("  2. Analyzing specific competitive solutions in detail");
  lines.push("  3. Building a prototype or MVP to test market fit");
  lines.push("  4. Developing a go-to-market strategy");
  lines.push("  5. Assessing resource requirements and timeline");
  lines.push("");
  lines.push(
    "---\n⚠ DATA SOURCE NOTE: This analysis is based on the AI model's training data, " +
    "not live market feeds. Market conditions, company financials, and competitive landscapes " +
    "may have changed since the model's last training update.\n\n" +
    "Disclaimer: This market research is for informational purposes only. " +
    "Always validate findings with primary research and current data sources " +
    "before making business decisions."
  );

  return lines.join("\n");
}

// ── Main pipeline ───────────────────────────────────

/**
 * Run the full 7-node market research pipeline.
 *
 * @param query   — User's research query (e.g., "Research the AI coding tools market")
 * @param history — Conversation history (used for context)
 * @returns       — Formatted research report string
 */
export async function runResearchPipeline(
  query: string,
  history: Array<{ role: string; content: string }> = []
): Promise<string> {
  console.log("[Gold Digger] Starting research pipeline");

  try {
    // Node 1: Identify niche
    const nicheResult = await identifyNiche(query);

    // If niche parsing was uncertain, use the raw query as niche
    // instead of dropping the entire structured pipeline
    if (!nicheResult.queryUnderstood || !nicheResult.niche || nicheResult.niche.toLowerCase().includes("unknown")) {
      const fallbackNiche = query.trim().length > 3
        ? (query.length > 80 ? query.slice(0, 80) : query)
        : "General Market";
      console.warn(`[Gold Digger] Niche unclear — using fallback: "${fallbackNiche}"`);
      nicheResult.niche = fallbackNiche;
      nicheResult.queryUnderstood = true;
    }

    // Node 2: Analyze trends
    const trends = await analyzeTrends(nicheResult.niche);

    // Node 3: Analyze competition
    const competition = await analyzeCompetition(nicheResult.niche);

    // Node 4: Estimate market size
    const marketSize = await estimateMarketSize(nicheResult.niche);

    // Node 5: Identify pain points
    const painPoints = await identifyPainPoints(nicheResult.niche);

    // Node 6: Calculate opportunity score (pure algorithm, no LLM)
    const opportunityScore = calculateOpportunityScore(
      trends,
      competition,
      painPoints
    );

    // Node 7: Generate strategic recommendations
    const recommendations = await generateRecommendations(
      nicheResult.niche,
      trends,
      competition,
      marketSize,
      painPoints,
      opportunityScore
    );

    // Format the full report
    const report = formatResearchReport(
      nicheResult.niche,
      trends,
      competition,
      marketSize,
      painPoints,
      opportunityScore,
      recommendations
    );

    console.log(
      `[Gold Digger] Research pipeline complete: "${nicheResult.niche}" → ${opportunityScore.score}/100 (${opportunityScore.tier})`
    );

    return report;
  } catch (err) {
    console.error("[Gold Digger] Research pipeline error:", err);

    // Graceful fallback: use general research agent with context
    const systemPrompt =
      getAgentPrompt("research") +
      "\n\nThe automated research pipeline encountered an error. Provide the best market research analysis you can based on your training knowledge. Be thorough and structured.";

    const messages: LLMMessage[] = [
      ...history.slice(-5).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: query },
    ];

    const response = await llmInvoke("premium", messages, systemPrompt);
    return (
      response +
      "\n\n---\nNote: The full research pipeline was unavailable. This is a general analysis based on AI training data only.\n" +
      "Disclaimer: This market research is for informational purposes only. Always validate with current data sources."
    );
  }
}
