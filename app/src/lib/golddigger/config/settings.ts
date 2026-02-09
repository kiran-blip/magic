/**
 * Gold Digger Settings — server-side config management.
 *
 * Storage strategy (Railway-compatible):
 *   1. PERSISTENT FILESYSTEM — If a writable data directory exists
 *      (e.g., Railway Volume mounted at /app/data), config is saved to JSON.
 *   2. ENVIRONMENT VARIABLES — Always used as fallback. On Railway without
 *      a volume, set ANTHROPIC_API_KEY / OPENROUTER_API_KEY as env vars
 *      and the system works in read-only mode (no setup wizard saving).
 *
 * Key env vars:
 *   GOLDDIGGER_DATA_DIR   — Override config directory (default: <cwd>/data)
 *   ANTHROPIC_API_KEY     — Anthropic API key
 *   OPENROUTER_API_KEY    — OpenRouter API key
 *   GOLDDIGGER_ROUTING    — Routing mode: auto|hybrid|anthropic_only|openrouter_only
 *   GOLDDIGGER_DISCLAIMERS — "true"/"false" (default: true)
 *   GOLDDIGGER_SAFETY      — "true"/"false" (default: true)
 *   GOLDDIGGER_PERSONALITY — "true"/"false" (default: true)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, accessSync, constants } from "fs";
import { join } from "path";

// ── Config shape ────────────────────────────────────

export interface UserProfile {
  riskTolerance: "conservative" | "moderate" | "aggressive";
  capitalRange: "under_5k" | "5k_50k" | "50k_500k" | "over_500k";
  focusAreas: Array<"stocks" | "crypto" | "business" | "real_estate" | "all">;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  investmentGoal?: string; // e.g., "retirement", "passive income", "wealth building"
}

export interface GoldDiggerConfig {
  setupComplete: boolean;
  anthropicApiKey: string;
  openrouterApiKey: string;
  routingMode: "hybrid" | "anthropic_only" | "openrouter_only" | "auto";
  preferences: {
    defaultAgent: "auto" | "investment" | "research" | "general";
    enableDisclaimers: boolean;
    enableSafetyGovernor: boolean;
    enablePersonality: boolean;
  };
  userProfile?: UserProfile;
  createdAt: string;
  updatedAt: string;
}

/** Client-safe version with masked keys. */
export interface GoldDiggerConfigPublic {
  setupComplete: boolean;
  hasAnthropicKey: boolean;
  hasOpenrouterKey: boolean;
  anthropicKeyHint: string;
  openrouterKeyHint: string;
  routingMode: string;
  /** The preferred LLM model identifier (derived from routing mode). */
  preferredModel: string;
  preferences: GoldDiggerConfig["preferences"];
  userProfile?: UserProfile;
  createdAt: string;
  updatedAt: string;
  /** True when config is driven by env vars and filesystem is not writable. */
  envOnly: boolean;
}

// ── Defaults ────────────────────────────────────────

