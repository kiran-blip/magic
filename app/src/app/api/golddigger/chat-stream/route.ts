/**
 * Gold Digger Streaming Chat API
 *
 * POST /api/golddigger/chat-stream
 *
 * Returns Server-Sent Events (SSE) with pipeline progress and final response.
 * Events: stage, response, error, done
 */

import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { runGoldDigger } from "@/lib/golddigger";
import {
  storeConversation,
  storeInvestmentDecision,
  recallRelevant,
  recallInvestmentHistory,
  generateTags,
} from "@/lib/golddigger/memory";

function authenticate(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(req: NextRequest) {
  const user = authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    message?: string;
    history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    agentType?: "investment" | "research" | "general";
    quickChat?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { message, history = [], agentType, quickChat } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const VALID_AGENT_TYPES = ["investment", "research", "general"] as const;
  const validatedAgentType =
    agentType && VALID_AGENT_TYPES.includes(agentType as typeof VALID_AGENT_TYPES[number])
      ? (agentType as "investment" | "research" | "general")
      : undefined;

  const validatedHistory = Array.isArray(history)
    ? history.filter(
        (m): m is { role: "user" | "assistant" | "system"; content: string } =>
          m != null &&
          typeof m === "object" &&
          typeof (m as Record<string, unknown>).content === "string" &&
          ["user", "assistant", "system"].includes((m as Record<string, unknown>).role as string)
      )
    : [];

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: Record<string, unknown>) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        // Stage 1: Memory recall
        sendEvent("stage", { stage: "memory", label: "Scanning memory..." });

        let memoryContext = "";
        try {
          const relevant = recallRelevant(message, 3);
          if (relevant.length > 0) {
            const recallLines = relevant.map((m) =>
              `[${m.timestamp.slice(0, 10)}] ${m.agentType}: "${m.userQuery}" → ${m.summary}`
            );
            memoryContext = `\n\n[MEMORY RECALL — Previous relevant conversations]\n${recallLines.join("\n")}`;
          }
          const investmentHistory = recallInvestmentHistory(undefined, 3);
          if (investmentHistory.length > 0) {
            const histLines = investmentHistory.map((m) =>
              `[${m.timestamp.slice(0, 10)}] ${m.symbol}: ${m.action} @ ${m.confidence}% — ${m.reasoning.slice(0, 80)}`
            );
            memoryContext += `\n[Recent investment decisions]\n${histLines.join("\n")}`;
          }
        } catch {
          // Non-critical
        }

        const enrichedHistory = memoryContext
          ? [{ role: "system" as const, content: memoryContext }, ...validatedHistory]
          : validatedHistory;

        // Stage 2: Routing
        sendEvent("stage", { stage: "routing", label: "Routing query..." });

        // Hook into pipeline progress via console overrides
        const originalLog = console.log;
        const stages = new Set<string>();

        console.log = (...args: unknown[]) => {
          const msg = args.join(" ");

          // Detect pipeline stages from Gold Digger log messages
          if (msg.includes("Node 1:") && !stages.has("parse")) {
            stages.add("parse");
            sendEvent("stage", { stage: "parse", label: "Parsing query..." });
          } else if (msg.includes("Node 2:") && !stages.has("market")) {
            stages.add("market");
            sendEvent("stage", { stage: "market", label: "Fetching market data..." });
          } else if (msg.includes("Node 3:") && !stages.has("fundamentals")) {
            stages.add("fundamentals");
            sendEvent("stage", { stage: "fundamentals", label: "Analyzing fundamentals..." });
          } else if (msg.includes("Node 4:") && !stages.has("technicals")) {
            stages.add("technicals");
            sendEvent("stage", { stage: "technicals", label: "Running technicals..." });
          } else if (msg.includes("Node 5:") && !stages.has("sentiment")) {
            stages.add("sentiment");
            sendEvent("stage", { stage: "sentiment", label: "Reading sentiment..." });
          } else if (msg.includes("Node 6:") && !stages.has("recommendation")) {
            stages.add("recommendation");
            sendEvent("stage", { stage: "recommendation", label: "Generating recommendation..." });
          } else if (msg.includes("Supervisor routed") && !stages.has("routed")) {
            stages.add("routed");
            const match = msg.match(/routed to: (\w+)/);
            sendEvent("stage", { stage: "routed", label: `Routed to ${match?.[1] ?? "agent"}`, agentType: match?.[1] });
          } else if (msg.includes("research pipeline") && !stages.has("research")) {
            stages.add("research");
            sendEvent("stage", { stage: "research", label: "Running market research..." });
          }

          originalLog(...args);
        };

        // Stage 3: Run pipeline
        sendEvent("stage", { stage: "processing", label: "Processing..." });

        const result = await runGoldDigger(message, enrichedHistory, {
          forceAgentType: validatedAgentType,
          quickChat,
        });

        // Restore console
        console.log = originalLog;

        // Stage 4: Memory storage
        sendEvent("stage", { stage: "storing", label: "Saving to memory..." });

        try {
          const responseText = result.response ?? "";
          const tags = generateTags(message, responseText);
          storeConversation({
            userQuery: message,
            agentType: result.agentType ?? "general",
            summary: responseText.slice(0, 300),
            fullResponse: responseText,
            symbols: tags.filter((t) => /^[A-Z]{1,5}$/.test(t)),
            tags,
          });

          // Extract investment decisions
          if (result.agentType === "investment" && responseText.length > 50) {
            try {
              const actionMatch = responseText.match(/\*\*([A-Z]+)\s+([A-Z]{1,5})\*\*/);
              const confidenceMatch = responseText.match(/Confidence:\s*(\d+)%/);
              const entryMatch = responseText.match(/Entry:\s*\$?([\d,.]+)/);
              const stopMatch = responseText.match(/Stop Loss:\s*\$?([\d,.]+)/);
              const profitMatch = responseText.match(/Take Profit:\s*\$?([\d,.]+)/);
              const signalMatch = responseText.match(/\*\*SIGNAL:\*\*\s*(.+?)(?:\n|$)/);

              if (actionMatch?.[1] && actionMatch?.[2]) {
                const parseNum = (m: RegExpMatchArray | null) =>
                  m ? parseFloat(m[1].replace(/,/g, "")) : undefined;

                storeInvestmentDecision({
                  symbol: actionMatch[2],
                  action: actionMatch[1],
                  confidence: confidenceMatch ? parseInt(confidenceMatch[1], 10) : 50,
                  reasoning: signalMatch?.[1]?.slice(0, 200) ?? responseText.slice(0, 200),
                  entryPrice: parseNum(entryMatch),
                  stopLoss: parseNum(stopMatch),
                  takeProfit: parseNum(profitMatch),
                });
              }
            } catch {
              // Best-effort
            }
          }
        } catch {
          // Non-critical
        }

        // Stage 5: Send response
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

        sendEvent("response", {
          reply: result.response ?? "I'm not sure how to respond to that.",
          agentType: result.agentType,
          stage: result.stage,
          threadId: result.threadId,
          governance: governancePayload,
          source: result.stage === "blocked" ? "blocked" : "golddigger",
        });

        sendEvent("done", {});
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        let userMessage = "Something went wrong. Please try again.";
        if (errMsg.includes("API") || errMsg.includes("timeout")) {
          userMessage = "Having trouble reaching external services. Please try again in a moment.";
        }

        sendEvent("error", {
          reply: userMessage,
          error: errMsg.slice(0, 120),
        });
        sendEvent("done", {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
