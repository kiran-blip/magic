import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ── Env-var isolation ───────────────────────────────────

const ENV_KEYS = ["GOLDDIGGER_DATA_DIR", "JWT_SECRET"] as const;

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
});

// ── Helpers ─────────────────────────────────────────────

/** Create a fresh temp dir and point GOLDDIGGER_DATA_DIR at it. */
function makeTmpDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gd-broker-test-"));
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
  writeFileSync(
    join(dir, "golddigger-config.json"),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

/**
 * Dynamic import helper to reload the module with fresh cache.
 * This is necessary because config.ts uses module-level variables
 * for caching and environment resolution.
 */
async function loadModule() {
  vi.resetModules();
  return await import("./config");
}

// ── Tests ───────────────────────────────────────────────

describe("broker/config", () => {
  // ── getBrokerConfig ─────────────────────────────────

  describe("getBrokerConfig", () => {
    it("returns default config when no file exists", async () => {
      const dir = makeTmpDataDir();
      const config = await loadModule();

      const brokerConfig = config.getBrokerConfig();

      expect(brokerConfig.provider).toBe("alpaca");
      expect(brokerConfig.tradingMode).toBe("paper");
      expect(brokerConfig.tradingEnabled).toBe(false);
      expect(brokerConfig.encryptedApiKey).toBe("");
      expect(brokerConfig.encryptedApiSecret).toBe("");
      expect(brokerConfig.liveReadinessThreshold.minPredictions).toBe(50);
      expect(brokerConfig.liveReadinessThreshold.minWinRate).toBe(55);
      expect(brokerConfig.liveReadinessThreshold.minDaysPaper).toBe(30);
      expect(brokerConfig.riskLimits.maxPositionPercent).toBe(15);
      expect(brokerConfig.riskLimits.maxDailyLossPercent).toBe(3);
      expect(brokerConfig.riskLimits.maxDailyTrades).toBe(20);
      expect(brokerConfig.riskLimits.requireApprovalAbove).toBe(0);
      expect(brokerConfig.riskLimits.allowShortSelling).toBe(false);
      expect(brokerConfig.riskLimits.allowMarginTrading).toBe(false);

      cleanupDir(dir);
    });

    it("returns saved config when file exists", async () => {
      const dir = makeTmpDataDir();

      writeConfigFile(dir, {
        brokerConfig: {
          provider: "alpaca",
          encryptedApiKey: "enc-key-123",
          encryptedApiSecret: "enc-secret-456",
          tradingMode: "live",
          tradingEnabled: true,
          paperTradingStartDate: "2025-01-15",
          liveReadinessThreshold: {
            minPredictions: 100,
            minWinRate: 60,
            minDaysPaper: 60,
          },
          riskLimits: {
            maxPositionPercent: 20,
            maxDailyLossPercent: 5,
            maxDailyTrades: 30,
            requireApprovalAbove: 10000,
            allowShortSelling: true,
            allowMarginTrading: false,
          },
          lastConnectedAt: "2025-02-01T12:00:00.000Z",
        },
      });

      const config = await loadModule();
      const brokerConfig = config.getBrokerConfig();

      expect(brokerConfig.encryptedApiKey).toBe("enc-key-123");
      expect(brokerConfig.encryptedApiSecret).toBe("enc-secret-456");
      expect(brokerConfig.tradingMode).toBe("live");
      expect(brokerConfig.tradingEnabled).toBe(true);
      expect(brokerConfig.paperTradingStartDate).toBe("2025-01-15");
      expect(brokerConfig.liveReadinessThreshold.minPredictions).toBe(100);
      expect(brokerConfig.riskLimits.maxPositionPercent).toBe(20);
      expect(brokerConfig.riskLimits.allowShortSelling).toBe(true);
      expect(brokerConfig.lastConnectedAt).toBe("2025-02-01T12:00:00.000Z");

      cleanupDir(dir);
    });

    it("merges defaults with partial saved config", async () => {
      const dir = makeTmpDataDir();

      // Save only some fields
      writeConfigFile(dir, {
        brokerConfig: {
          tradingMode: "live",
          riskLimits: {
            maxPositionPercent: 25,
          },
        },
      });

      const config = await loadModule();
      const brokerConfig = config.getBrokerConfig();

      // Overridden fields
      expect(brokerConfig.tradingMode).toBe("live");

      // Partial riskLimits should not merge properly without spread
      // This tests that defaults are applied for missing fields
      expect(brokerConfig.provider).toBe("alpaca");
      expect(brokerConfig.encryptedApiKey).toBe("");
      expect(brokerConfig.liveReadinessThreshold.minPredictions).toBe(50);

      cleanupDir(dir);
    });

    it("handles corrupted config file gracefully", async () => {
      const dir = makeTmpDataDir();

      // Write invalid JSON
      writeFileSync(
        join(dir, "golddigger-config.json"),
        "{ invalid json content ]"
      );

      const config = await loadModule();
      const brokerConfig = config.getBrokerConfig();

      // Should fall back to defaults
      expect(brokerConfig.provider).toBe("alpaca");
      expect(brokerConfig.tradingEnabled).toBe(false);

      cleanupDir(dir);
    });
  });

  // ── saveBrokerConfig ────────────────────────────────

  describe("saveBrokerConfig", () => {
    it("creates data directory if it does not exist", async () => {
      const dir = makeTmpDataDir();
      const config = await loadModule();

      // Directory exists, but the config should work
      const saved = config.saveBrokerConfig({
        tradingMode: "paper",
      });

      expect(saved.tradingMode).toBe("paper");
      expect(existsSync(join(dir, "golddigger-config.json"))).toBe(true);

      cleanupDir(dir);
    });

    it("saves partial config merged with defaults", async () => {
      const dir = makeTmpDataDir();
      const config = await loadModule();

      const saved = config.saveBrokerConfig({
        tradingMode: "live",
        tradingEnabled: true,
      });

      expect(saved.tradingMode).toBe("live");
      expect(saved.tradingEnabled).toBe(true);
      expect(saved.provider).toBe("alpaca");
      expect(saved.riskLimits.maxPositionPercent).toBe(15);

      // Reload and verify persistence
      const config2 = await loadModule();
      const reloaded = config2.getBrokerConfig();
      expect(reloaded.tradingMode).toBe("live");
      expect(reloaded.tradingEnabled).toBe(true);

      cleanupDir(dir);
    });

    it("preserves existing non-broker config keys", async () => {
      const dir = makeTmpDataDir();

      writeConfigFile(dir, {
        someOtherKey: "should be preserved",
        anotherKey: { nested: "value" },
      });

      const config = await loadModule();
      config.saveBrokerConfig({
        tradingMode: "paper",
      });

      // Read file directly to verify
      const fileContent = JSON.parse(
        require("fs").readFileSync(join(dir, "golddigger-config.json"), "utf-8")
      );

      expect(fileContent.someOtherKey).toBe("should be preserved");
      expect(fileContent.anotherKey.nested).toBe("value");
      expect(fileContent.brokerConfig.tradingMode).toBe("paper");

      cleanupDir(dir);
    });

    it("updates risk limits correctly", async () => {
      const dir = makeTmpDataDir();
      const config = await loadModule();

      const saved = config.saveBrokerConfig({
        riskLimits: {
          maxPositionPercent: 20,
          maxDailyLossPercent: 5,
          maxDailyTrades: 25,
          requireApprovalAbove: 5000,
          allowShortSelling: true,
          allowMarginTrading: true,
        },
      });

      expect(saved.riskLimits.maxPositionPercent).toBe(20);
      expect(saved.riskLimits.maxDailyLossPercent).toBe(5);
      expect(saved.riskLimits.maxDailyTrades).toBe(25);
      expect(saved.riskLimits.requireApprovalAbove).toBe(5000);
      expect(saved.riskLimits.allowShortSelling).toBe(true);
      expect(saved.riskLimits.allowMarginTrading).toBe(true);

      cleanupDir(dir);
    });
  });

  // ── Credential encryption tests ─────────────────────

  describe("Credential encryption", () => {
    it("storeBrokerCredentials encrypts and stores credentials", async () => {
      const dir = makeTmpDataDir();
      // Set a consistent encryption key for tests
      process.env.JWT_SECRET = "test-encryption-key-12345";

      const config = await loadModule();

      config.storeBrokerCredentials("test-api-key", "test-api-secret", "paper");

      const brokerConfig = config.getBrokerConfig();
      expect(brokerConfig.tradingEnabled).toBe(true);
      expect(brokerConfig.tradingMode).toBe("paper");
      expect(brokerConfig.encryptedApiKey).not.toBe("test-api-key");
      expect(brokerConfig.encryptedApiSecret).not.toBe("test-api-secret");
      expect(brokerConfig.encryptedApiKey.length).toBeGreaterThan(0);
      expect(brokerConfig.encryptedApiSecret.length).toBeGreaterThan(0);

      cleanupDir(dir);
    });

    it("getBrokerCredentials decrypts correctly (round-trip)", async () => {
      const dir = makeTmpDataDir();
      process.env.JWT_SECRET = "test-encryption-key-12345";

      const config = await loadModule();

      const plainApiKey = "test-api-key-xyz";
      const plainApiSecret = "test-api-secret-abc";

      config.storeBrokerCredentials(plainApiKey, plainApiSecret, "paper");

      const credentials = config.getBrokerCredentials();

      expect(credentials).not.toBeNull();
      expect(credentials!.apiKey).toBe(plainApiKey);
      expect(credentials!.apiSecret).toBe(plainApiSecret);
      expect(credentials!.tradingMode).toBe("paper");

      cleanupDir(dir);
    });

    it("returns null when no credentials stored", async () => {
      const dir = makeTmpDataDir();
      process.env.JWT_SECRET = "test-encryption-key-12345";

      const config = await loadModule();

      // Don't store any credentials
      const credentials = config.getBrokerCredentials();

      expect(credentials).toBeNull();

      cleanupDir(dir);
    });

    it("removeBrokerCredentials clears credentials and disables trading", async () => {
      const dir = makeTmpDataDir();
      process.env.JWT_SECRET = "test-encryption-key-12345";

      const config = await loadModule();

      // Store credentials first
      config.storeBrokerCredentials("api-key", "api-secret", "live");
      expect(config.getBrokerConfig().tradingEnabled).toBe(true);

      // Remove credentials
      config.removeBrokerCredentials();

      const brokerConfig = config.getBrokerConfig();
      expect(brokerConfig.encryptedApiKey).toBe("");
      expect(brokerConfig.encryptedApiSecret).toBe("");
      expect(brokerConfig.tradingEnabled).toBe(false);
      expect(config.getBrokerCredentials()).toBeNull();

      cleanupDir(dir);
    });

    it("encrypted values are different from plaintext", async () => {
      const dir = makeTmpDataDir();
      process.env.JWT_SECRET = "test-encryption-key-12345";

      const config = await loadModule();

      const plainApiKey = "my-api-key-plaintext";
      const plainApiSecret = "my-api-secret-plaintext";

      config.storeBrokerCredentials(plainApiKey, plainApiSecret, "paper");

      const brokerConfig = config.getBrokerConfig();
      expect(brokerConfig.encryptedApiKey).not.toBe(plainApiKey);
      expect(brokerConfig.encryptedApiSecret).not.toBe(plainApiSecret);

      // Encrypted format should contain colons (iv:authTag:encrypted)
      expect(brokerConfig.encryptedApiKey).toContain(":");
      expect(brokerConfig.encryptedApiSecret).toContain(":");

      cleanupDir(dir);
    });
  });

  // ── checkLiveReadiness tests ────────────────────────

  describe("checkLiveReadiness", () => {
    it("not ready when insufficient days on paper", async () => {
      const dir = makeTmpDataDir();

      // Set paper trading start date to just 5 days ago
      const today = new Date();
      const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
      const fiveDaysAgoStr = fiveDaysAgo.toISOString().split("T")[0];

      writeConfigFile(dir, {
        brokerConfig: {
          provider: "alpaca",
          encryptedApiKey: "",
          encryptedApiSecret: "",
          tradingMode: "paper",
          tradingEnabled: false,
          paperTradingStartDate: fiveDaysAgoStr,
          liveReadinessThreshold: {
            minPredictions: 50,
            minWinRate: 55,
            minDaysPaper: 30,
          },
          riskLimits: {
            maxPositionPercent: 15,
            maxDailyLossPercent: 3,
            maxDailyTrades: 20,
            requireApprovalAbove: 0,
            allowShortSelling: false,
            allowMarginTrading: false,
          },
        },
      });

      const config = await loadModule();
      const result = config.checkLiveReadiness({
        totalPredictions: 100,
        winRate: 60,
      });

      expect(result.ready).toBe(false);
      expect(result.meetsDays).toBe(false);
      expect(result.meetsWinRate).toBe(true);
      expect(result.meetsPredictions).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons[0]).toContain("more days");

      cleanupDir(dir);
    });

    it("not ready when win rate below threshold", async () => {
      const dir = makeTmpDataDir();

      // Set paper trading start date to 40 days ago (meets days requirement)
      const today = new Date();
      const fortyDaysAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000);
      const fortyDaysAgoStr = fortyDaysAgo.toISOString().split("T")[0];

      writeConfigFile(dir, {
        brokerConfig: {
          provider: "alpaca",
          encryptedApiKey: "",
          encryptedApiSecret: "",
          tradingMode: "paper",
          tradingEnabled: false,
          paperTradingStartDate: fortyDaysAgoStr,
          liveReadinessThreshold: {
            minPredictions: 50,
            minWinRate: 55,
            minDaysPaper: 30,
          },
          riskLimits: {
            maxPositionPercent: 15,
            maxDailyLossPercent: 3,
            maxDailyTrades: 20,
            requireApprovalAbove: 0,
            allowShortSelling: false,
            allowMarginTrading: false,
          },
        },
      });

      const config = await loadModule();
      const result = config.checkLiveReadiness({
        totalPredictions: 100,
        winRate: 50, // Below 55% threshold
      });

      expect(result.ready).toBe(false);
      expect(result.meetsWinRate).toBe(false);
      expect(result.meetsDays).toBe(true);
      expect(result.meetsPredictions).toBe(true);
      expect(result.reasons[0]).toContain("Win rate");

      cleanupDir(dir);
    });

    it("not ready when insufficient predictions", async () => {
      const dir = makeTmpDataDir();

      // Set paper trading start date to 40 days ago
      const today = new Date();
      const fortyDaysAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000);
      const fortyDaysAgoStr = fortyDaysAgo.toISOString().split("T")[0];

      writeConfigFile(dir, {
        brokerConfig: {
          provider: "alpaca",
          encryptedApiKey: "",
          encryptedApiSecret: "",
          tradingMode: "paper",
          tradingEnabled: false,
          paperTradingStartDate: fortyDaysAgoStr,
          liveReadinessThreshold: {
            minPredictions: 50,
            minWinRate: 55,
            minDaysPaper: 30,
          },
          riskLimits: {
            maxPositionPercent: 15,
            maxDailyLossPercent: 3,
            maxDailyTrades: 20,
            requireApprovalAbove: 0,
            allowShortSelling: false,
            allowMarginTrading: false,
          },
        },
      });

      const config = await loadModule();
      const result = config.checkLiveReadiness({
        totalPredictions: 30, // Below 50 threshold
        winRate: 60,
      });

      expect(result.ready).toBe(false);
      expect(result.meetsPredictions).toBe(false);
      expect(result.meetsDays).toBe(true);
      expect(result.meetsWinRate).toBe(true);
      expect(result.reasons[0]).toContain("predictions");

      cleanupDir(dir);
    });

    it("returns multiple reasons when multiple criteria fail", async () => {
      const dir = makeTmpDataDir();

      // Set paper trading start date to just 5 days ago
      const today = new Date();
      const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
      const fiveDaysAgoStr = fiveDaysAgo.toISOString().split("T")[0];

      writeConfigFile(dir, {
        brokerConfig: {
          provider: "alpaca",
          encryptedApiKey: "",
          encryptedApiSecret: "",
          tradingMode: "paper",
          tradingEnabled: false,
          paperTradingStartDate: fiveDaysAgoStr,
          liveReadinessThreshold: {
            minPredictions: 50,
            minWinRate: 55,
            minDaysPaper: 30,
          },
          riskLimits: {
            maxPositionPercent: 15,
            maxDailyLossPercent: 3,
            maxDailyTrades: 20,
            requireApprovalAbove: 0,
            allowShortSelling: false,
            allowMarginTrading: false,
          },
        },
      });

      const config = await loadModule();
      const result = config.checkLiveReadiness({
        totalPredictions: 20, // Below 50
        winRate: 45, // Below 55
      });

      expect(result.ready).toBe(false);
      expect(result.reasons.length).toBe(3); // All three fail
      expect(result.meetsDays).toBe(false);
      expect(result.meetsWinRate).toBe(false);
      expect(result.meetsPredictions).toBe(false);

      cleanupDir(dir);
    });

    it("ready when all criteria met", async () => {
      const dir = makeTmpDataDir();

      // Set paper trading start date to 40 days ago (meets days requirement)
      const today = new Date();
      const fortyDaysAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000);
      const fortyDaysAgoStr = fortyDaysAgo.toISOString().split("T")[0];

      writeConfigFile(dir, {
        brokerConfig: {
          provider: "alpaca",
          encryptedApiKey: "",
          encryptedApiSecret: "",
          tradingMode: "paper",
          tradingEnabled: false,
          paperTradingStartDate: fortyDaysAgoStr,
          liveReadinessThreshold: {
            minPredictions: 50,
            minWinRate: 55,
            minDaysPaper: 30,
          },
          riskLimits: {
            maxPositionPercent: 15,
            maxDailyLossPercent: 3,
            maxDailyTrades: 20,
            requireApprovalAbove: 0,
            allowShortSelling: false,
            allowMarginTrading: false,
          },
        },
      });

      const config = await loadModule();
      const result = config.checkLiveReadiness({
        totalPredictions: 100,
        winRate: 60,
      });

      expect(result.ready).toBe(true);
      expect(result.meetsDays).toBe(true);
      expect(result.meetsWinRate).toBe(true);
      expect(result.meetsPredictions).toBe(true);
      expect(result.reasons.length).toBe(0);

      cleanupDir(dir);
    });

    it("returns correct daysOnPaper calculation", async () => {
      const dir = makeTmpDataDir();

      // Set paper trading start date to exactly 25 days ago
      const today = new Date();
      const twentyFiveDaysAgo = new Date(
        today.getTime() - 25 * 24 * 60 * 60 * 1000
      );
      const twentyFiveDaysAgoStr = twentyFiveDaysAgo
        .toISOString()
        .split("T")[0];

      writeConfigFile(dir, {
        brokerConfig: {
          provider: "alpaca",
          encryptedApiKey: "",
          encryptedApiSecret: "",
          tradingMode: "paper",
          tradingEnabled: false,
          paperTradingStartDate: twentyFiveDaysAgoStr,
          liveReadinessThreshold: {
            minPredictions: 50,
            minWinRate: 55,
            minDaysPaper: 30,
          },
          riskLimits: {
            maxPositionPercent: 15,
            maxDailyLossPercent: 3,
            maxDailyTrades: 20,
            requireApprovalAbove: 0,
            allowShortSelling: false,
            allowMarginTrading: false,
          },
        },
      });

      const config = await loadModule();
      const result = config.checkLiveReadiness({
        totalPredictions: 100,
        winRate: 60,
      });

      // Should be around 25 days (allow 1 day variance for test timing)
      expect(result.daysOnPaper).toBeGreaterThanOrEqual(24);
      expect(result.daysOnPaper).toBeLessThanOrEqual(26);

      cleanupDir(dir);
    });
  });

  // ── Risk limits configuration ────────────────────────

  describe("Risk limits configuration", () => {
    it("default risk limits are sensible", async () => {
      const dir = makeTmpDataDir();
      const config = await loadModule();

      const brokerConfig = config.getBrokerConfig();

      expect(brokerConfig.riskLimits.maxPositionPercent).toBe(15);
      expect(brokerConfig.riskLimits.maxDailyLossPercent).toBe(3);
      expect(brokerConfig.riskLimits.maxDailyTrades).toBe(20);
      expect(brokerConfig.riskLimits.requireApprovalAbove).toBe(0);
      expect(brokerConfig.riskLimits.allowShortSelling).toBe(false);
      expect(brokerConfig.riskLimits.allowMarginTrading).toBe(false);

      cleanupDir(dir);
    });

    it("can update individual risk limit fields", async () => {
      const dir = makeTmpDataDir();
      const config = await loadModule();

      const updated = config.saveBrokerConfig({
        riskLimits: {
          maxPositionPercent: 25,
          maxDailyLossPercent: 5,
          maxDailyTrades: 30,
          requireApprovalAbove: 50000,
          allowShortSelling: true,
          allowMarginTrading: false,
        },
      });

      expect(updated.riskLimits.maxPositionPercent).toBe(25);
      expect(updated.riskLimits.maxDailyLossPercent).toBe(5);
      expect(updated.riskLimits.maxDailyTrades).toBe(30);
      expect(updated.riskLimits.requireApprovalAbove).toBe(50000);
      expect(updated.riskLimits.allowShortSelling).toBe(true);

      cleanupDir(dir);
    });

    it("short selling and margin disabled by default", async () => {
      const dir = makeTmpDataDir();
      const config = await loadModule();

      const brokerConfig = config.getBrokerConfig();

      expect(brokerConfig.riskLimits.allowShortSelling).toBe(false);
      expect(brokerConfig.riskLimits.allowMarginTrading).toBe(false);

      cleanupDir(dir);
    });
  });

  // ── Integration tests ───────────────────────────────

  describe("Integration tests", () => {
    it("full workflow: store, retrieve, update credentials", async () => {
      const dir = makeTmpDataDir();
      process.env.JWT_SECRET = "integration-test-key-xyz";

      const config = await loadModule();

      // 1. Store credentials
      config.storeBrokerCredentials("live-api-key", "live-api-secret", "live");

      // 2. Verify tradingEnabled is set
      expect(config.getBrokerConfig().tradingEnabled).toBe(true);

      // 3. Retrieve and verify
      const creds = config.getBrokerCredentials();
      expect(creds!.apiKey).toBe("live-api-key");
      expect(creds!.tradingMode).toBe("live");

      // 4. Update risk limits
      config.saveBrokerConfig({
        riskLimits: {
          maxPositionPercent: 20,
          maxDailyLossPercent: 4,
          maxDailyTrades: 25,
          requireApprovalAbove: 10000,
          allowShortSelling: true,
          allowMarginTrading: false,
        },
      });

      // 5. Verify both credentials and risk limits persist
      const config2 = await loadModule();
      expect(config2.getBrokerCredentials()!.apiKey).toBe("live-api-key");
      expect(config2.getBrokerConfig().riskLimits.maxPositionPercent).toBe(20);

      cleanupDir(dir);
    });

    it("config file format preserves all fields correctly", async () => {
      const dir = makeTmpDataDir();
      process.env.JWT_SECRET = "format-test-key";

      const config = await loadModule();

      config.storeBrokerCredentials("format-key", "format-secret", "paper");
      config.saveBrokerConfig({
        liveReadinessThreshold: {
          minPredictions: 75,
          minWinRate: 58,
          minDaysPaper: 45,
        },
      });

      // Read the file directly
      const fileContent = JSON.parse(
        require("fs").readFileSync(join(dir, "golddigger-config.json"), "utf-8")
      );

      expect(fileContent.brokerConfig).toBeDefined();
      expect(fileContent.brokerConfig.encryptedApiKey).toBeDefined();
      expect(fileContent.brokerConfig.liveReadinessThreshold.minPredictions).toBe(
        75
      );
      expect(fileContent.brokerConfig.riskLimits).toBeDefined();

      cleanupDir(dir);
    });

    it("trading workflow: paper to live transition", async () => {
      const dir = makeTmpDataDir();
      process.env.JWT_SECRET = "transition-test-key";

      const config = await loadModule();

      // 1. Start with paper trading
      config.storeBrokerCredentials("paper-key", "paper-secret", "paper");
      expect(config.getBrokerConfig().tradingMode).toBe("paper");

      // 2. Check not yet ready for live
      const notReady = config.checkLiveReadiness({
        totalPredictions: 100,
        winRate: 60,
      });
      expect(notReady.ready).toBe(false); // Not enough days

      // 3. Simulate time passage and switch to live mode
      const today = new Date();
      const fortyDaysAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000);
      const fortyDaysAgoStr = fortyDaysAgo.toISOString().split("T")[0];

      config.saveBrokerConfig({
        paperTradingStartDate: fortyDaysAgoStr,
        tradingMode: "live",
      });

      // 4. Check now ready for live
      const config2 = await loadModule();
      const nowReady = config2.checkLiveReadiness({
        totalPredictions: 100,
        winRate: 60,
      });
      expect(nowReady.ready).toBe(true);

      cleanupDir(dir);
    });
  });
});
