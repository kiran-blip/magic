/**
 * Broker configuration management for Gold Digger AGI.
 *
 * Stores encrypted Alpaca credentials and trading preferences in the
 * golddigger-config.json alongside existing user profile settings.
 */

import * as fs from "fs";
import * as path from "path";
import {
  encryptCredential,
  decryptCredential,
  type TradingMode,
  type BrokerCredentials,
} from "./alpaca";

// ============================================================================
// Types
// ============================================================================

export interface BrokerConfig {
  provider: "alpaca";
  encryptedApiKey: string;
  encryptedApiSecret: string;
  tradingMode: TradingMode;
  tradingEnabled: boolean;
  paperTradingStartDate: string; // ISO date
  liveReadinessThreshold: {
    minPredictions: number; // min tracked predictions before live is available
    minWinRate: number; // min win rate % to suggest going live
    minDaysPaper: number; // min days on paper before live allowed
  };
  riskLimits: {
    maxPositionPercent: number; // max % of portfolio in single position
    maxDailyLossPercent: number; // daily loss circuit breaker %
    maxDailyTrades: number; // max trades per day
    requireApprovalAbove: number; // require approval for orders above $X
    allowShortSelling: boolean;
    allowMarginTrading: boolean;
  };
  lastConnectedAt?: string;
}

const DEFAULT_BROKER_CONFIG: BrokerConfig = {
  provider: "alpaca",
  encryptedApiKey: "",
  encryptedApiSecret: "",
  tradingMode: "paper",
  tradingEnabled: false,
  paperTradingStartDate: new Date().toISOString().split("T")[0],
  liveReadinessThreshold: {
    minPredictions: 50,
    minWinRate: 55,
    minDaysPaper: 30,
  },
  riskLimits: {
    maxPositionPercent: 15,
    maxDailyLossPercent: 3,
    maxDailyTrades: 20,
    requireApprovalAbove: 0, // all orders require approval by default
    allowShortSelling: false,
    allowMarginTrading: false,
  },
};

// ============================================================================
// Config File Operations
// ============================================================================

function getConfigPath(): string {
  const dataDir =
    process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dataDir, "golddigger-config.json");
}

interface FullConfig {
  brokerConfig?: BrokerConfig;
  [key: string]: unknown;
}

function loadFullConfig(): FullConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function saveFullConfig(config: FullConfig): void {
  const configPath = getConfigPath();
  const dataDir = path.dirname(configPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ============================================================================
// Public API
// ============================================================================

export function getBrokerConfig(): BrokerConfig {
  const full = loadFullConfig();
  return { ...DEFAULT_BROKER_CONFIG, ...(full.brokerConfig || {}) };
}

export function saveBrokerConfig(config: Partial<BrokerConfig>): BrokerConfig {
  const full = loadFullConfig();
  const current = full.brokerConfig || DEFAULT_BROKER_CONFIG;
  const updated = { ...current, ...config };
  full.brokerConfig = updated;
  saveFullConfig(full);
  console.log("[Gold Digger Broker] Config saved");
  return updated;
}

/**
 * Store broker credentials (encrypted at rest).
 */
export function storeBrokerCredentials(
  apiKey: string,
  apiSecret: string,
  tradingMode: TradingMode = "paper"
): void {
  saveBrokerConfig({
    encryptedApiKey: encryptCredential(apiKey),
    encryptedApiSecret: encryptCredential(apiSecret),
    tradingMode,
    tradingEnabled: true,
    paperTradingStartDate: new Date().toISOString().split("T")[0],
    lastConnectedAt: new Date().toISOString(),
  });
}

/**
 * Retrieve decrypted broker credentials.
 * Returns null if no credentials stored.
 */
export function getBrokerCredentials(): BrokerCredentials | null {
  const config = getBrokerConfig();
  if (!config.encryptedApiKey || !config.encryptedApiSecret) return null;

  try {
    return {
      apiKey: decryptCredential(config.encryptedApiKey),
      apiSecret: decryptCredential(config.encryptedApiSecret),
      tradingMode: config.tradingMode,
    };
  } catch (error) {
    console.error("[Gold Digger Broker] Failed to decrypt credentials:", error);
    return null;
  }
}

/**
 * Remove stored credentials and disable trading.
 */
export function removeBrokerCredentials(): void {
  saveBrokerConfig({
    encryptedApiKey: "",
    encryptedApiSecret: "",
    tradingEnabled: false,
    lastConnectedAt: undefined,
  });
  console.log("[Gold Digger Broker] Credentials removed");
}

/**
 * Check if the user has been paper trading long enough and has good enough
 * performance to qualify for live trading.
 */
export function checkLiveReadiness(stats: {
  totalPredictions: number;
  winRate: number;
}): {
  ready: boolean;
  reasons: string[];
  daysOnPaper: number;
  meetsWinRate: boolean;
  meetsPredictions: boolean;
  meetsDays: boolean;
} {
  const config = getBrokerConfig();
  const thresholds = config.liveReadinessThreshold;

  const paperStart = new Date(config.paperTradingStartDate);
  const now = new Date();
  const daysOnPaper = Math.floor(
    (now.getTime() - paperStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  const meetsDays = daysOnPaper >= thresholds.minDaysPaper;
  const meetsWinRate = stats.winRate >= thresholds.minWinRate;
  const meetsPredictions = stats.totalPredictions >= thresholds.minPredictions;

  const reasons: string[] = [];
  if (!meetsDays) {
    reasons.push(
      `Need ${thresholds.minDaysPaper - daysOnPaper} more days of paper trading`
    );
  }
  if (!meetsWinRate) {
    reasons.push(
      `Win rate ${stats.winRate.toFixed(1)}% is below ${thresholds.minWinRate}% threshold`
    );
  }
  if (!meetsPredictions) {
    reasons.push(
      `Need ${thresholds.minPredictions - stats.totalPredictions} more tracked predictions`
    );
  }

  return {
    ready: meetsDays && meetsWinRate && meetsPredictions,
    reasons,
    daysOnPaper,
    meetsWinRate,
    meetsPredictions,
    meetsDays,
  };
}
