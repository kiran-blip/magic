import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { emailTools, executeEmailTool, isAuthenticated } from "@/lib/gmail";

const SYSTEM_PROMPT = `You are Magic Computer's Email Assistant. You help users manage their Gmail inbox efficiently.

You have access to Gmail tools that let you read, search, send, reply to, archive, and trash emails.

When summarizing emails:
- Be concise — use bullet points
- Highlight sender, subject, and key action items
- Group by priority (urgent, important, FYI)

When drafting replies:
- Match the tone of the original email
- Be professional but natural
- Keep it concise

When the user asks to unsubscribe or clean up:
- Search for newsletters and marketing emails
- Suggest which to trash or archive
- Ask before taking destructive actions

Always confirm before sending emails or trashing messages.`;

export async function POST(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAuthenticated()) {
    return NextResponse.json(
      { error: "Gmail not connected. Connect Gmail first." },
      { status: 403 }
    );
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { messages } = await req.json();

  try {
    // Call Claude with email tools
    let claudeMessages = [...messages];
    let finalResponse = "";

    // Tool use loop — Claude may call multiple tools
    for (let i = 0; i < 10; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools: emailTools,
          messages: claudeMessages,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("Claude API error:", err);
        return NextResponse.json(
          { error: "Claude API error" },
          { status: 500 }
        );
      }

      const data = await res.json();

      // Check if Claude wants to use tools
      if (data.stop_reason === "tool_use") {
        // Add assistant message with tool calls
        claudeMessages.push({ role: "assistant", content: data.content });

        // Execute each tool call
        const toolResults: any[] = [];
        for (const block of data.content) {
          if (block.type === "tool_use") {
            try {
              const result = await executeEmailTool(block.name, block.input);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: result,
              });
            } catch (err: any) {
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Error: ${err.message}`,
                is_error: true,
              });
            }
          }
        }

        // Add tool results
        claudeMessages.push({ role: "user", content: toolResults });
      } else {
        // Claude is done — extract text response
        finalResponse = data.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("\n");
        break;
      }
    }

    return NextResponse.json({ reply: finalResponse });
  } catch (err: any) {
    console.error("Email chat error:", err);
    return NextResponse.json(
      { error: err.message || "Chat failed" },
      { status: 500 }
    );
  }
}
