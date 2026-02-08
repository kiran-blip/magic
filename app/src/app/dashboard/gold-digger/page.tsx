"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Message {
  role: "user" | "assistant";
  content: string;
  agentType?: string;
  blocked?: boolean;
  blockReason?: string;
}

type AgentMode = "auto" | "investment" | "research" | "general";

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

const MODE_CONFIG: Record<
  AgentMode,
  {
    label: string;
    icon: string;
    description: string;
    placeholder: string;
    color: string;
    activeColor: string;
    suggestions: string[];
  }
> = {
  auto: {
    label: "Smart Auto",
    icon: "✨",
    description: "I'll figure out what you need automatically",
    placeholder: "Ask me anything about investments, markets, or finance...",
    color: "border-border text-muted",
    activeColor: "border-purple-500/40 bg-purple-500/10 text-purple-400",
    suggestions: [
      "Analyze AAPL stock — bull and bear case",
      "Research the AI coding tools market",
      "What are the top 3 risks in crypto right now?",
      "Compare NVDA vs AMD for a 6-month hold",
    ],
  },
  investment: {
    label: "Investments",
    icon: "📈",
    description: "Stock analysis, price targets, buy/sell recommendations",
    placeholder: "Enter a stock ticker or investment question (e.g. \"Analyze TSLA\" or \"Should I buy Bitcoin?\")",
    color: "border-border text-muted",
    activeColor: "border-success/40 bg-success/10 text-success",
    suggestions: [
      "Analyze AAPL stock",
      "Should I buy or sell NVDA?",
      "Compare Tesla vs Rivian",
      "What's the outlook for Bitcoin?",
      "Is the S&P 500 overvalued right now?",
      "Best dividend stocks for 2025",
    ],
  },
  research: {
    label: "Market Research",
    icon: "🔍",
    description: "Industry analysis, market sizing, opportunity scoring",
    placeholder: "Enter an industry or market to research (e.g. \"AI coding tools\" or \"EV charging stations\")",
    color: "border-border text-muted",
    activeColor: "border-accent/40 bg-accent/10 text-accent",
    suggestions: [
      "Research the AI coding tools market",
      "Opportunity score for EV charging",
      "How big is the pet tech market?",
      "Competitive landscape in fintech",
      "Emerging trends in remote work tools",
      "Is there opportunity in senior care tech?",
    ],
  },
  general: {
    label: "General Chat",
    icon: "💬",
    description: "Ask anything — finance questions, explanations, advice",
    placeholder: "Ask any question about finance, markets, or how Gold Digger works...",
    color: "border-border text-muted",
    activeColor: "border-blue-500/40 bg-blue-500/10 text-blue-400",
    suggestions: [
      "What's the difference between ETFs and mutual funds?",
      "Explain P/E ratio in simple terms",
      "How do I start investing with $1,000?",
      "What should I know about crypto taxes?",
      "How does dollar-cost averaging work?",
      "What's a good portfolio for a beginner?",
    ],
  },
};

