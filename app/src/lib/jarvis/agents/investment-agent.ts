/**
 * Gold Digger Investment Agent — 6-node analysis pipeline.
 * Ported from jarvis-v4/src/nodes/investment_nodes.py
 *
 * Pipeline:
 *   1. parseInvestmentQuery   — LLM extracts symbol / asset type / timeframe
 *   2. fetchMarketData        — Yahoo Finance chart API (live prices)
 *   3. fundamentalAnalysis    — Yahoo Finance + LLM interpretation
 *   4. technicalAnalysis      — SMA crossover + LLM interpretation
 *   5. sentimentAnalysis      — Market index aggregate + LLM
 *   6. generateRecommendation — Premium LLM synthesizes everything
 *
 * Returns a formatted recommendation string ready for the chat UI.
 */

import { invoke as llmInvoke, getTierForTask, type LLMMessage } from "../llm";
import { getAgentPrompt } from "../personality";
import { getMarketOverview, getSectorPerformance } from "../tools";

// ── Pipeline result types ───────────────────────────

interface ParsedQuery {
  symbol: string;
  assetType: "stock" | "crypto" | "etf" | "forex";
  timeframe: string;
}

interface MarketDataResult {
  currentPrice: number | null;
  priceChange24h: number | null;
  volume: number | null;
  marketCap: number | null;
  peRatio: number | null;
  high52w: number | null;
  low52w: number | null;
  sma20: number | null;
  sma50: number | null;
  trend: "uptrend" | "downtrend" | "sideways";
  dataSource: "live" | "unavailable";
}

interface FundamentalResult {
  companyName: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  revenue: number | null;
  profitMargin: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  earningsGrowth: number | null;
  analystRecommendation: string | null;
  targetPrice: number | null;
  summary: string;
}

interface TechnicalResult {
  currentPrice: number | null;
  trend: string;
  sma20: number | null;
  sma50: number | null;
  high52w: number | null;
  low52w: number | null;
  interpretation: string;
}

interface SentimentResult {
  overallSentiment: "bullish" | "bearish" | "neutral";
  bullishIndices: number;
  bearishIndices: number;
  indexData: Record<string, { priceChange: number; direction: string }>;
  interpretation: string;
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
      console.warn("[Gold Digger] JSON extraction failed, using fallback:", err instanceof Error ? err.message : err);
      return fallback;
    }
    throw err;
  }
}

