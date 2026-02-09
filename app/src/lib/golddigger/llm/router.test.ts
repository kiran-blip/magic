import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getTierForTask,
  estimateSavings,
  invoke,
  ModelTier,
  RouterConfig,
  LLMMessage,
  ESTIMATED_COSTS,
  TASK_TIER_MAP,
  DEFAULT_MODELS,
  OPENROUTER_MODELS,
  ANTHROPIC_MODELS,
} from "./router";

// Mock fetch
global.fetch = vi.fn();

describe("LLM Router - Tier Classification", () => {
  it("should classify extraction tasks as LIGHT tier", () => {
    const lightTasks = [
      "parse_query",
      "extract_parameters",
      "classify_intent",
      "identify_niche",
      "extract_entities",
      "validate_input",
    ];

    for (const task of lightTasks) {
      const tier = getTierForTask(task);
      expect(tier).toBe("light");
    }
  });

  it("should classify reasoning tasks as STANDARD tier", () => {
    const standardTasks = [
      "interpret_fundamentals",
      "interpret_technicals",
      "interpret_sentiment",
      "analyze_trends",
      "analyze_competition",
      "estimate_market_size",
      "identify_pain_points",
      "summarize",
      "generate_insights",
      "process_data",
    ];

    for (const task of standardTasks) {
      const tier = getTierForTask(task);
      expect(tier).toBe("standard");
    }
  });

  it("should classify decision tasks as PREMIUM tier", () => {
    const premiumTasks = [
      "generate_recommendation",
      "verify_output",
      "generate_research_recommendations",
      "supervisor_routing",
      "general_chat",
      "make_decision",
      "final_analysis",
    ];

    for (const task of premiumTasks) {
      const tier = getTierForTask(task);
      expect(tier).toBe("premium");
    }
  });

  it("should return fallback tier for unknown tasks", () => {
    const tier = getTierForTask("unknown_task");
    expect(tier).toBe("standard"); // default fallback

    const customFallback = getTierForTask("unknown_task", "premium");
    expect(customFallback).toBe("premium");
  });

  it("should respect explicit fallback parameter", () => {
    const tier = getTierForTask("nonexistent", "light");
    expect(tier).toBe("light");
  });
});

describe("LLM Router - Cost Estimation", () => {
  it("should estimate savings for LIGHT tasks", () => {
    const savings = estimateSavings("parse_query");
    const expectedSavings = ESTIMATED_COSTS.premium - ESTIMATED_COSTS.light;
    expect(savings).toBeCloseTo(expectedSavings, 5);
  });

  it("should estimate savings for STANDARD tasks", () => {
    const savings = estimateSavings("analyze_trends");
    const expectedSavings = ESTIMATED_COSTS.premium - ESTIMATED_COSTS.standard;
    expect(savings).toBeCloseTo(expectedSavings, 5);
  });

  it("should estimate zero savings for PREMIUM tasks", () => {
    const savings = estimateSavings("generate_recommendation");
    expect(savings).toBe(0);
  });

  it("should return positive savings values", () => {
    expect(ESTIMATED_COSTS.light).toBeLessThan(ESTIMATED_COSTS.standard);
    expect(ESTIMATED_COSTS.standard).toBeLessThan(ESTIMATED_COSTS.premium);
  });
});

describe("LLM Router - Constants", () => {
  it("should have defined cost estimates for all tiers", () => {
    expect(ESTIMATED_COSTS.light).toBeDefined();
    expect(ESTIMATED_COSTS.standard).toBeDefined();
    expect(ESTIMATED_COSTS.premium).toBeDefined();

    expect(ESTIMATED_COSTS.light).toBeGreaterThanOrEqual(0);
    expect(ESTIMATED_COSTS.standard).toBeGreaterThanOrEqual(0);
    expect(ESTIMATED_COSTS.premium).toBeGreaterThanOrEqual(0);
  });

  it("should have task tier mappings for common tasks", () => {
    expect(TASK_TIER_MAP["parse_query"]).toBe("light");
    expect(TASK_TIER_MAP["analyze_trends"]).toBe("standard");
    expect(TASK_TIER_MAP["generate_recommendation"]).toBe("premium");
  });

  it("should have default models defined", () => {
    expect(DEFAULT_MODELS.light).toBeDefined();
    expect(DEFAULT_MODELS.standard).toBeDefined();
    expect(DEFAULT_MODELS.premium).toBeDefined();
  });

  it("should have OpenRouter models with provider prefix", () => {
    expect(OPENROUTER_MODELS.light).toContain("/");
    expect(OPENROUTER_MODELS.standard).toContain("/");
    expect(OPENROUTER_MODELS.premium).toContain("/");
  });

  it("should have Anthropic models with claude prefix", () => {
    expect(ANTHROPIC_MODELS.light).toContain("claude");
    expect(ANTHROPIC_MODELS.standard).toContain("claude");
    expect(ANTHROPIC_MODELS.premium).toContain("claude");
  });
});

describe("LLM Router - Anthropic API Calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call Anthropic API with correct structure", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Response text" }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = await invoke("light", messages, undefined, {
      anthropicApiKey: "test-key",
    });

    expect(result).toBe("Response text");
    expect(fetch).toHaveBeenCalled();

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain("api.anthropic.com");
    expect(call[1]?.method).toBe("POST");
    expect(call[1]?.headers).toHaveProperty("x-api-key");
  });

  it("should handle Anthropic error responses", async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: async () => "Invalid API key",
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    try {
      await invoke("premium", messages, undefined, {
        anthropicApiKey: "invalid-key",
      });
      expect.fail("Should have thrown error");
    } catch (error) {
      expect((error as Error).message).toContain("API");
    }
  });

  it("should include system prompt in Anthropic request", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Response" }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await invoke("light", messages, "You are helpful", {
      anthropicApiKey: "test-key",
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.system).toContain("You are helpful");
  });

  it("should strip provider prefix from non-Claude models for Anthropic", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Response" }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await invoke("light", messages, undefined, {
      anthropicApiKey: "test-key",
      lightModel: "openai/gpt-4", // Non-Claude model
    });

    // Should use Anthropic's default for light tier since model isn't Claude
    expect(fetch).toHaveBeenCalled();
  });
});

