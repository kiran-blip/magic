/**
 * Gold Digger Settings API
 *
 * GET  /api/golddigger/settings — Returns public (masked) config
 * PUT  /api/golddigger/settings — Updates config fields
 * POST /api/golddigger/settings — Complete setup wizard
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import {
  getPublicConfig,
  updateConfig,
  loadConfig,
  saveConfig,
  testApiKey,
  type GoldDiggerConfig,
  type UserProfile,
} from "@/lib/golddigger/config";
import { clearProfileCache } from "@/lib/golddigger/personality";

// ── API Key Validation ─────────────────────────────────────

function validateApiKeyFormat(
  provider: "anthropic" | "openrouter",
  key: string
): { valid: boolean; error?: string } {
  const trimmed = key.trim();
  if (!trimmed) return { valid: true }; // Empty means "keep existing"

  if (trimmed.length < 20) {
    return { valid: false, error: `${provider === "anthropic" ? "Anthropic" : "OpenRouter"} key is too short — did you paste the full key?` };
  }

  if (provider === "anthropic" && !trimmed.startsWith("sk-ant-")) {
    return { valid: false, error: "Anthropic keys start with 'sk-ant-'. Check you pasted the right key." };
  }

  if (provider === "openrouter" && !trimmed.startsWith("sk-or-")) {
    return { valid: false, error: "OpenRouter keys start with 'sk-or-'. Check you pasted the right key." };
  }

  // Reject input that looks like a sentence (has multiple words with spaces)
  if (/\s{2,}/.test(trimmed) || trimmed.split(" ").length > 3) {
    return { valid: false, error: "This doesn't look like an API key — API keys don't contain spaces." };
  }

  return { valid: true };
}

async function authenticate() {
  const cookieStore = await cookies();
  const token = cookieStore.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** GET — Return public (masked) settings. */
export async function GET() {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publicConfig = getPublicConfig();
    return NextResponse.json(publicConfig);
  } catch (err) {
    console.error("[Gold Digger Settings] GET error:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

/** PUT — Update specific settings fields. */
export async function PUT(req: NextRequest) {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updates: Partial<GoldDiggerConfig> = {};
    const keyTestResults: Array<{ provider: string; success: boolean; message: string }> = [];

    // ── Validate & extract API keys ─────────────────────
    if (typeof body.anthropicApiKey === "string" && body.anthropicApiKey.trim()) {
      const check = validateApiKeyFormat("anthropic", body.anthropicApiKey);
      if (!check.valid) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      updates.anthropicApiKey = body.anthropicApiKey.trim();
    }
    if (typeof body.openrouterApiKey === "string" && body.openrouterApiKey.trim()) {
      const check = validateApiKeyFormat("openrouter", body.openrouterApiKey);
      if (!check.valid) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      updates.openrouterApiKey = body.openrouterApiKey.trim();
    }

    // ── Live-test new keys before saving ────────────────
    if (updates.anthropicApiKey) {
      const result = await testApiKey("anthropic", updates.anthropicApiKey);
      keyTestResults.push({ provider: "Anthropic", ...result });
      if (!result.success) {
        return NextResponse.json(
          { error: `Anthropic key test failed: ${result.message}` },
          { status: 400 }
        );
      }
    }
    if (updates.openrouterApiKey) {
      const result = await testApiKey("openrouter", updates.openrouterApiKey);
      keyTestResults.push({ provider: "OpenRouter", ...result });
      if (!result.success) {
        return NextResponse.json(
          { error: `OpenRouter key test failed: ${result.message}` },
          { status: 400 }
        );
      }
    }

    // ── Other fields ────────────────────────────────────
    if (body.routingMode && ["hybrid", "anthropic_only", "openrouter_only", "auto"].includes(body.routingMode)) {
      updates.routingMode = body.routingMode;
    }
    if (body.preferences && typeof body.preferences === "object") {
      updates.preferences = body.preferences;
    }
    if (body.userProfile && typeof body.userProfile === "object") {
      updates.userProfile = body.userProfile as UserProfile;
    }

    const { persisted } = updateConfig(updates);

    // Clear cached profile so personality system picks up changes immediately
    if (updates.userProfile) {
      clearProfileCache();
    }
    const publicConfig = getPublicConfig();

    return NextResponse.json({
      success: true,
      persisted,
      config: publicConfig,
      keyTestResults: keyTestResults.length > 0 ? keyTestResults : undefined,
      ...(persisted ? {} : { warning: "Changes applied but not persisted — set environment variables in Railway dashboard for permanent config" }),
    });
  } catch (err) {
    console.error("[Gold Digger Settings] PUT error:", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}

/** POST — Complete the setup wizard. Saves all keys + marks setup as complete. */
export async function POST(req: NextRequest) {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const config = loadConfig();

    // Apply wizard fields with validation
    if (typeof body.anthropicApiKey === "string" && body.anthropicApiKey.trim()) {
      const check = validateApiKeyFormat("anthropic", body.anthropicApiKey);
      if (!check.valid) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      config.anthropicApiKey = body.anthropicApiKey.trim();
    }
    if (typeof body.openrouterApiKey === "string" && body.openrouterApiKey.trim()) {
      const check = validateApiKeyFormat("openrouter", body.openrouterApiKey);
      if (!check.valid) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      config.openrouterApiKey = body.openrouterApiKey.trim();
    }
    if (body.routingMode && ["hybrid", "anthropic_only", "openrouter_only", "auto"].includes(body.routingMode)) {
      config.routingMode = body.routingMode;
    }
    if (body.preferences) {
      config.preferences = { ...config.preferences, ...body.preferences };
    }
    if (body.userProfile && typeof body.userProfile === "object") {
      config.userProfile = body.userProfile as UserProfile;
    }

    // Validate: at least one key must be present
    if (!config.anthropicApiKey && !config.openrouterApiKey) {
      return NextResponse.json(
        { error: "At least one API key is required" },
        { status: 400 }
      );
    }

    config.setupComplete = true;
    if (!config.createdAt) {
      config.createdAt = new Date().toISOString();
    }

    const persisted = saveConfig(config);

    // Clear cached profile so personality system picks up new profile immediately
    if (config.userProfile) {
      clearProfileCache();
    }

    return NextResponse.json({
      success: true,
      persisted,
      message: persisted
        ? "Setup complete"
        : "Setup complete (config in memory only — add a Railway Volume or set env vars for persistence)",
      config: getPublicConfig(),
    });
  } catch (err) {
    console.error("[Gold Digger Settings] POST error:", err);
    return NextResponse.json({ error: "Failed to complete setup" }, { status: 500 });
  }
}

/** DELETE — Revert settings to defaults (re-derive from env vars). */
export async function DELETE() {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Reset to defaults by saving a fresh config derived from env
    const defaults: GoldDiggerConfig = {
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

    // Re-apply env var keys (they remain)
    defaults.anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
    defaults.openrouterApiKey = process.env.OPENROUTER_API_KEY ?? "";

    if (defaults.anthropicApiKey || defaults.openrouterApiKey) {
      defaults.setupComplete = true;
    }

    if (process.env.GOLDDIGGER_ROUTING) {
      defaults.routingMode = process.env.GOLDDIGGER_ROUTING as GoldDiggerConfig["routingMode"];
    }

    const persisted = saveConfig(defaults);

    return NextResponse.json({
      success: true,
      persisted,
      message: "Settings reverted to defaults",
      config: getPublicConfig(),
    });
  } catch (err) {
    console.error("[Gold Digger Settings] DELETE error:", err);
    return NextResponse.json({ error: "Failed to revert settings" }, { status: 500 });
  }
}
