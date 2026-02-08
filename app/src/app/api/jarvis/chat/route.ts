/**
 * Gold Digger Chat API Route
 *
 * POST /api/jarvis/chat
 *
 * Runs the full Gold Digger pipeline: supervisor → governor → agent → end
 * Returns the response with metadata (agent type, governance decision, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { runJarvis } from "@/lib/jarvis";

function authenticate(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(req: NextRequest) {
  // Auth check
  const user = authenticate(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse request
  let body: {
    message?: string;
    history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    agentType?: "investment" | "research" | "general";
    quickChat?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { message, history = [], agentType, quickChat } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 }
    );
  }

  // Validate agentType if provided — only accept known values
  const VALID_AGENT_TYPES = ["investment", "research", "general"] as const;
  const validatedAgentType =
    agentType && VALID_AGENT_TYPES.includes(agentType as typeof VALID_AGENT_TYPES[number])
      ? (agentType as "investment" | "research" | "general")
      : undefined;

  // Validate history — ensure it's an array of {role, content} objects
  const validatedHistory = Array.isArray(history)
    ? history.filter(
        (m): m is { role: "user" | "assistant" | "system"; content: string } =>
          m != null &&
          typeof m === "object" &&
          typeof (m as Record<string, unknown>).content === "string" &&
          ["user", "assistant", "system"].includes((m as Record<string, unknown>).role as string)
      )
    : [];

  try {
    // Run JARVIS pipeline
    const result = await runJarvis(message, validatedHistory, {
      forceAgentType: validatedAgentType,
      quickChat,
    });

    // Include blockReason when query was blocked by governor
    const governancePayload = result.governance
      ? {
          approved: result.governance.approved,
          riskLevel: result.governance.riskLevel,
          warnings: result.governance.metadata?.warnings ?? [],
          ...(result.governance.approved === false && {
            blockReason: result.governance.reason,
          }),
        }
      : null;

    return NextResponse.json({
      reply: result.response ?? "I'm not sure how to respond to that.",
      agentType: result.agentType,
      stage: result.stage,
      threadId: result.threadId,
      governance: governancePayload,
      source: result.stage === "blocked" ? "blocked" : "jarvis",
    });
  } catch (err) {
    console.error("[JARVIS API] Pipeline error:", err);

    const errMsg = err instanceof Error ? err.message : "Unknown error";

    // Differentiate error types for the frontend
    let errorType = "internal_error";
    let userMessage = "I apologize, Sir, but something went wrong on my end. Please try again.";

    if (errMsg.includes("API") || errMsg.includes("fetch") || errMsg.includes("timeout")) {
      errorType = "api_failure";
      userMessage = "I'm having trouble reaching external services right now. The analysis may be limited — please try again in a moment.";
    } else if (errMsg.includes("rate") || errMsg.includes("429")) {
      errorType = "rate_limited";
      userMessage = "I've hit a rate limit. Please wait a moment and try again.";
    }

    // Sanitize error — never leak internal paths, keys, or stack traces to client
    const safeError = errMsg
      .replace(/\/[^\s]+\.(ts|js|mjs)/g, "[internal]")  // strip file paths
      .replace(/sk-[a-zA-Z0-9\-]+/g, "[REDACTED]")       // strip API keys
      .slice(0, 120);                                      // truncate long messages

    return NextResponse.json(
      {
        reply: userMessage,
        agentType: "general",
        stage: "error",
        threadId: crypto.randomUUID(),
        governance: { approved: false, riskLevel: "low", warnings: [] },
        source: "error",
        errorType,
        error: safeError,
      },
      { status: 500 }
    );
  }
}