/** Format a number as currency. */
function fmtCurrency(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "N/A";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a number as percentage. */
function fmtPercent(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// ── Node 1: Parse investment query ──────────────────

async function parseInvestmentQuery(query: string): Promise<ParsedQuery> {
  console.log("[Gold Digger] Node 1: Parsing investment query");

  const systemPrompt = `You are an investment query parser. Extract investment parameters from user queries.

Return a JSON object with exactly these fields:
- symbol: The ticker symbol in UPPERCASE (e.g., "AAPL", "BTC")
- asset_type: One of "stock", "crypto", "etf", or "forex"
- timeframe: One of "1d", "1w", "1m", "3m", "6m", "1y", "5y", or "all"

Only return valid JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: "user", content: `Extract investment parameters from this query: ${query}` },
  ];

  const tier = getTierForTask("parse_query");
  const response = await llmInvoke(tier, messages, systemPrompt);

  // Use safe fallback to avoid crashing the pipeline on parse failure
  // Ticker regex: 2-5 uppercase letters, excluding common English words
  const COMMON_WORDS = new Set(["AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "HE", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US", "WE", "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "HAS", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "GET", "HIM", "LET", "SAY", "SHE", "TOO", "USE"]);
  const tickerMatches = query.match(/\b([A-Z]{2,5})\b/g);
  const fallbackTicker = tickerMatches?.find((t) => !COMMON_WORDS.has(t)) || "SPY";

  const parsed = extractJson(response, {
    symbol: fallbackTicker,
    asset_type: "stock",
    timeframe: "1y",
  });

  const result: ParsedQuery = {
    symbol: ((parsed.symbol as string) || "SPY").toUpperCase(),
    assetType: ((parsed.asset_type as string) || "stock").toLowerCase() as ParsedQuery["assetType"],
    timeframe: (parsed.timeframe as string) || "1y",
  };

  console.log(`[Gold Digger] Parsed: ${result.symbol} (${result.assetType}) — ${result.timeframe}`);
  return result;
}

// ── Node 2: Fetch market data (Yahoo Finance) ───────

async function fetchMarketData(
  symbol: string,
  assetType: string,
  timeframe: string
): Promise<MarketDataResult> {
  console.log(`[Gold Digger] Node 2: Fetching market data for ${symbol}`);

  const rangeMap: Record<string, string> = {
    "1d": "5d", "1w": "1mo", "1m": "3mo", "3m": "6mo",
    "6m": "1y", "1y": "2y", "5y": "5y", "all": "max",
  };
  const range = rangeMap[timeframe] || "1y";
  const fetchSymbol = assetType === "crypto" ? `${symbol}-USD` : symbol;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(fetchSymbol)}?range=${range}&interval=1d`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDigger/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn(`[Gold Digger] Yahoo Finance returned HTTP ${res.status} for ${fetchSymbol}`);
      throw new Error(`Yahoo Finance API ${res.status} for ${fetchSymbol}`);
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Yahoo Finance returned non-JSON response for ${fetchSymbol}`);
    }

    const chartResult = data?.chart?.result?.[0];
    if (!chartResult) throw new Error("No chart result data");

    const meta = chartResult.meta ?? {};
    const closes: (number | null)[] = chartResult.indicators?.quote?.[0]?.close ?? [];
    const volumes: (number | null)[] = chartResult.indicators?.quote?.[0]?.volume ?? [];

    const validCloses = closes.filter((c): c is number => c !== null);
    if (validCloses.length === 0) throw new Error("No valid price data");

    const currentPrice = meta.regularMarketPrice ?? validCloses[validCloses.length - 1];
    const previousClose =
      meta.previousClose ??
      (validCloses.length > 1 ? validCloses[validCloses.length - 2] : currentPrice);
    const priceChange24h = previousClose
      ? +((currentPrice - previousClose) / previousClose * 100).toFixed(2)
      : 0;

    const validVolumes = volumes.filter((v): v is number => v !== null);
    const volume = validVolumes.length > 0 ? validVolumes[validVolumes.length - 1] : null;

    // 52-week range (last 252 trading days)
    const yearSlice = validCloses.slice(-252);
    const high52w = Math.max(...yearSlice);
    const low52w = Math.min(...yearSlice);

    // Simple moving averages
    const sma20slice = validCloses.slice(-20);
    const sma50slice = validCloses.slice(-50);
    const sma20 = sma20slice.reduce((a, b) => a + b, 0) / sma20slice.length;
    const sma50 =
      sma50slice.length > 0
        ? sma50slice.reduce((a, b) => a + b, 0) / sma50slice.length
        : sma20;

    let trend: MarketDataResult["trend"] = "sideways";
    if (sma20 > sma50) trend = "uptrend";
    else if (sma20 < sma50) trend = "downtrend";

    console.log(
      `[Gold Digger] Live data: ${fetchSymbol} @ ${fmtCurrency(currentPrice)} (${trend})`
    );

    return {
      currentPrice: +currentPrice.toFixed(2),
      priceChange24h,
      volume,
      marketCap: meta.marketCap ?? null,
      peRatio: null, // Not in chart API
      high52w: +high52w.toFixed(2),
      low52w: +low52w.toFixed(2),
      sma20: +sma20.toFixed(2),
      sma50: +sma50.toFixed(2),
      trend,
      dataSource: "live",
    };
  } catch (err) {
    console.warn(
      `[Gold Digger] Market data unavailable for ${fetchSymbol}:`,
      err instanceof Error ? err.message : err
    );

    // Graceful degradation — pipeline continues with LLM knowledge
    return {
      currentPrice: null,
      priceChange24h: null,
      volume: null,
      marketCap: null,
      peRatio: null,
      high52w: null,
      low52w: null,
      sma20: null,
      sma50: null,
      trend: "sideways",
      dataSource: "unavailable",
    };
  }
}

// ── Node 3: Fundamental analysis ────────────────────

async function fundamentalAnalysis(
  symbol: string,
  assetType: string,
  marketData: MarketDataResult
): Promise<FundamentalResult | null> {
  // Skip for crypto and forex — no traditional fundamentals
  if (assetType !== "stock" && assetType !== "etf") {
    console.log(`[Gold Digger] Node 3: Skipping fundamentals for ${assetType}`);
    return null;
  }

  console.log(`[Gold Digger] Node 3: Fundamental analysis for ${symbol}`);

  // Try fetching additional fundamentals from Yahoo quoteSummary
  let fundamentalData: Record<string, unknown> = {
    companyName: symbol,
    sector: null,
    industry: null,
    marketCap: marketData.marketCap,
    revenue: null,
    profitMargin: null,
    debtToEquity: null,
    returnOnEquity: null,
    earningsGrowth: null,
    analystRecommendation: null,
    targetPrice: null,
  };

  try {
    const modules = "assetProfile,financialData,defaultKeyStatistics";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDigger/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const json = await res.json();
      const qr = json?.quoteSummary?.result?.[0] ?? {};
      const profile = qr.assetProfile ?? {};
      const fin = qr.financialData ?? {};

      fundamentalData = {
        companyName: profile.longName ?? symbol,
        sector: profile.sector ?? null,
        industry: profile.industry ?? null,
        marketCap: fin.totalRevenue?.raw ?? marketData.marketCap,
        revenue: fin.totalRevenue?.raw ?? null,
        profitMargin: fin.profitMargins?.raw ?? null,
        debtToEquity: fin.debtToEquity?.raw ?? null,
        returnOnEquity: fin.returnOnEquity?.raw ?? null,
        earningsGrowth: fin.earningsGrowth?.raw ?? null,
        analystRecommendation: fin.recommendationKey ?? null,
        targetPrice: fin.targetMeanPrice?.raw ?? null,
      };
    }
  } catch {
    // quoteSummary failed — continue with defaults + LLM knowledge
    console.warn("[Gold Digger] quoteSummary unavailable, using LLM analysis");
  }

  // LLM interpretation (STANDARD tier)
  const systemPrompt = `You are a financial analyst. Provide a brief 2-3 sentence interpretation of fundamental metrics.
Focus on investment implications. Be concise and professional.`;

  const messages: LLMMessage[] = [
    {
      role: "user",
      content: `Interpret these fundamental metrics for ${symbol}:\n${JSON.stringify(fundamentalData, null, 2)}`,
    },
  ];

  const tier = getTierForTask("interpret_fundamentals");
  const summary = await llmInvoke(tier, messages, systemPrompt);

  return {
    companyName: fundamentalData.companyName as string,
    sector: fundamentalData.sector as string | null,
    industry: fundamentalData.industry as string | null,
    marketCap: fundamentalData.marketCap as number | null,
    revenue: fundamentalData.revenue as number | null,
    profitMargin: fundamentalData.profitMargin as number | null,
    debtToEquity: fundamentalData.debtToEquity as number | null,
    returnOnEquity: fundamentalData.returnOnEquity as number | null,
    earningsGrowth: fundamentalData.earningsGrowth as number | null,
    analystRecommendation: fundamentalData.analystRecommendation as string | null,
    targetPrice: fundamentalData.targetPrice as number | null,
    summary,
  };
}

// ── Node 4: Technical analysis ──────────────────────

async function technicalAnalysis(
  symbol: string,
  marketData: MarketDataResult
): Promise<TechnicalResult> {
  console.log(`[Gold Digger] Node 4: Technical analysis for ${symbol}`);

  const technicalData = {
    current_price: marketData.currentPrice,
    trend: marketData.trend,
    sma_20: marketData.sma20,
    sma_50: marketData.sma50,
    "52_week_high": marketData.high52w,
    "52_week_low": marketData.low52w,
  };

  const systemPrompt = `You are a technical analyst. Provide a brief technical interpretation (2-3 sentences).
Analyze the trend and moving averages. Focus on actionable insights.`;

  const messages: LLMMessage[] = [
    {
      role: "user",
      content: `Interpret this technical data for ${symbol}:\n${JSON.stringify(technicalData, null, 2)}`,
    },
  ];

  const tier = getTierForTask("interpret_technicals");
  const interpretation = await llmInvoke(tier, messages, systemPrompt);

  return {
    currentPrice: marketData.currentPrice,
    trend: marketData.trend,
    sma20: marketData.sma20,
    sma50: marketData.sma50,
    high52w: marketData.high52w,
    low52w: marketData.low52w,
    interpretation,
  };
}

// ── Node 5: Sentiment analysis ──────────────────────

async function sentimentAnalysis(
  symbol: string,
  assetType: string
): Promise<SentimentResult> {
  console.log(`[Gold Digger] Node 5: Sentiment analysis for ${symbol}`);

  // Fetch major index data for overall market sentiment
  const indices = ["SPY", "QQQ", "DIA", "IWM"];
  const indexData: Record<string, { priceChange: number; direction: string }> = {};

  await Promise.all(
    indices.map(async (idx) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${idx}?range=2d&interval=1d`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; GoldDigger/1.0)" },
          signal: AbortSignal.timeout(8_000),
        });

        if (!res.ok) return;

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta ?? {};
        const change = meta.regularMarketPrice && meta.previousClose
          ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100)
          : 0;

        indexData[idx] = {
          priceChange: +change.toFixed(2),
          direction: change > 0 ? "bullish" : "bearish",
        };
      } catch {
        // Skip this index on failure
      }
    })
  );

  // Aggregate
  const bullishCount = Object.values(indexData).filter((v) => v.direction === "bullish").length;
  const bearishCount = Object.values(indexData).filter((v) => v.direction === "bearish").length;

  let overallSentiment: SentimentResult["overallSentiment"] = "neutral";
  if (bullishCount > bearishCount) overallSentiment = "bullish";
  else if (bearishCount > bullishCount) overallSentiment = "bearish";

  // LLM interpretation (STANDARD tier)
  const systemPrompt = `You are a market sentiment analyst. Analyze the overall market sentiment for a ${assetType}.
Provide a brief 2-3 sentence interpretation of market conditions and how they affect ${symbol}.`;

  const messages: LLMMessage[] = [
    {
      role: "user",
      content: `Current market sentiment data:\n${JSON.stringify(indexData, null, 2)}\n\nAsset: ${symbol} (${assetType})`,
    },
  ];

  const tier = getTierForTask("interpret_sentiment");
  const interpretation = await llmInvoke(tier, messages, systemPrompt);

  return {
    overallSentiment,
    bullishIndices: bullishCount,
    bearishIndices: bearishCount,
    indexData,
    interpretation,
  };
}

