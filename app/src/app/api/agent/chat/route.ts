import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function authenticate(req: NextRequest) {
  const token = req.cookies.get("magic-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

const AGENT_TOOLS = [
  {
    name: "run_command",
    description:
      "Execute a shell command on the server and return stdout/stderr. Use for system tasks, installing packages, running scripts, checking status, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file on the server.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file on the server. Creates directories if needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_files",
    description: "List files and directories at a given path.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (defaults to home)",
        },
      },
      required: [],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch a URL and return the response body as text.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL to fetch" },
        method: {
          type: "string",
          description: "HTTP method (default GET)",
        },
      },
      required: ["url"],
    },
  },
];

function executeAgentTool(
  name: string,
  input: Record<string, string>
): string {
  switch (name) {
    case "run_command": {
      try {
        const output = execSync(input.command, {
          timeout: 15000,
          maxBuffer: 1024 * 1024,
          cwd: process.env.HOME || "/tmp",
        });
        return output.toString() || "(no output)";
      } catch (err: any) {
        return (
          err.stderr?.toString() || err.stdout?.toString() || err.message
        );
      }
    }
    case "read_file": {
      try {
        return readFileSync(input.path, "utf-8");
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }
    case "write_file": {
      try {
        const dir = input.path.substring(0, input.path.lastIndexOf("/"));
        if (dir) {
          execSync(`mkdir -p "${dir}"`);
        }
        writeFileSync(input.path, input.content, "utf-8");
        return `Written ${input.content.length} bytes to ${input.path}`;
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }
    case "list_files": {
      try {
        const dir = input.path || process.env.HOME || "/tmp";
        const entries = readdirSync(dir);
        return entries
          .map((e) => {
            try {
              const s = statSync(join(dir, e));
              return `${s.isDirectory() ? "d" : "-"} ${e}`;
            } catch {
              return `? ${e}`;
            }
          })
          .join("\n");
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }
    case "fetch_url": {
      // This is async but we handle it in the main loop
      return "__ASYNC_FETCH__";
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

async function fetchUrl(
  url: string,
  method: string = "GET"
): Promise<string> {
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    return text.length > 5000
      ? text.substring(0, 5000) + "\n...(truncated)"
      : text;
  } catch (err: any) {
    return `Error: ${err.message}`;
  }
}

export async function POST(req: NextRequest) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message, history } = await req.json();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  // Try OpenClaw gateway first if configured
  const openclawUrl = process.env.OPENCLAW_URL;
  const openclawToken = process.env.OPENCLAW_TOKEN;
  if (openclawUrl && openclawToken) {
    try {
      const res = await fetch(`${openclawUrl}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openclawToken}`,
        },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json({
          reply: data.reply || data.message || data.content || "No response.",
          source: "openclaw",
        });
      }
    } catch (err) {
      console.error("OpenClaw gateway error:", err);
    }
  }

  // Fall back to Claude with agent tools
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({
      reply:
        "AI Agent is not configured. Set ANTHROPIC_API_KEY or connect an OpenClaw instance.",
      source: "none",
    });
  }

  // Build conversation from history
  const messages: Array<{ role: string; content: any }> = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-10)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({ role: "user", content: message });

  try {
    // Tool use loop - up to 8 iterations
    let currentMessages = [...messages];
    let finalReply = "";

    for (let i = 0; i < 8; i++) {
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
          system: `You are Magic Computer's AI Agent — an autonomous assistant that can execute commands, read/write files, fetch URLs, and perform multi-step tasks on the user's server. You run on a Railway cloud server.

Think step by step. Use tools to accomplish tasks. If a task requires multiple steps, plan them out and execute them sequentially. Be concise in your responses but thorough in your actions.

Current working directory: ${process.env.HOME || "/tmp"}
Platform: ${process.platform}`,
          messages: currentMessages,
          tools: AGENT_TOOLS,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("Anthropic API error:", err);
        return NextResponse.json({
          reply: "AI Agent error. Check API key configuration.",
          source: "error",
        });
      }

      const data = await res.json();

      // Collect text and tool use blocks
      const textParts: string[] = [];
      const toolUseBlocks: Array<{
        id: string;
        name: string;
        input: Record<string, string>;
      }> = [];

      for (const block of data.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolUseBlocks.push({
            id: block.id,
            name: block.name,
            input: block.input,
          });
        }
      }

      if (toolUseBlocks.length === 0) {
        // No more tools - we're done
        finalReply = textParts.join("\n");
        break;
      }

      // Execute tools and build tool results
      const toolResults: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
      }> = [];

      for (const tool of toolUseBlocks) {
        let result: string;
        if (tool.name === "fetch_url") {
          result = await fetchUrl(
            tool.input.url,
            tool.input.method || "GET"
          );
        } else {
          result = executeAgentTool(tool.name, tool.input);
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: result,
        });
      }

      // Add assistant response and tool results to conversation
      currentMessages.push({ role: "assistant", content: data.content });
      currentMessages.push({ role: "user", content: toolResults });

      // If there was text alongside tool use, accumulate it
      if (textParts.length > 0) {
        finalReply = textParts.join("\n");
      }
    }

    return NextResponse.json({
      reply: finalReply || "Task completed.",
      source: "claude-agent",
    });
  } catch (err: any) {
    console.error("Agent error:", err);
    return NextResponse.json({
      reply: `Agent error: ${err.message}`,
      source: "error",
    });
  }
}
