import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

function authenticate(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function POST(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, containerId } = await req.json();

  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Try Anthropic API first, then fall back to OpenClaw/Ollama
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openclawUrl = process.env.OPENCLAW_API_URL || "http://localhost:11434";

  if (anthropicKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          system:
            "You are Magic Computer's AI assistant. Help users manage their containers, automate tasks, and get things done. Be concise and helpful.",
          messages: [{ role: "user", content: message }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply =
          data.content?.[0]?.text || "No response from AI.";
        return NextResponse.json({ reply });
      }
    } catch (err) {
      console.error("Anthropic API error:", err);
    }
  }

  // Fallback: OpenClaw / Ollama
  try {
    const res = await fetch(`${openclawUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        messages: [
          {
            role: "system",
            content:
              "You are Magic Computer's AI assistant. Help users manage their containers, automate tasks, and get things done. Be concise.",
          },
          { role: "user", content: message },
        ],
        stream: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        reply: data.message?.content || "No response from local LLM.",
      });
    }
  } catch (err) {
    console.error("OpenClaw/Ollama error:", err);
  }

  return NextResponse.json({
    reply:
      "AI is not configured. Add an ANTHROPIC_API_KEY or run OpenClaw/Ollama locally.",
  });
}