// ── Node 6: Generate recommendation ─────────────────

async function generateRecommendation(
  symbol: string,
  assetType: string,
  marketData: MarketDataResult,
  fundamentals: FundamentalResult | null,
  technical: TechnicalResult,
  sentiment: SentimentResult
): Promise<{ formatted: string; recommendation: Record<string, unknown> }> {
  console.log(`[Gold Digger] Node 6: Generating recommendation for ${symbol}`);

  // Enrich with broader market context from market tools
  let marketContext: Record<string, unknown> = {};
  try {
    const [overview, sectors] = await Promise.all([
      getMarketOverview(),
      getSectorPerformance(),
    ]);

    if (!("error" in overview)) {
      marketContext = {
        marketSentiment: overview.sentiment,
        vixLevel: overview.vixLevel,
        fearGreedEstimate: overview.fearGreedEstimate,
        topSector: ("topSector" in sectors) ? (sectors as any).topSector : null,
        weakestSector: ("weakestSector" in sectors) ? (sectors as any).weakestSector : null,
      };
    }
  } catch {
    console.warn("[Gold Digger] Market context enrichment failed — continuing without it");
  }

  const analysisSummary = {
    symbol,
    asset_type: assetType,
    market_data: marketData,
    fundamental_analysis: fundamentals,
    technical_analysis: technical,
    market_sentiment: sentiment,
    broader_market: Object.keys(marketContext).length > 0 ? marketContext : undefined,
  };

  const systemPrompt =
    getAgentPrompt("investment") +
    `

TASK: Generate a detailed investment recommendation using the DAILY RADAR format.

Return ONLY a valid JSON object with these fields:
- action: "BUY", "SELL", "HOLD", or "AVOID"
- confidence: number between 0 and 100
- position_type: "LONG", "SHORT", or "NONE"
- timeframe: "SHORT_TERM", "MEDIUM_TERM", or "LONG_TERM"
- entry_price: suggested entry price (float) — be SPECIFIC based on current data
- stop_loss: suggested stop-loss price (float) — calculate based on key support levels
- take_profit: suggested take-profit price (float) — calculate based on resistance levels or targets
- risk_level: "LOW", "MEDIUM", or "HIGH"
- signal: 1-2 sentence summary of what's happening with this asset RIGHT NOW (price action, trend, catalyst)
- opportunity: 1-2 sentences on how to profit from this (the trade setup, the edge)
- reasoning: 2-3 sentence explanation — be direct, candid, and insightful. Include the bull AND bear case
- risk_warning: 1-2 sentences on what could go wrong — specific scenarios, not generic warnings
- key_factors: list of 3-4 main factors affecting recommendation
- action_today: ONE specific, executable thing the user can do RIGHT NOW

Be specific with prices based on current market data. Quantify the risk/reward ratio.
${marketData.dataSource === "unavailable" ? "\nIMPORTANT: Live market data is currently unavailable. Use your best knowledge for price estimates but clearly note they may be outdated." : ""}`;

  const messages: LLMMessage[] = [
    {
      role: "user",
      content: `Generate investment recommendation for this analysis:\n${JSON.stringify(analysisSummary, null, 2)}`,
    },
  ];

  const tier = getTierForTask("generate_recommendation");
  const response = await llmInvoke(tier, messages, systemPrompt);

  // Use safe fallback for recommendation parsing
  const recommendation = extractJson(response, {
    action: "HOLD",
    confidence: 50,
    position_type: "NONE",
    timeframe: "MEDIUM_TERM",
    entry_price: marketData.dataSource === "live" ? marketData.currentPrice : null,
    stop_loss: null,
    take_profit: null,
    risk_level: "HIGH",
    reasoning: response.slice(0, 300), // Use raw LLM text as reasoning if JSON fails
    key_factors: ["Analysis data was partially available"],
  });

  // Fill in any missing fields with defaults (don't crash on incomplete LLM output)
  const defaults: Record<string, unknown> = {
    action: "HOLD", confidence: 50, position_type: "NONE", timeframe: "MEDIUM_TERM",
    entry_price: marketData.dataSource === "live" ? marketData.currentPrice : null, stop_loss: null, take_profit: null,
    risk_level: "MEDIUM", reasoning: "Insufficient data for detailed reasoning",
    key_factors: [],
  };
  for (const [key, val] of Object.entries(defaults)) {
    if (recommendation[key] === undefined || recommendation[key] === null) {
      recommendation[key] = val;
    }
  }

  // Build formatted output — Daily Radar format
  const lines: string[] = [];

  lines.push(`**${recommendation.action} ${symbol.toUpperCase()}** — Confidence: ${recommendation.confidence}%`);
  lines.push("");

  // Signal
  if (recommendation.signal) {
    lines.push(`**SIGNAL:** ${recommendation.signal}`);
  } else if (marketData.dataSource === "live") {
    lines.push(`**SIGNAL:** ${symbol} trading at ${fmtCurrency(marketData.currentPrice)} (${fmtPercent(marketData.priceChange24h)} today), ${marketData.trend}`);
  }
  lines.push("");

  // Opportunity
  if (recommendation.opportunity) {
    lines.push(`**OPPORTUNITY:** ${recommendation.opportunity}`);
  }
  lines.push("");

  // Core recommendation
  lines.push("**TRADE SETUP:**");
  lines.push(`Position: ${recommendation.position_type} | Timeframe: ${recommendation.timeframe} | Risk: ${recommendation.risk_level}`);
  lines.push(`Entry: ${fmtCurrency(recommendation.entry_price as number)} | Stop Loss: ${fmtCurrency(recommendation.stop_loss as number)} | Take Profit: ${fmtCurrency(recommendation.take_profit as number)}`);

  // Risk/reward calculation
  const entry = recommendation.entry_price as number;
  const stopLoss = recommendation.stop_loss as number;
  const takeProfit = recommendation.take_profit as number;
  if (entry && stopLoss && takeProfit && entry > 0 && stopLoss > 0 && takeProfit > 0) {
    const riskAmount = Math.abs(entry - stopLoss);
    const rewardAmount = Math.abs(takeProfit - entry);
    const ratio = riskAmount > 0 ? (rewardAmount / riskAmount).toFixed(1) : "N/A";
    lines.push(`Risk/Reward Ratio: 1:${ratio}`);
  }
  lines.push("");

  // Reasoning (bull + bear case)
  lines.push(`**ANALYSIS:** ${recommendation.reasoning}`);
  lines.push("");

  // Key factors
  const keyFactors = Array.isArray(recommendation.key_factors) ? recommendation.key_factors : [];
  if (keyFactors.length > 0) {
    lines.push("**KEY FACTORS:**");
    for (const factor of keyFactors) {
      if (typeof factor === "string") lines.push(`• ${factor}`);
    }
    lines.push("");
  }

  // Risk warning
  if (recommendation.risk_warning) {
    lines.push(`**RISK:** ${recommendation.risk_warning}`);
    lines.push("");
  }

  // Action today
  if (recommendation.action_today) {
    lines.push(`**ACTION TODAY:** ${recommendation.action_today}`);
    lines.push("");
  }

  // Supporting analysis
  lines.push("---");
  lines.push("");

  if (fundamentals?.summary) {
    lines.push(`**Fundamentals:** ${fundamentals.summary}`);
    lines.push("");
  }

  lines.push(`**Technicals:** ${technical.interpretation}`);
  lines.push("");
  lines.push(`**Sentiment:** ${sentiment.interpretation}`);
  lines.push("");

  // Market data footer
  if (marketData.dataSource === "live") {
    lines.push("---");
    lines.push(`Live Data: ${fmtCurrency(marketData.currentPrice)} | ${fmtPercent(marketData.priceChange24h)} today | ${marketData.trend.toUpperCase()}`);
    lines.push(`SMA-20: ${fmtCurrency(marketData.sma20)} | SMA-50: ${fmtCurrency(marketData.sma50)} | 52W: ${fmtCurrency(marketData.low52w)}–${fmtCurrency(marketData.high52w)}`);
  } else {
    lines.push("---");
    lines.push("⚠ Live market data was unavailable. Price targets are estimates — verify before acting.");
  }

  lines.push("");
  lines.push(
    "*Not financial advice. Past performance ≠ future results. Always do your own research.*"
  );

  return { formatted: lines.join("\n"), recommendation };
}

