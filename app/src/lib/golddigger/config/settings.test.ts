import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  loadConfig,
  saveConfig,
  updateConfig,
  getPublicConfig,
  isSetupComplete,
  resolveRoutingMode,
  isFilesystemWritable,
  resetFsCache,
  type GoldDiggerConfig,
} from "./settings";

// ── Env-var isolation ───────────────────────────────────

const ENV_KEYS = [
  "GOLDDIGGER_DATA_DIR",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GOLDDIGGER_ROUTING",
  "GOLDDIGGER_DISCLAIMERS",
  "GOLDDIGGER_SAFETY",
  "GOLDDIGGER_PERSONALITY",
] as const;

const envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  ENV_KEYS.forEach((k) => {
    envBackup[k] = process.env[k];
  });
});

afterEach(() => {
  Object.entries(envBackup).forEach(([k, v]) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  });
  resetFsCache();
});

// ── Helpers ─────────────────────────────────────────────

/** Create a fresh temp dir and point GOLDDIGGER_DATA_DIR at it. */
function makeTmpDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gd-settings-test-"));
  process.env.GOLDDIGGER_DATA_DIR = dir;
  return dir;
}

/** Remove a temp dir (cleanup). */
function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** Write a config JSON file to the data dir. */
function writeConfigFile(dir: string, data: Record<string, unknown>): void {
  writeFileSync(join(dir, "golddigger-config.json"), JSON.stringify(data, null, 2), "utf-8");
}

