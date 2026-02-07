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

  try {
    // Run JARVIS pipeline
    const result = await runJarvis(message, history, {
      forceAgentType: agentType,
      quickChat,
    });

    return NextResponse.json({
      reply: result.response ?? "I'm not sure how to respond to that.",
      agentType: result.agentType,
      stage: result.stage,
      threadId: result.threadId,
      governance: result.governance
        ? {
            approved: result.governance.approved,
            riskLevel: result.governance.riskLevel,
            warnings: result.governance.metadata?.warnings ?? [],
          }
        : null,
      source: "jarvis",
    });
  } catch (err) {
    console.error("[JARVIS API] Pipeline error:", err);
    return NextResponse.json(
      {
        reply:
          "I apologize, Sir, but something went wrong on my end. Please try again.",
        source: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
