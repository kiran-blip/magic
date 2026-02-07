"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  agentType?: string;
}

const AGENT_BADGES: Record<string, { label: string; color: string }> = {
  investment: {
    label: "Investment",
    color: "bg-success/10 text-success border border-success/20",
  },
  research: {
    label: "Research",
    color: "bg-accent/10 text-accent border border-accent/20",
  },
  general: {
    label: "General",
    color: "bg-border/50 text-muted/60",
  },
};

export default function GoldDiggerPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/jarvis/health")
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("error"));
  }, []);

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
    setMessages((prev: Message[]) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/jarvis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      setMessages((prev: Message[]) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No response.",
          agentType: data.agentType,
        },
      ]);
    } catch {
      setMessages((prev: Message[]) => [
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
    "Analyze AAPL stock — bull and bear case",
    "Research the AI coding tools market",
    "What are the top 3 risks in crypto right now?",
    "Compare NVDA vs AMD for a 6-month hold",
    "Find undervalued SaaS companies under $1B market cap",
    "What's the opportunity score for the EV charging market?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gold Digger</h1>
          <p className="text-muted text-sm mt-0.5">
            AI-powered investment analysis and market research
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              status === "ready"
                ? "bg-success/10 text-success border border-success/20"
                : status === "unconfigured"
                  ? "bg-warning/10 text-warning border border-warning/20"
                  : "bg-border/50 text-muted/60"
            }`}
          >
            {status === "ready"
              ? "online"
              : status === "unconfigured"
                ? "no API key"
                : status === "error"
                  ? "offline"
                  : "checking..."}
          </span>
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

      {/* Chat area */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                <span className="text-2xl">⛏️</span>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                Gold Digger
              </h2>
              <p className="text-sm text-muted mb-6 text-center max-w-md">
                I analyze investments, research markets, and help you find
                opportunities. Ask me anything about stocks, crypto, or market
                trends.
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
                {msg.role === "assistant" && msg.agentType && (
                  <div className="mb-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        AGENT_BADGES[msg.agentType]?.color ??
                        "bg-border/50 text-muted/60"
                      }`}
                    >
                      {AGENT_BADGES[msg.agentType]?.label ?? msg.agentType}
                    </span>
                  </div>
                )}
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
                Analyzing...
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
              placeholder="Ask about stocks, markets, or opportunities..."
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