// ── Main pipeline ───────────────────────────────────

/**
 * Run the full 6-node investment analysis pipeline.
 *
 * @param query    — User's investment query (e.g., "Analyze AAPL stock")
 * @param history  — Conversation history (used for context)
 * @returns        — Formatted recommendation string
 */
export async function runInvestmentPipeline(
  query: string,
  history: Array<{ role: string; content: string }> = []
): Promise<string> {
  console.log("[Gold Digger] Starting investment pipeline");

  try {
    // Node 1: Parse
    const parsed = await parseInvestmentQuery(query);

    // Node 2: Fetch live market data
    const marketData = await fetchMarketData(
      parsed.symbol,
      parsed.assetType,
      parsed.timeframe
    );

    // Node 3: Fundamental analysis (stocks/ETFs only)
    const fundamentals = await fundamentalAnalysis(
      parsed.symbol,
      parsed.assetType,
      marketData
    );

    // Node 4: Technical analysis
    const technical = await technicalAnalysis(parsed.symbol, marketData);

    // Node 5: Sentiment analysis
    const sentiment = await sentimentAnalysis(parsed.symbol, parsed.assetType);

    // Node 6: Generate recommendation
    const result = await generateRecommendation(
      parsed.symbol,
      parsed.assetType,
      marketData,
      fundamentals,
      technical,
      sentiment
    );

    console.log(
      `[Gold Digger] Pipeline complete: ${parsed.symbol} → ${result.recommendation.action} (${result.recommendation.confidence}% confidence)`
    );

    return result.formatted;
  } catch (err) {
    console.error("[Gold Digger] Investment pipeline error:", err);

    // Graceful fallback: use the general agent with investment context
    const systemPrompt =
      getAgentPrompt("investment") +
      "\n\nThe automated pipeline encountered an error. Provide the best investment analysis you can based on your training knowledge. Be honest about not having live data.";

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
      "\n\n---\nNote: Live market analysis was unavailable. This response is based on general knowledge.\n" +
      "Disclaimer: This is analysis only, not financial advice."
    );
  }
}