export default function GoldDiggerPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [mode, setMode] = useState<AgentMode>("auto");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check setup status + health
  useEffect(() => {
    fetch("/api/jarvis/health")
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("error"));

    fetch("/api/jarvis/settings")
      .then((r) => r.json())
      .then((d) => setSetupComplete(d.setupComplete ?? false))
      .catch(() => setSetupComplete(false));
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
          // Send the selected mode so the backend skips routing
          ...(mode !== "auto" && { agentType: mode }),
        }),
      });

      // Safe JSON parse — server might return HTML error page
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        setMessages((prev: Message[]) => [
          ...prev,
          { role: "assistant", content: "Received an unexpected response from the server. Please try again." },
        ]);
        return;
      }

      if (!res.ok && res.status === 401) {
        setMessages((prev: Message[]) => [
          ...prev,
          { role: "assistant", content: "Session expired. Please refresh the page and log in again." },
        ]);
      } else if (!res.ok && res.status === 400) {
        setMessages((prev: Message[]) => [
          ...prev,
          { role: "assistant", content: (data.error as string) || "Invalid request. Please check your message." },
        ]);
      } else {
        const reply = typeof data.reply === "string" ? data.reply : "No response.";
        const agentType = typeof data.agentType === "string" ? data.agentType : undefined;
        const governance = data.governance as Record<string, unknown> | null;
        const isBlocked = data.source === "blocked" || governance?.approved === false;

        setMessages((prev: Message[]) => [
          ...prev,
          {
            role: "assistant",
            content: reply,
            agentType,
            blocked: isBlocked,
            blockReason: typeof governance?.blockReason === "string" ? governance.blockReason : undefined,
          },
        ]);
      }
    } catch {
      setMessages((prev: Message[]) => [
        ...prev,
        { role: "assistant", content: "Connection failed. Please check your network and try again." },
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

  function handleSuggestionClick(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  function handleFeatureCardClick(newMode: AgentMode) {
    setMode(newMode);
    inputRef.current?.focus();
  }

  const currentMode = MODE_CONFIG[mode];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Setup banner */}
      {(setupComplete === false || setupComplete === null) && (
        <div className="mb-4 bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">
              {setupComplete === null ? "Checking Setup..." : "Setup Required"}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {setupComplete === null ? "Verifying API configuration" : "Configure API keys to start using Gold Digger"}
            </div>
          </div>
          {setupComplete === false && (
            <button
              onClick={() => router.push("/dashboard/gold-digger/setup")}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-medium transition-colors"
            >
              Run Setup
            </button>
          )}
        </div>
      )}

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
          <Link
            href="/dashboard/gold-digger/settings"
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-card border border-border text-muted hover:text-foreground hover:border-accent/40 transition-colors"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
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
            <div className="flex flex-col items-center justify-center h-full py-8">
              {/* Welcome */}
              <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                <span className="text-2xl">⛏️</span>
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">
                Welcome to Gold Digger
              </h2>
              <p className="text-sm text-muted mb-6 text-center max-w-lg">
                Your AI financial assistant. Choose what you&apos;d like to do:
              </p>

              {/* Feature cards — 3 main modes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl w-full mb-6">
                {/* Investment card */}
                <button
                  onClick={() => handleFeatureCardClick("investment")}
                  className={`text-left p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    mode === "investment"
                      ? "border-success/40 bg-success/5"
                      : "border-border bg-background hover:border-success/30"
                  }`}
                >
                  <div className="text-2xl mb-2">📈</div>
                  <div className="text-sm font-semibold text-foreground mb-1">Analyze Investments</div>
                  <div className="text-xs text-muted leading-relaxed">
                    Get stock analysis, price targets, buy/sell/hold recommendations, and portfolio insights
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success/70">Stocks</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success/70">Crypto</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success/70">ETFs</span>
                  </div>
                </button>

                {/* Research card */}
                <button
                  onClick={() => handleFeatureCardClick("research")}
                  className={`text-left p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    mode === "research"
                      ? "border-accent/40 bg-accent/5"
                      : "border-border bg-background hover:border-accent/30"
                  }`}
                >
                  <div className="text-2xl mb-2">🔍</div>
                  <div className="text-sm font-semibold text-foreground mb-1">Research Markets</div>
                  <div className="text-xs text-muted leading-relaxed">
                    Explore industries, get market sizing (TAM/SAM/SOM), competitive analysis, and opportunity scores
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/70">Trends</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/70">Competition</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent/70">Sizing</span>
                  </div>
                </button>

                {/* General card */}
                <button
                  onClick={() => handleFeatureCardClick("general")}
                  className={`text-left p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    mode === "general"
                      ? "border-blue-500/40 bg-blue-500/5"
                      : "border-border bg-background hover:border-blue-500/30"
                  }`}
                >
                  <div className="text-2xl mb-2">💬</div>
                  <div className="text-sm font-semibold text-foreground mb-1">Ask Anything</div>
                  <div className="text-xs text-muted leading-relaxed">
                    Learn about investing, get explanations of financial concepts, or ask general finance questions
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70">Learn</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70">Explain</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400/70">Advise</span>
                  </div>
                </button>
              </div>

              {/* Suggestion chips — contextual to selected mode */}
              <div className="max-w-2xl w-full">
                <div className="text-xs text-muted/60 mb-2 text-center">
                  Try one of these to get started:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {currentMode.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestionClick(s)}
                      className="text-left px-3 py-2.5 bg-background border border-border rounded-lg text-xs text-muted hover:text-foreground hover:border-accent/30 transition-colors leading-relaxed"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
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
                {msg.role === "assistant" && (msg.agentType || msg.blocked) && (
                  <div className="mb-2 flex gap-1.5 items-center">
                    {msg.agentType && (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          AGENT_BADGES[msg.agentType]?.color ??
                          "bg-border/50 text-muted/60"
                        }`}
                      >
                        {AGENT_BADGES[msg.agentType]?.label ?? msg.agentType}
                      </span>
                    )}
                    {msg.blocked && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        Blocked
                      </span>
                    )}
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

        {/* Input area with mode selector */}
        <div className="p-3 border-t border-border">
          {/* Mode pills */}
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
            {(Object.keys(MODE_CONFIG) as AgentMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                  mode === m
                    ? MODE_CONFIG[m].activeColor
                    : "border-transparent text-muted/60 hover:text-muted hover:bg-background"
                }`}
              >
                <span>{MODE_CONFIG[m].icon}</span>
                <span>{MODE_CONFIG[m].label}</span>
              </button>
            ))}
          </div>

          {/* Input row */}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentMode.placeholder}
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
              disabled={loading || !input.trim() || status !== "ready"}
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
