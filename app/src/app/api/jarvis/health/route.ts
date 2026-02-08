/**
 * Gold Digger Health Check Endpoint
 *
 * GET /api/jarvis/health
 * Returns Gold Digger system status, checking config file + env vars.
 */

import { NextResponse } from "next/server";
import { loadConfig, resolveRoutingMode } from "@/lib/jarvis/config";

export async function GET() {
  const config = loadConfig();
  const routingMode = resolveRoutingMode(config);

  const hasKeys = !!config.anthropicApiKey || !!config.openrouterApiKey;

  return NextResponse.json({
    status: hasKeys ? "ready" : "unconfigured",
    version: "4.0.0",
    name: "Gold Digger",
    routingMode,
    setupComplete: config.setupComplete,
    agents: ["investment", "research", "general"],
    features: {
      safetyGovernor: config.preferences.enableSafetyGovernor,
      personalitySystem: config.preferences.enablePersonality,
      multiTierRouting: routingMode === "hybrid",
      credentialDetection: true,
      financialDisclaimers: config.preferences.enableDisclaimers,
    },
  });
}