/** Builds a minimal valid config object for testing. */
function buildConfig(overrides: Partial<GoldDiggerConfig> = {}): GoldDiggerConfig {
  return {
    setupComplete: false,
    anthropicApiKey: "",
    openrouterApiKey: "",
    routingMode: "auto",
    preferences: {
      defaultAgent: "auto",
      enableDisclaimers: true,
      enableSafetyGovernor: true,
      enablePersonality: true,
    },
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────

describe("settings", () => {
  // ── loadConfig ──────────────────────────────────────

  describe("loadConfig", () => {
    it("returns defaults when no file or env vars exist", () => {
      const dir = makeTmpDataDir();

      // Clear API key env vars so they don't pollute
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      const config = loadConfig();

      expect(config.setupComplete).toBe(false);
      expect(config.anthropicApiKey).toBe("");
      expect(config.openrouterApiKey).toBe("");
      expect(config.routingMode).toBe("auto");
      expect(config.preferences.defaultAgent).toBe("auto");
      expect(config.preferences.enableDisclaimers).toBe(true);
      expect(config.preferences.enableSafetyGovernor).toBe(true);
      expect(config.preferences.enablePersonality).toBe(true);

      cleanupDir(dir);
    });

    it("reads from file when config file exists", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      writeConfigFile(dir, {
        setupComplete: true,
        anthropicApiKey: "sk-ant-file-key-1234567890",
        openrouterApiKey: "",
        routingMode: "anthropic_only",
        preferences: {
          defaultAgent: "research",
          enableDisclaimers: false,
          enableSafetyGovernor: true,
          enablePersonality: false,
        },
        createdAt: "2025-06-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z",
      });

      const config = loadConfig();

      expect(config.setupComplete).toBe(true);
      expect(config.anthropicApiKey).toBe("sk-ant-file-key-1234567890");
      expect(config.routingMode).toBe("anthropic_only");
      expect(config.preferences.defaultAgent).toBe("research");
      expect(config.preferences.enableDisclaimers).toBe(false);
      expect(config.preferences.enablePersonality).toBe(false);
      expect(config.createdAt).toBe("2025-06-01T00:00:00.000Z");

      cleanupDir(dir);
    });

    it("fills blank keys from env vars", () => {
      const dir = makeTmpDataDir();

      // File has no API keys
      writeConfigFile(dir, {
        setupComplete: false,
        anthropicApiKey: "",
        openrouterApiKey: "",
        routingMode: "auto",
        preferences: {
          defaultAgent: "auto",
          enableDisclaimers: true,
          enableSafetyGovernor: true,
          enablePersonality: true,
        },
      });

      // Set env vars
      process.env.ANTHROPIC_API_KEY = "mock-ant-env-key-abcdef";
      process.env.OPENROUTER_API_KEY = "mock-or-v1-env-key-ghijkl";

      const config = loadConfig();

      expect(config.anthropicApiKey).toBe("mock-ant-env-key-abcdef");
      expect(config.openrouterApiKey).toBe("mock-or-v1-env-key-ghijkl");

      cleanupDir(dir);
    });

    it("marks setupComplete when env keys exist but file says incomplete", () => {
      const dir = makeTmpDataDir();

      writeConfigFile(dir, {
        setupComplete: false,
        anthropicApiKey: "",
        openrouterApiKey: "",
        routingMode: "auto",
      });

      process.env.ANTHROPIC_API_KEY = "sk-ant-env-setup-test-key";
      delete process.env.OPENROUTER_API_KEY;

      const config = loadConfig();

      expect(config.setupComplete).toBe(true);
      expect(config.anthropicApiKey).toBe("sk-ant-env-setup-test-key");

      cleanupDir(dir);
    });

    it("does not overwrite file keys with empty env vars", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      writeConfigFile(dir, {
        setupComplete: true,
        anthropicApiKey: "sk-ant-file-only-key-123",
        openrouterApiKey: "",
        routingMode: "auto",
      });

      const config = loadConfig();

      // File key should remain
      expect(config.anthropicApiKey).toBe("sk-ant-file-only-key-123");

      cleanupDir(dir);
    });

    it("env GOLDDIGGER_ROUTING overrides file routingMode", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      writeConfigFile(dir, {
        setupComplete: true,
        anthropicApiKey: "sk-ant-routing-test-key-x",
        openrouterApiKey: "",
        routingMode: "anthropic_only",
      });

      process.env.GOLDDIGGER_ROUTING = "hybrid";

      const config = loadConfig();

      expect(config.routingMode).toBe("hybrid");

      cleanupDir(dir);
    });
  });

  // ── saveConfig ──────────────────────────────────────

  describe("saveConfig", () => {
    it("writes file and returns true for writable dir", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      const config = buildConfig({
        setupComplete: true,
        anthropicApiKey: "sk-ant-save-test-key-12345",
      });

      const result = saveConfig(config);

      expect(result).toBe(true);
      expect(existsSync(join(dir, "golddigger-config.json"))).toBe(true);

      // Verify the written content is parseable and matches
      const reloaded = loadConfig();
      expect(reloaded.anthropicApiKey).toBe("sk-ant-save-test-key-12345");

      cleanupDir(dir);
    });

    it("returns false when filesystem is not writable", () => {
      // Point to a directory that doesn't exist and can't be created
      process.env.GOLDDIGGER_DATA_DIR = "/nonexistent/readonly/path/that/should/never/exist";
      resetFsCache();

      const config = buildConfig({ setupComplete: true });

      const result = saveConfig(config);

      expect(result).toBe(false);
    });

    it("updates the updatedAt timestamp", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      const before = new Date().toISOString();
      const config = buildConfig({ updatedAt: "2020-01-01T00:00:00.000Z" });

      saveConfig(config);

      // config is mutated in place by saveConfig
      expect(config.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
      expect(config.updatedAt >= before).toBe(true);

      cleanupDir(dir);
    });
  });

  // ── updateConfig ────────────────────────────────────

  describe("updateConfig", () => {
    it("merges preferences properly", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      // Seed initial config
      const initial = buildConfig({
        preferences: {
          defaultAgent: "auto",
          enableDisclaimers: true,
          enableSafetyGovernor: true,
          enablePersonality: true,
        },
      });
      saveConfig(initial);
      resetFsCache();

      const { config, persisted } = updateConfig({
        preferences: {
          defaultAgent: "investment",
          enableDisclaimers: false,
          enableSafetyGovernor: true,
          enablePersonality: true,
        },
      });

      expect(config.preferences.defaultAgent).toBe("investment");
      expect(config.preferences.enableDisclaimers).toBe(false);
      // Unchanged preferences should be preserved
      expect(config.preferences.enableSafetyGovernor).toBe(true);
      expect(config.preferences.enablePersonality).toBe(true);
      expect(persisted).toBe(true);

      cleanupDir(dir);
    });

    it("merges userProfile properly", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      // Seed config with a userProfile
      const initial = buildConfig({
        userProfile: {
          riskTolerance: "moderate",
          capitalRange: "5k_50k",
          focusAreas: ["stocks"],
          experienceLevel: "beginner",
        },
      });
      saveConfig(initial);
      resetFsCache();

      const { config } = updateConfig({
        userProfile: {
          riskTolerance: "aggressive",
          capitalRange: "50k_500k",
          focusAreas: ["crypto", "stocks"],
          experienceLevel: "advanced",
          investmentGoal: "wealth building",
        },
      });

      expect(config.userProfile).toBeDefined();
      expect(config.userProfile!.riskTolerance).toBe("aggressive");
      expect(config.userProfile!.capitalRange).toBe("50k_500k");
      expect(config.userProfile!.focusAreas).toEqual(["crypto", "stocks"]);
      expect(config.userProfile!.experienceLevel).toBe("advanced");
      expect(config.userProfile!.investmentGoal).toBe("wealth building");

      cleanupDir(dir);
    });

    it("preserves existing userProfile when update does not include it", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      const initial = buildConfig({
        userProfile: {
          riskTolerance: "conservative",
          capitalRange: "under_5k",
          focusAreas: ["all"],
          experienceLevel: "beginner",
        },
      });
      saveConfig(initial);
      resetFsCache();

      const { config } = updateConfig({
        setupComplete: true,
      });

      expect(config.userProfile).toBeDefined();
      expect(config.userProfile!.riskTolerance).toBe("conservative");

      cleanupDir(dir);
    });

    it("returns persisted false when fs is not writable", () => {
      process.env.GOLDDIGGER_DATA_DIR = "/nonexistent/readonly/path/for/update";
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;
      resetFsCache();

      const { config, persisted } = updateConfig({
        setupComplete: true,
      });

      expect(persisted).toBe(false);
      // The config is still returned even though it wasn't persisted
      expect(config.setupComplete).toBe(true);
    });
  });

  // ── getPublicConfig ─────────────────────────────────

  describe("getPublicConfig", () => {
    it("masks API keys showing first 7 and last 4 chars", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      const config = buildConfig({
        setupComplete: true,
        anthropicApiKey: "mock-ant-zyxwvutsrqponml",
        openrouterApiKey: "mock-or-v1-zyxwvutsrqponml",
      });
      saveConfig(config);
      resetFsCache();

      const pub = getPublicConfig();

      // First 7 chars + "..." + last 4 chars
      expect(pub.anthropicKeyHint).toBe("sk-ant-...mnop");
      expect(pub.openrouterKeyHint).toBe("sk-or-v...onml");

      // Full keys should NOT appear
      expect(pub).not.toHaveProperty("anthropicApiKey");
      expect(pub).not.toHaveProperty("openrouterApiKey");

      cleanupDir(dir);
    });

    it("returns empty string hint for short/missing keys", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      const config = buildConfig({
        anthropicApiKey: "",
        openrouterApiKey: "short",
      });
      saveConfig(config);
      resetFsCache();

      const pub = getPublicConfig();

      expect(pub.anthropicKeyHint).toBe("");
      // "short" is less than 12 chars, so maskKey returns ""
      expect(pub.openrouterKeyHint).toBe("");

      cleanupDir(dir);
    });

    it("shows hasAnthropicKey/hasOpenrouterKey correctly", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      // Only anthropic key
      const config = buildConfig({
        setupComplete: true,
        anthropicApiKey: "sk-ant-public-config-test-key",
        openrouterApiKey: "",
      });
      saveConfig(config);
      resetFsCache();

      const pub = getPublicConfig();

      expect(pub.hasAnthropicKey).toBe(true);
      expect(pub.hasOpenrouterKey).toBe(false);

      cleanupDir(dir);
    });

    it("shows both keys present when both are set", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      const config = buildConfig({
        setupComplete: true,
        anthropicApiKey: "sk-ant-both-keys-test-abc",
        openrouterApiKey: "mock-or-v1-both-keys-test-xyz",
      });
      saveConfig(config);
      resetFsCache();

      const publicConfig = getPublicConfig();

      expect(publicConfig.hasAnthropicKey).toBe(true);
      expect(publicConfig.hasOpenrouterKey).toBe(true);
      expect(publicConfig.anthropicKeyHint).toBe("sk-ant-...-abc");
      expect(publicConfig.openrouterKeyHint).toBe("mock-or...-xyz");

      cleanupDir(dir);
    });

    it("includes preferences and userProfile", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      const config = buildConfig({
        preferences: {
          defaultAgent: "research",
          enableDisclaimers: false,
          enableSafetyGovernor: true,
          enablePersonality: false,
        },
        userProfile: {
          riskTolerance: "aggressive",
          capitalRange: "over_500k",
          focusAreas: ["crypto"],
          experienceLevel: "advanced",
        },
      });
      saveConfig(config);
      resetFsCache();

      const pub = getPublicConfig();

      expect(pub.preferences.defaultAgent).toBe("research");
      expect(pub.preferences.enableDisclaimers).toBe(false);
      expect(pub.userProfile).toBeDefined();
      expect(pub.userProfile!.riskTolerance).toBe("aggressive");

      cleanupDir(dir);
    });

    it("sets envOnly based on filesystem writability", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      saveConfig(buildConfig());
      resetFsCache();

      const pub = getPublicConfig();

      // Temp dir should be writable
      expect(pub.envOnly).toBe(false);

      cleanupDir(dir);
    });

    it("derives preferredModel from routing mode", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      // anthropic_only -> claude-sonnet-4.5
      const config1 = buildConfig({
        setupComplete: true,
        anthropicApiKey: "mock-ant-model-derive-test-key",
        routingMode: "anthropic_only",
      });
      saveConfig(config1);
      resetFsCache();

      const pub1 = getPublicConfig();
      expect(pub1.preferredModel).toBe("claude-sonnet-4.5");

      // openrouter_only -> anthropic/claude-sonnet-4.5
      const config2 = buildConfig({
        setupComplete: true,
        openrouterApiKey: "mock-or-v1-model-derive-test-key",
        routingMode: "openrouter_only",
      });
      saveConfig(config2);
      resetFsCache();

      const pub2 = getPublicConfig();
      expect(pub2.preferredModel).toBe("anthropic/claude-sonnet-4.5");

      cleanupDir(dir);
    });
  });

  // ── isSetupComplete ─────────────────────────────────

  describe("isSetupComplete", () => {
    it("returns false with no keys", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      // Write config with no keys
      writeConfigFile(dir, {
        setupComplete: false,
        anthropicApiKey: "",
        openrouterApiKey: "",
        routingMode: "auto",
      });

      expect(isSetupComplete()).toBe(false);

      cleanupDir(dir);
    });

    it("returns true when anthropic key exists", () => {
      const dir = makeTmpDataDir();
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      process.env.ANTHROPIC_API_KEY = "mock-ant-setup-check-key-123";

      expect(isSetupComplete()).toBe(true);

      cleanupDir(dir);
    });

    it("returns true when openrouter key exists", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      process.env.OPENROUTER_API_KEY = "mock-or-v1-setup-check-key-456";

      expect(isSetupComplete()).toBe(true);

      cleanupDir(dir);
    });

    it("returns false when setupComplete is true but keys are empty", () => {
      const dir = makeTmpDataDir();
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.GOLDDIGGER_ROUTING;

      writeConfigFile(dir, {
        setupComplete: true,
        anthropicApiKey: "",
        openrouterApiKey: "",
        routingMode: "auto",
      });

      // setupComplete is true in file, but no actual keys -> false
      expect(isSetupComplete()).toBe(false);

      cleanupDir(dir);
    });
  });

  // ── resolveRoutingMode ──────────────────────────────

  describe("resolveRoutingMode", () => {
    it("auto with both keys returns hybrid", () => {
      const config = buildConfig({
        routingMode: "auto",
        anthropicApiKey: "mock-ant-routing-both-key-aaa",
        openrouterApiKey: "mock-or-v1-routing-both-key-bbb",
      });

      expect(resolveRoutingMode(config)).toBe("hybrid");
    });

    it("auto with only anthropic key returns anthropic_only", () => {
      const config = buildConfig({
        routingMode: "auto",
        anthropicApiKey: "mock-ant-routing-anthro-only",
        openrouterApiKey: "",
      });

      expect(resolveRoutingMode(config)).toBe("anthropic_only");
    });

    it("auto with only openrouter key returns openrouter_only", () => {
      const config = buildConfig({
        routingMode: "auto",
        anthropicApiKey: "",
        openrouterApiKey: "mock-or-v1-routing-or-only-key",
      });

      expect(resolveRoutingMode(config)).toBe("openrouter_only");
    });

    it("auto with no keys returns none", () => {
      const config = buildConfig({
        routingMode: "auto",
        anthropicApiKey: "",
        openrouterApiKey: "",
      });

      expect(resolveRoutingMode(config)).toBe("none");
    });

    it("explicit mode (not auto) returns as-is", () => {
      const hybridConfig = buildConfig({ routingMode: "hybrid" });
      expect(resolveRoutingMode(hybridConfig)).toBe("hybrid");

      const anthropicConfig = buildConfig({ routingMode: "anthropic_only" });
      expect(resolveRoutingMode(anthropicConfig)).toBe("anthropic_only");

      const openrouterConfig = buildConfig({ routingMode: "openrouter_only" });
      expect(resolveRoutingMode(openrouterConfig)).toBe("openrouter_only");
    });

    it("uses loadConfig when no config argument is provided", () => {
      const dir = makeTmpDataDir();
      delete process.env.GOLDDIGGER_ROUTING;

      process.env.ANTHROPIC_API_KEY = "sk-ant-resolve-no-arg-key";
      delete process.env.OPENROUTER_API_KEY;

      const result = resolveRoutingMode();

      expect(result).toBe("anthropic_only");

      cleanupDir(dir);
    });
  });

  // ── isFilesystemWritable ────────────────────────────

  describe("isFilesystemWritable", () => {
    it("returns true for writable temp dirs", () => {
      const dir = makeTmpDataDir();
      resetFsCache();

      expect(isFilesystemWritable()).toBe(true);

      cleanupDir(dir);
    });

    it("returns false for non-writable paths", () => {
      process.env.GOLDDIGGER_DATA_DIR = "/nonexistent/path/that/cannot/be/created";
      resetFsCache();

      expect(isFilesystemWritable()).toBe(false);
    });

    it("caches the result after first call", () => {
      const dir = makeTmpDataDir();
      resetFsCache();

      const first = isFilesystemWritable();
      expect(first).toBe(true);

      // Change to non-writable path, but cache should still return true
      process.env.GOLDDIGGER_DATA_DIR = "/nonexistent/readonly/cached";

      const second = isFilesystemWritable();
      expect(second).toBe(true); // cached result

      cleanupDir(dir);
    });

    it("returns fresh result after resetFsCache", () => {
      const dir = makeTmpDataDir();
      resetFsCache();

      expect(isFilesystemWritable()).toBe(true);

      // Reset and change to non-writable
      resetFsCache();
      process.env.GOLDDIGGER_DATA_DIR = "/nonexistent/readonly/after-reset";

      expect(isFilesystemWritable()).toBe(false);

      cleanupDir(dir);
    });

    it("creates the data directory if it does not exist", () => {
      const base = mkdtempSync(join(tmpdir(), "gd-fs-create-"));
      const nested = join(base, "subdir", "data");
      process.env.GOLDDIGGER_DATA_DIR = nested;
      resetFsCache();

      expect(isFilesystemWritable()).toBe(true);
      expect(existsSync(nested)).toBe(true);

      cleanupDir(base);
    });
  });

  // ── resetFsCache ────────────────────────────────────

  describe("resetFsCache", () => {
    it("clears cached filesystem writability so next check is fresh", () => {
      const dir = makeTmpDataDir();
      resetFsCache();

      // Prime the cache
      expect(isFilesystemWritable()).toBe(true);

      // Reset
      resetFsCache();

      // Now point to non-writable and it should re-check
      process.env.GOLDDIGGER_DATA_DIR = "/nonexistent/path/reset-test";
      expect(isFilesystemWritable()).toBe(false);

      cleanupDir(dir);
    });
  });
});
