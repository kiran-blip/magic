/**
 * Gold Digger Health Check Endpoint
 *
 * GET /api/jarvis/health
 * Returns Gold Digger system status.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  let routingMode: string;
  if (hasAnthropic && hasOpenRouter) routingMode = "hybrid";
  else if (hasAnthropic) routingMode = "anthropic_only";
  else if (hasOpenRouter) routingMode = "openrouter_only";
  else routingMode = "none";

  return NextResponse.json({
    status: routingMode !== "none" ? "ready" : "unconfigured",
    version: "4.0.0",
    name: "Gold Digger",
    routingMode,
    agents: ["investment", "research", "general"],
    features: {
      safetyGovernor: true,
      personalitySystem: true,
      multiTierRouting: hasOpenRouter,
      credentialDetection: true,
      financialDisclaimers: true,
    },
  });
}
