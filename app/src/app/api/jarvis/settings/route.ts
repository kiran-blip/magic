/**
 * Gold Digger Settings API
 *
 * GET  /api/jarvis/settings — Returns public (masked) config
 * PUT  /api/jarvis/settings — Updates config fields
 * POST /api/jarvis/settings — Complete setup wizard
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import {
  getPublicConfig,
  updateConfig,
  loadConfig,
  saveConfig,
  type GoldDiggerConfig,
  type UserProfile,
} from "@/lib/jarvis/config";
import { clearProfileCache } from "@/lib/jarvis/personality";

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

    // Only allow specific fields to be updated
    if (typeof body.anthropicApiKey === "string") {
      updates.anthropicApiKey = body.anthropicApiKey.trim();
    }
    if (typeof body.openrouterApiKey === "string") {
      updates.openrouterApiKey = body.openrouterApiKey.trim();
    }
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

    // Apply wizard fields
    if (typeof body.anthropicApiKey === "string") {
      config.anthropicApiKey = body.anthropicApiKey.trim();
    }
    if (typeof body.openrouterApiKey === "string") {
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