const DEFAULT_CONFIG: GoldDiggerConfig = {
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// ── File paths ──────────────────────────────────────

function getConfigDir(): string {
  return process.env.GOLDDIGGER_DATA_DIR || join(process.cwd(), "data");
}

function getConfigPath(): string {
  return join(getConfigDir(), "golddigger-config.json");
}

// ── Filesystem availability ─────────────────────────

let _fsWritable: boolean | null = null;

/**
 * Check if the data directory is writable.
 * Caches the result to avoid repeated fs checks on every request.
 * On Railway without a volume, this will return false.
 */
export function isFilesystemWritable(): boolean {
  if (_fsWritable !== null) return _fsWritable;

  const dir = getConfigDir();

  try {
    // Try to create the directory if it doesn't exist
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    // Check write access
    accessSync(dir, constants.W_OK);
    _fsWritable = true;
  } catch {
    _fsWritable = false;
  }

  return _fsWritable;
}

/** Reset the filesystem-writable cache (useful after volume mount changes). */
export function resetFsCache(): void {
  _fsWritable = null;
}

// ── Env var helpers ─────────────────────────────────

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

/** Build config from environment variables only. */
function configFromEnv(): GoldDiggerConfig {
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? "";
  const hasAnyKey = !!anthropicKey || !!openrouterKey;

  return {
    // If keys exist in env, treat setup as complete
    setupComplete: hasAnyKey,
    anthropicApiKey: anthropicKey,
    openrouterApiKey: openrouterKey,
    routingMode: (process.env.GOLDDIGGER_ROUTING as GoldDiggerConfig["routingMode"]) || "auto",
    preferences: {
      defaultAgent: "auto",
      enableDisclaimers: envBool("GOLDDIGGER_DISCLAIMERS", true),
      enableSafetyGovernor: envBool("GOLDDIGGER_SAFETY", true),
      enablePersonality: envBool("GOLDDIGGER_PERSONALITY", true),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Read ────────────────────────────────────────────

/**
 * Load config.
 *
 * Priority:
 *   1. JSON file on disk (if exists and readable)
 *   2. Environment variables
 *   3. Defaults
 *
 * Env vars always fill in blanks — so Railway users can set keys as env vars
 * and they'll be picked up even when a config file exists.
 */
export function loadConfig(): GoldDiggerConfig {
  let config: GoldDiggerConfig = { ...DEFAULT_CONFIG };

  // Try reading from file
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const saved = JSON.parse(raw) as Partial<GoldDiggerConfig>;
      config = {
        ...DEFAULT_CONFIG,
        ...saved,
        preferences: { ...DEFAULT_CONFIG.preferences, ...saved.preferences },
      };
    } catch {
      console.warn("[Gold Digger] Failed to parse config file, using defaults");
    }
  }

  // Env var fallbacks — always fill in missing keys from env
  if (!config.anthropicApiKey) {
    config.anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
  }
  if (!config.openrouterApiKey) {
    config.openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
  }

  // If we have keys from env but setupComplete is false, mark as complete
  if (!config.setupComplete && (config.anthropicApiKey || config.openrouterApiKey)) {
    config.setupComplete = true;
  }

  // Env overrides for preferences
  if (process.env.GOLDDIGGER_ROUTING) {
    config.routingMode = process.env.GOLDDIGGER_ROUTING as GoldDiggerConfig["routingMode"];
  }

  return config;
}

// ── Write ───────────────────────────────────────────

/**
 * Save config to disk.
 * Returns true if saved successfully, false if filesystem is not writable.
 */
export function saveConfig(config: GoldDiggerConfig): boolean {
  if (!isFilesystemWritable()) {
    console.warn("[Gold Digger] Filesystem not writable — config changes will not persist");
    return false;
  }

  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  config.updatedAt = new Date().toISOString();
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
  console.log("[Gold Digger] Config saved to disk");
  return true;
}

/**
 * Partially update config. Merges provided fields with existing config.
 * Returns the merged config and whether it was persisted to disk.
 */
export function updateConfig(
  updates: Partial<GoldDiggerConfig>
): { config: GoldDiggerConfig; persisted: boolean } {
  const config = loadConfig();
  const merged: GoldDiggerConfig = {
    ...config,
    ...updates,
    preferences: {
      ...config.preferences,
      ...(updates.preferences ?? {}),
    },
    userProfile: updates.userProfile
      ? { ...(config.userProfile ?? {}), ...updates.userProfile }
      : config.userProfile,
    updatedAt: new Date().toISOString(),
  };
  const persisted = saveConfig(merged);
  return { config: merged, persisted };
}

// ── Public (masked) config ──────────────────────────

/** Mask an API key: show first 7 and last 4 chars. */
function maskKey(key: string): string {
  if (!key || key.length < 12) return "";
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

/**
 * Returns a client-safe version of the config with masked keys.
 * Never sends full keys to the frontend.
 */
export function getPublicConfig(): GoldDiggerConfigPublic {
  const config = loadConfig();

  const effectiveRouting = resolveRoutingMode(config);
  // Derive preferred model from routing mode
  const preferredModel =
    effectiveRouting === "anthropic_only"
      ? "claude-sonnet-4.5"
      : effectiveRouting === "openrouter_only"
        ? "anthropic/claude-sonnet-4.5"
        : effectiveRouting === "hybrid"
          ? "auto"
          : "none";

  return {
    setupComplete: config.setupComplete,
    hasAnthropicKey: !!config.anthropicApiKey,
    hasOpenrouterKey: !!config.openrouterApiKey,
    anthropicKeyHint: maskKey(config.anthropicApiKey),
    openrouterKeyHint: maskKey(config.openrouterApiKey),
    routingMode: effectiveRouting,
    preferredModel,
    preferences: config.preferences,
    userProfile: config.userProfile,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    envOnly: !isFilesystemWritable(),
  };
}

// ── Setup check ─────────────────────────────────────

/** Check if Gold Digger has been set up (at least one API key configured). */
export function isSetupComplete(): boolean {
  const config = loadConfig();
  return config.setupComplete && (!!config.anthropicApiKey || !!config.openrouterApiKey);
}

// ── Routing mode resolution ─────────────────────────

/** Determine the effective routing mode based on available keys. */
export function resolveRoutingMode(config?: GoldDiggerConfig): string {
  const c = config ?? loadConfig();

  if (c.routingMode !== "auto") return c.routingMode;

  const hasAnthropic = !!c.anthropicApiKey;
  const hasOpenRouter = !!c.openrouterApiKey;

  if (hasAnthropic && hasOpenRouter) return "hybrid";
  if (hasAnthropic) return "anthropic_only";
  if (hasOpenRouter) return "openrouter_only";
  return "none";
}

// ── Test connection ─────────────────────────────────

/** Test if an API key works by making a minimal API call. */
export async function testApiKey(
  provider: "anthropic" | "openrouter",
  apiKey: string
): Promise<{ success: boolean; message: string }> {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        return { success: true, message: "Anthropic API key is valid" };
      }

      const errText = await res.text();
      if (res.status === 401) {
        return { success: false, message: "Invalid API key" };
      }
      return { success: false, message: `API error ${res.status}: ${errText.slice(0, 100)}` };
    }

    if (provider === "openrouter") {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://gold-digger.app",
          "X-Title": "Gold Digger",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.1-8b-instruct",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        return { success: true, message: "OpenRouter API key is valid" };
      }

      if (res.status === 401) {
        return { success: false, message: "Invalid API key" };
      }
      return { success: false, message: `API error ${res.status}` };
    }

    return { success: false, message: "Unknown provider" };
  } catch (err) {
    return {
      success: false,
      message: `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
