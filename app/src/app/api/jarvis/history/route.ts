/**
 * Gold Digger History API
 *
 * GET /api/jarvis/history          — Recent conversations
 * GET /api/jarvis/history?type=investments — Recent investment decisions
 * GET /api/jarvis/history?type=research    — Recent research findings
 * GET /api/jarvis/history?q=query          — Search conversations
 * GET /api/jarvis/history?type=stats       — Memory statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import {
  getRecentConversations,
  recallRelevant,
  recallInvestmentHistory,
  recallResearchHistory,
  getMemoryStats,
} from "@/lib/jarvis/memory";

async function authenticate() {
  const cookieStore = await cookies();
  const token = cookieStore.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const user = await authenticate();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "conversations";
    const query = searchParams.get("q") ?? "";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const symbol = searchParams.get("symbol") ?? undefined;
    const niche = searchParams.get("niche") ?? undefined;

    switch (type) {
      case "investments":
        return NextResponse.json({
          type: "investments",
          data: recallInvestmentHistory(symbol, limit),
        });

      case "research":
        return NextResponse.json({
          type: "research",
          data: recallResearchHistory(niche, limit),
        });

      case "stats":
        return NextResponse.json({
          type: "stats",
          data: getMemoryStats(),
        });

      case "search":
        if (!query) {
          return NextResponse.json(
            { error: "Search query (q) is required for type=search" },
            { status: 400 }
          );
        }
        return NextResponse.json({
          type: "search",
          query,
          data: recallRelevant(query, limit),
        });

      case "conversations":
      default:
        if (query) {
          return NextResponse.json({
            type: "search",
            query,
            data: recallRelevant(query, limit),
          });
        }
        return NextResponse.json({
          type: "conversations",
          data: getRecentConversations(limit),
        });
    }
  } catch (err) {
    console.error("[JARVIS History] Error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve history" },
      { status: 500 }
    );
  }
}
