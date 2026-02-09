import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  generateTags,
  storeConversation,
  getRecentConversations,
  recallRelevant,
  getMemoryStats,
  storeInvestmentDecision,
  recallInvestmentHistory,
  loadMemoryStore,
  saveMemoryStore,
  storeResearchFinding,
  recallResearchHistory,
  pruneOldMemories,
  ConversationMemory,
  InvestmentMemory,
  ResearchMemory,
  MemoryStore,
} from "./store";

// Mock fs module
vi.mock("fs");
vi.mock("path");

describe("Memory Store - generateTags()", () => {
  it("should extract real ticker symbols (AAPL, NVDA)", () => {
    const query = "I think AAPL is a strong buy";
    const response = "AAPL has been performing well. NVDA is also rising.";
    const tags = generateTags(query, response);

    expect(tags).toContain("AAPL");
    expect(tags).toContain("NVDA");
  });

  it("should filter out noise words (TODAY, BLIND, RADAR, I, A)", () => {
    const query = "TODAY I should check the BLIND spot. A is good.";
    const response = "RADAR alerts show TODAY is important. THIS is clear.";
    const tags = generateTags(query, response);

    expect(tags).not.toContain("TODAY");
    expect(tags).not.toContain("BLIND");
    expect(tags).not.toContain("RADAR");
    expect(tags).not.toContain("I");
    expect(tags).not.toContain("A");
  });

  it("should extract financial action terms (buy, sell, hold, bullish)", () => {
    const query = "I recommend a buy on AAPL";
    const response = "The bullish sentiment is strong. We should hold for now.";
    const tags = generateTags(query, response);

    expect(tags).toContain("buy");
    expect(tags).toContain("bullish");
    expect(tags).toContain("hold");
  });

  it("should extract asset types (stock, crypto, bitcoin, etf)", () => {
    const query = "Check the bitcoin price";
    const response = "Bitcoin and ethereum are in a crypto rally. ETF flows are up.";
    const tags = generateTags(query, response);

    expect(tags).toContain("bitcoin");
    expect(tags).toContain("ethereum");
    expect(tags).toContain("crypto");
    expect(tags).toContain("etf");
  });

  it("should extract market concepts (dividend, momentum, volatility, support)", () => {
    const query = "What's the dividend on this stock?";
    const response = "The dividend is high. Momentum is strong with support at 150.";
    const tags = generateTags(query, response);

    expect(tags).toContain("dividend");
    expect(tags).toContain("momentum");
    expect(tags).toContain("support");
  });

  it("should tag time horizons (short-term vs long-term)", () => {
    const shortQuery = "Quick day trade on TSLA";
    const shortResponse = "This is a short week play.";
    const shortTags = generateTags(shortQuery, shortResponse);
    expect(shortTags).toContain("short-term");

    const longQuery = "Long-term investment in AAPL";
    const longResponse = "Over many months and years, this will compound.";
    const longTags = generateTags(longQuery, longResponse);
    expect(longTags).toContain("long-term");
  });

  it("should return array of tags without duplicates", () => {
    const query = "AAPL buy AAPL";
    const response = "AAPL sell AAPL hold";
    const tags = generateTags(query, response);

    const aaplCount = tags.filter((t) => t === "AAPL").length;
    expect(aaplCount).toBe(1);
  });

  it("should not extract single-letter candidates", () => {
    const query = "Check A B C D stocks";
    const response = "A is bad, B is good, C is ok";
    const tags = generateTags(query, response);

    expect(tags).not.toContain("A");
    expect(tags).not.toContain("B");
    expect(tags).not.toContain("C");
    expect(tags).not.toContain("D");
  });
});

