"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AgentPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [openclawToken, setOpenclawToken] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No response.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Connection failed." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const suggestions = [
    "What's running on this server?",
    "Show me disk usage and memory",
    "Create a Python script that monitors CPU",
    "What's my public IP address?",
    "Install htop and show system stats",
    "Fetch the HackerNews front page",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Agent</h1>
          <p className="text-muted text-sm mt-0.5">
            Autonomous AI that can run commands, manage files, and perform tasks
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`px-3 py-2 rounded-lg text-xs border transition-colors ${
              showSettings
                ? "bg-accent/10 border-accent/20 text-accent"
                : "bg-card border-border text-muted hover:text-foreground"
            }`}
          >
            🦞 OpenClaw
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* OpenClaw settings panel */}
      {showSettings && (
        <div className="mb-4 p-4 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🦞</span>
            <h3 className="text-sm font-semibold text-foreground">
              Connect OpenClaw
            </h3>
          </div>
          <p className="text-xs text-muted mb-3">
            Point to your self-hosted OpenClaw gateway for enhanced agent
            capabilities with 50+ integrations, voice, and multi-channel
            support. Without it, Magic uses Claude with built-in server tools.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">
                Gateway URL
              </label>
              <input
                type="text"
                value={openclawUrl}
                onChange={(e) => setOpenclawUrl(e.target.value)}
                placeholder="https://your-openclaw:18789"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">
                Gateway Token
              </label>
              <input
                type="password"
                value={openclawToken}
                onChange={(e) => setOpenclawToken(e.target.value)}
                placeholder="Token from openclaw dashboard"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs transition-colors"
              >
                Save
              </button>
              <span className="text-[10px] text-muted">
                Set <code className="text-foreground/70">OPENCLAW_URL</code> and{" "}
                <code className="text-foreground/70">OPENCLAW_TOKEN</code> env
                vars on Railway for persistent config
              </span>
            </div>
            <span className="text-[10px] px-2 py-1 rounded bg-accent/10 text-accent border border-accent/20">
              Using: Claude Agent
            </span>
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                <span className="text-2xl">🤖</span>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                Magic Agent
              </h2>
              <p className="text-sm text-muted mb-6 text-center max-w-md">
                I can run commands on your server, read and write files, fetch
                URLs, and complete multi-step tasks autonomously.
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s);
                      inputRef.current?.focus();
                    }}
                    className="text-left px-3 py-2.5 bg-background border border-border rounded-lg text-xs text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-xl text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-accent text-white rounded-br-sm"
                    : "bg-background border border-border text-foreground rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-background border border-border rounded-xl rounded-bl-sm px-4 py-3 text-sm text-muted flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" />
                  <span
                    className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
                    style={{ animationDelay: "0.3s" }}
                  />
                </span>
                Agent is working...
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="p-3 border-t border-border">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the agent to do something..."
              rows={1}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent resize-none"
              style={{ minHeight: "40px", maxHeight: "120px" }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