describe("LLM Router - OpenRouter API Calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should call OpenRouter API with correct structure", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Response text" } }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = await invoke("light", messages, undefined, {
      openrouterApiKey: "test-key",
    });

    expect(result).toBe("Response text");
    expect(fetch).toHaveBeenCalled();

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain("openrouter.ai");
    expect(call[1]?.method).toBe("POST");
    expect(call[1]?.headers).toHaveProperty("Authorization");
  });

  it("should handle OpenRouter error responses", async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      text: async () => "Invalid request",
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    try {
      await invoke("light", messages, undefined, {
        openrouterApiKey: "test-key",
      });
      expect.fail("Should have thrown error");
    } catch (error) {
      expect((error as Error).message).toContain("OpenRouter");
    }
  });

  it("should add provider prefix if model lacks it for OpenRouter", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Response" } }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await invoke("light", messages, undefined, {
      openrouterApiKey: "test-key",
      lightModel: "gpt-4", // No provider prefix
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.model).toContain("/"); // Should have provider prefix
  });

  it("should handle OpenRouter reasoning models fallback", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              reasoning: "This is the reasoning field",
            },
          },
        ],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = await invoke("standard", messages, undefined, {
      openrouterApiKey: "test-key",
    });

    // Should use reasoning field as fallback
    expect(result).toContain("reasoning");
  });

  it("should include system prompt in OpenRouter request", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Response" } }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await invoke("light", messages, "You are helpful", {
      openrouterApiKey: "test-key",
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("helpful");
  });
});

describe("LLM Router - Hybrid Mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    process.env.OPENROUTER_API_KEY = "openrouter-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should use Anthropic for PREMIUM tier in hybrid mode", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Response" }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await invoke("premium", messages, undefined, {
      anthropicApiKey: "anthropic-key",
      openrouterApiKey: "openrouter-key",
    });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain("api.anthropic.com");
  });

  it("should use OpenRouter for LIGHT and STANDARD tiers in hybrid mode", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Response" } }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await invoke("light", messages, undefined, {
      anthropicApiKey: "anthropic-key",
      openrouterApiKey: "openrouter-key",
    });

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call[0]).toContain("openrouter.ai");
  });
});

describe("LLM Router - Fallback Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should escalate to next tier on failure", async () => {
    // First call fails, second succeeds
    const failResponse = {
      ok: false,
      status: 500,
      text: async () => "Server error",
    };

    const successResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Success on fallback" }],
      }),
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(failResponse as any)
      .mockResolvedValueOnce(successResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = await invoke("light", messages, undefined, {
      anthropicApiKey: "test-key",
    });

    // Should eventually succeed with fallback
    expect(result).toBe("Success on fallback");
    expect(fetch).toHaveBeenCalledTimes(2); // Tried twice
  });

  it("should throw error when all tiers fail", async () => {
    const failResponse = {
      ok: false,
      status: 500,
      text: async () => "Server error",
    };

    vi.mocked(fetch).mockResolvedValue(failResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    try {
      await invoke("light", messages, undefined, {
        anthropicApiKey: "test-key",
      });
      expect.fail("Should have thrown error");
    } catch (error) {
      expect((error as Error).message).toContain("All LLM tiers failed");
    }
  });

  it("should throw error when no API keys configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    try {
      await invoke("light", messages, undefined, {});
      expect.fail("Should have thrown error");
    } catch (error) {
      expect((error as Error).message).toContain("No LLM API keys");
    }
  });
});

describe("LLM Router - Message Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should filter system messages for Anthropic API", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Response" }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
    ];

    await invoke("light", messages, undefined, {
      anthropicApiKey: "test-key",
    });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]?.body as string);

    // System messages should be moved to system field, not in messages array
    expect(body.messages.filter((m: any) => m.role === "system")).toHaveLength(
      0
    );
    expect(body.system).toContain("helpful");
  });

  it("should handle multiple text blocks in Anthropic response", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "First block" },
          { type: "text", text: "Second block" },
        ],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = await invoke("light", messages, undefined, {
      anthropicApiKey: "test-key",
    });

    expect(result).toContain("First block");
    expect(result).toContain("Second block");
  });

  it("should handle empty content in responses", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: null }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const result = await invoke("light", messages, undefined, {
      anthropicApiKey: "test-key",
    });

    expect(typeof result).toBe("string");
  });
});

describe("LLM Router - Config Resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it("should use config parameter values first", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Response" }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    const config: RouterConfig = {
      anthropicApiKey: "explicit-key",
    };

    await invoke("light", messages, undefined, config);

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as any;
    expect(headers["x-api-key"]).toBe("explicit-key");
  });

  it("should use environment variables as fallback", async () => {
    process.env.ANTHROPIC_API_KEY = "env-key";

    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Response" }],
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as any);

    const messages: LLMMessage[] = [
      { role: "user", content: "Hello" },
    ];

    await invoke("light", messages, undefined, {});

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = call[1]?.headers as any;
    expect(headers["x-api-key"]).toBe("env-key");
  });
});