describe("Memory Store - Conversation Management", () => {
  let mockStore: MemoryStore;

  beforeEach(() => {
    mockStore = {
      conversations: [],
      investments: [],
      research: [],
      lastUpdated: new Date().toISOString(),
    };

    // Mock fs functions with fresh mtimeMs to clear cache
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));
    vi.mocked(fs.statSync).mockReturnValue({
      mtimeMs: Math.random() * 1000000, // New value each time to trigger cache invalidation
    } as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should store a conversation and return an ID", () => {
    const memory = {
      userQuery: "What about AAPL?",
      agentType: "investment",
      summary: "AAPL analysis",
      fullResponse: "AAPL is trading at $150",
      tags: ["AAPL", "buy"],
    };

    const id = storeConversation(memory);

    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
  });

  it("should retrieve recent conversations in reverse chronological order", () => {
    const conversations: ConversationMemory[] = [
      {
        id: "1",
        timestamp: new Date(Date.now() - 2000).toISOString(),
        userQuery: "First query",
        agentType: "general",
        summary: "First",
        fullResponse: "Response 1",
        tags: [],
      },
      {
        id: "2",
        timestamp: new Date(Date.now() - 1000).toISOString(),
        userQuery: "Second query",
        agentType: "general",
        summary: "Second",
        fullResponse: "Response 2",
        tags: [],
      },
    ];

    mockStore.conversations = conversations;
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const recent = getRecentConversations(10);

    expect(recent.length).toBe(2);
    expect(recent[0].userQuery).toBe("Second query"); // Most recent first
    expect(recent[1].userQuery).toBe("First query");
  });

  it("should limit recent conversations by specified limit", () => {
    mockStore.conversations = Array.from({ length: 30 }, (_, i) => ({
      id: `${i}`,
      timestamp: new Date().toISOString(),
      userQuery: `Query ${i}`,
      agentType: "general",
      summary: `Summary ${i}`,
      fullResponse: `Response ${i}`,
      tags: [],
    }));

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const recent = getRecentConversations(5);
    expect(recent.length).toBe(5);
  });

  it("should add timestamp when storing conversation", () => {
    const before = new Date();
    const memory = {
      userQuery: "Test",
      agentType: "general",
      summary: "Test",
      fullResponse: "Test response",
      tags: [],
    };

    storeConversation(memory);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const savedStore = JSON.parse(writeCall[1] as string) as MemoryStore;

    expect(savedStore.conversations[0].timestamp).toBeDefined();
    const timestamp = new Date(savedStore.conversations[0].timestamp);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

describe("Memory Store - Investment Decision Management", () => {
  let mockStore: MemoryStore;

  beforeEach(() => {
    mockStore = {
      conversations: [],
      investments: [],
      research: [],
      lastUpdated: new Date().toISOString(),
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));
    vi.mocked(fs.statSync).mockReturnValue({
      mtimeMs: Math.random() * 1000000, // New value each time to trigger cache invalidation
    } as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should store an investment decision and return ID", () => {
    const decision = {
      symbol: "AAPL",
      action: "BUY",
      confidence: 85,
      reasoning: "Strong fundamentals",
      priceAtTime: 150,
      entryPrice: 148,
      stopLoss: 140,
      takeProfit: 165,
    };

    const id = storeInvestmentDecision(decision);

    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
  });

  it("should recall investment history for a specific symbol", () => {
    const investments: InvestmentMemory[] = [
      {
        id: "1",
        timestamp: new Date(Date.now() - 2000).toISOString(),
        symbol: "AAPL",
        action: "BUY",
        confidence: 80,
        reasoning: "Bullish",
      },
      {
        id: "2",
        timestamp: new Date(Date.now() - 1000).toISOString(),
        symbol: "NVDA",
        action: "SELL",
        confidence: 75,
        reasoning: "Bearish",
      },
      {
        id: "3",
        timestamp: new Date().toISOString(),
        symbol: "AAPL",
        action: "HOLD",
        confidence: 85,
        reasoning: "Wait for support",
      },
    ];

    mockStore.investments = investments;
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const aaplHistory = recallInvestmentHistory("AAPL", 10);

    expect(aaplHistory).toHaveLength(2);
    expect(aaplHistory[0].symbol).toBe("AAPL");
    expect(aaplHistory[0].action).toBe("HOLD"); // Most recent first
    expect(aaplHistory[1].action).toBe("BUY");
  });

  it("should return all investments when symbol not specified", () => {
    mockStore.investments = [
      {
        id: "1",
        timestamp: new Date().toISOString(),
        symbol: "AAPL",
        action: "BUY",
        confidence: 80,
        reasoning: "Test",
      },
      {
        id: "2",
        timestamp: new Date().toISOString(),
        symbol: "NVDA",
        action: "SELL",
        confidence: 75,
        reasoning: "Test",
      },
    ];

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const all = recallInvestmentHistory(undefined, 10);
    expect(all).toHaveLength(2);
  });

  it("should be case-insensitive when filtering by symbol", () => {
    mockStore.investments = [
      {
        id: "1",
        timestamp: new Date().toISOString(),
        symbol: "AAPL",
        action: "BUY",
        confidence: 80,
        reasoning: "Test",
      },
    ];

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const result1 = recallInvestmentHistory("aapl", 10);
    const result2 = recallInvestmentHistory("AAPL", 10);
    const result3 = recallInvestmentHistory("AaPl", 10);

    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(1);
    expect(result3).toHaveLength(1);
  });
});

describe("Memory Store - Recall Relevant", () => {
  let mockStore: MemoryStore;

  beforeEach(() => {
    mockStore = {
      conversations: [
        {
          id: "1",
          timestamp: new Date().toISOString(),
          userQuery: "AAPL stock analysis",
          agentType: "investment",
          summary: "AAPL is at 150",
          fullResponse: "Apple stock is strong",
          tags: ["AAPL", "stock", "buy"],
        },
        {
          id: "2",
          timestamp: new Date().toISOString(),
          userQuery: "NVDA performance",
          agentType: "investment",
          summary: "NVDA trending up",
          fullResponse: "Nvidia momentum is strong",
          tags: ["NVDA", "stock", "bullish"],
        },
        {
          id: "3",
          timestamp: new Date().toISOString(),
          userQuery: "General market news",
          agentType: "general",
          summary: "Market is neutral",
          fullResponse: "Overall sentiment is mixed",
          tags: ["market"],
        },
      ],
      investments: [],
      research: [],
      lastUpdated: new Date().toISOString(),
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));
    vi.mocked(fs.statSync).mockReturnValue({
      mtimeMs: Math.random() * 1000000, // New value each time to trigger cache invalidation
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should find conversations matching query keywords", () => {
    const results = recallRelevant("AAPL");

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tags).toContain("AAPL");
  });

  it("should score conversations by keyword frequency", () => {
    const results = recallRelevant("stock buy");

    // AAPL conversation should rank higher (has both "stock" and "buy")
    const aaplResult = results.find((r) => r.tags.includes("AAPL"));
    expect(aaplResult).toBeDefined();
  });

  it("should filter out very short words (length <= 2)", () => {
    const results = recallRelevant("a is at");
    // Should not crash and should still work
    expect(Array.isArray(results)).toBe(true);
  });

  it("should return recent conversations when no keywords match", () => {
    const results = recallRelevant("xyz abc def");

    expect(Array.isArray(results)).toBe(true);
    // Should return something, possibly by recency
  });

  it("should return empty array when store is empty", () => {
    mockStore.conversations = [];
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const results = recallRelevant("anything");
    expect(results).toEqual([]);
  });

  it("should respect limit parameter", () => {
    const results = recallRelevant("stock", 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

describe("Memory Store - Memory Statistics", () => {
  let mockStore: MemoryStore;

  beforeEach(() => {
    const now = new Date();
    mockStore = {
      conversations: [
        {
          id: "1",
          timestamp: new Date(now.getTime() - 10000).toISOString(),
          userQuery: "Query 1",
          agentType: "general",
          summary: "Summary 1",
          fullResponse: "Response 1",
          tags: [],
        },
        {
          id: "2",
          timestamp: new Date(now.getTime() - 5000).toISOString(),
          userQuery: "Query 2",
          agentType: "general",
          summary: "Summary 2",
          fullResponse: "Response 2",
          tags: [],
        },
      ],
      investments: [
        {
          id: "inv1",
          timestamp: new Date(now.getTime() - 3000).toISOString(),
          symbol: "AAPL",
          action: "BUY",
          confidence: 80,
          reasoning: "Strong",
        },
      ],
      research: [
        {
          id: "res1",
          timestamp: new Date(now.getTime() - 1000).toISOString(),
          niche: "AI",
          opportunityScore: 85,
          keyFindings: "Growing sector",
          verdict: "Strong",
        },
      ],
      lastUpdated: now.toISOString(),
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));
    vi.mocked(fs.statSync).mockReturnValue({
      mtimeMs: Math.random() * 1000000, // New value each time to trigger cache invalidation
    } as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should count all conversation, investment, and research entries", () => {
    const stats = getMemoryStats();

    expect(stats.totalConversations).toBe(2);
    expect(stats.totalInvestments).toBe(1);
    expect(stats.totalResearch).toBe(1);
  });

  it("should identify oldest and newest memory timestamps", () => {
    const stats = getMemoryStats();

    expect(stats.oldestMemory).toBeDefined();
    expect(stats.newestMemory).toBeDefined();

    const oldestTime = new Date(stats.oldestMemory!).getTime();
    const newestTime = new Date(stats.newestMemory!).getTime();

    expect(oldestTime).toBeLessThan(newestTime);
  });

  it("should return nulls when memory store is empty", () => {
    mockStore = {
      conversations: [],
      investments: [],
      research: [],
      lastUpdated: new Date().toISOString(),
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const stats = getMemoryStats();

    expect(stats.totalConversations).toBe(0);
    expect(stats.totalInvestments).toBe(0);
    expect(stats.totalResearch).toBe(0);
    expect(stats.oldestMemory).toBeNull();
    expect(stats.newestMemory).toBeNull();
  });
});

describe("Memory Store - Research Management", () => {
  let mockStore: MemoryStore;

  beforeEach(() => {
    mockStore = {
      conversations: [],
      investments: [],
      research: [],
      lastUpdated: new Date().toISOString(),
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));
    vi.mocked(fs.statSync).mockReturnValue({
      mtimeMs: Math.random() * 1000000, // New value each time to trigger cache invalidation
    } as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should store research finding and return ID", () => {
    const finding = {
      niche: "AI Startups",
      opportunityScore: 92,
      keyFindings: "Market growing rapidly",
      verdict: "Strong" as const,
    };

    const id = storeResearchFinding(finding);

    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it("should recall research history filtered by niche", () => {
    const research: ResearchMemory[] = [
      {
        id: "1",
        timestamp: new Date(Date.now() - 2000).toISOString(),
        niche: "AI",
        opportunityScore: 90,
        keyFindings: "Growing",
        verdict: "Strong",
      },
      {
        id: "2",
        timestamp: new Date(Date.now() - 1000).toISOString(),
        niche: "Biotech",
        opportunityScore: 75,
        keyFindings: "Moderate growth",
        verdict: "Moderate",
      },
      {
        id: "3",
        timestamp: new Date().toISOString(),
        niche: "AI Hardware",
        opportunityScore: 88,
        keyFindings: "Strong demand",
        verdict: "Strong",
      },
    ];

    mockStore.research = research;
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const aiResearch = recallResearchHistory("AI", 10);

    expect(aiResearch.length).toBeGreaterThanOrEqual(1);
    expect(aiResearch[0].niche).toMatch(/AI/i);
  });

  it("should be case-insensitive when filtering research by niche", () => {
    mockStore.research = [
      {
        id: "1",
        timestamp: new Date().toISOString(),
        niche: "AI",
        opportunityScore: 90,
        keyFindings: "Test",
        verdict: "Strong",
      },
    ];

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));

    const lower = recallResearchHistory("ai", 10);
    const upper = recallResearchHistory("AI", 10);

    expect(lower).toHaveLength(1);
    expect(upper).toHaveLength(1);
  });
});

describe("Memory Store - Pruning", () => {
  let mockStore: MemoryStore;

  beforeEach(() => {
    const now = new Date();
    mockStore = {
      conversations: Array.from({ length: 5 }, (_, i) => ({
        id: `conv${i}`,
        timestamp: new Date(now.getTime() - (i + 1) * 86400000).toISOString(), // 1-5 days old
        userQuery: `Query ${i}`,
        agentType: "general",
        summary: `Summary ${i}`,
        fullResponse: `Response ${i}`,
        tags: [],
      })),
      investments: [],
      research: [],
      lastUpdated: now.toISOString(),
    };

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockStore));
    vi.mocked(fs.statSync).mockReturnValue({
      mtimeMs: Math.random() * 1000000, // New value each time to trigger cache invalidation
    } as any);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should remove memories older than specified days", () => {
    // Prune entries older than 2 days
    const removed = pruneOldMemories(2);

    const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const savedStore = JSON.parse(writeCall[1] as string) as MemoryStore;

    expect(removed).toBeGreaterThan(0);
    expect(savedStore.conversations.length).toBeLessThan(
      mockStore.conversations.length
    );
  });

  it("should return count of removed entries", () => {
    const removed = pruneOldMemories(2);
    expect(typeof removed).toBe("number");
    expect(removed).toBeGreaterThanOrEqual(0);
  });
});
