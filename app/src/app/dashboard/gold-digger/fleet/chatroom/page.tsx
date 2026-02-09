"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ── Types ──────────────────────────────────────────────── */

interface Agent {
  id: string; role: string; name: string; shortName: string;
  color: string; status: string;
}

interface FleetMessage {
  id: string; timestamp: string; sender: string; senderName: string;
  senderColor: string; recipients: string[]; type: string;
  priority: string; subject: string; payload: Record<string, unknown>;
  status: string;
}

/* ── Helpers ─────────────────────────────────────────────── */

function timeStr(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const TYPE_STYLE: Record<string, string> = {
  PROPOSAL: "bg-accent/10 text-accent border-accent/20",
  ALERT: "bg-red-500/10 text-red-400 border-red-500/20",
  INSIGHT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  REQUEST: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  RESPONSE: "bg-success/10 text-success border-success/20",
  DECISION: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  DIRECTIVE: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

/* ── Component ──────────────────────────────────────────── */

export default function FleetChatroom() {
  const [messages, setMessages] = useState<FleetMessage[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [directiveType, setDirectiveType] = useState<string>("general");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  const load = useCallback(async () => {
    try {
      const [logRes, agentRes] = await Promise.all([
        fetch("/api/golddigger/fleet?action=log&limit=100"),
        fetch("/api/golddigger/fleet?action=agents"),
      ]);
      if (logRes.ok) {
        const data = await logRes.json();
        setMessages(data.messages ?? []);
      }
      if (agentRes.ok) {
        const data = await agentRes.json();
        setAgents(data.agents ?? []);
      }
    } catch { /* */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch("/api/golddigger/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "directive", type: directiveType, value: input.trim() }),
      });
      setInput("");
      await load();
    } catch { /* */ }
    setSending(false);
  }, [input, sending, load]);

  const activeAgents = agents.filter(a => a.status !== "idle");

  return (
    <div className="flex flex-col h-full">

      {/* ── Agent status bar ─────────────────────────────── */}
      <div className="flex items-center gap-3 pb-3 border-b border-border mb-0 overflow-x-auto">
        <span className="text-xs text-muted shrink-0">
          {activeAgents.length > 0 ? `${activeAgents.length} active` : "All idle"}
        </span>
        <div className="flex gap-2">
          {agents.map(a => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 shrink-0"
              title={`${a.name} — ${a.status}`}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center text-white text-[8px] font-bold"
                style={{ backgroundColor: a.color, opacity: a.status === "idle" ? 0.4 : 1 }}
              >
                {a.shortName}
              </div>
              {a.status !== "idle" && (
                <span className="text-[10px] text-accent">{a.status}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Messages ─────────────────────────────────────── */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto py-3 space-y-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted">No fleet messages yet</p>
          </div>
        )}

        {messages.map(m => {
          const isCeo = m.sender === "CEO";
          return (
            <div key={m.id} className={`flex gap-2.5 ${isCeo ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              {!isCeo && (
                <div
                  className="w-6 h-6 rounded flex items-center justify-center text-white text-[8px] font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: m.senderColor }}
                >
                  {m.senderName.slice(0, 2).toUpperCase()}
                </div>
              )}

              {/* Bubble */}
              <div className={`max-w-[75%] ${isCeo ? "ml-auto" : ""}`}>
                {!isCeo && (
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-medium text-foreground">{m.senderName}</span>
                    <span className={`text-[9px] px-1 py-0.5 rounded border ${TYPE_STYLE[m.type] || "bg-border/50 text-muted/60 border-border"}`}>
                      {m.type}
                    </span>
                    <span className="text-[9px] text-muted/50">{timeStr(m.timestamp)}</span>
                  </div>
                )}
                <div
                  className={`text-xs leading-relaxed rounded-xl px-3 py-2 ${
                    isCeo
                      ? "bg-accent text-white rounded-br-sm"
                      : "bg-card border border-border text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.subject}
                  {typeof m.payload?.details === "string" && (
                    <p className={`mt-1 text-[10px] ${isCeo ? "text-white/70" : "text-muted"}`}>
                      {m.payload.details}
                    </p>
                  )}
                </div>
                {isCeo && (
                  <p className="text-[9px] text-muted/50 text-right mt-0.5">{timeStr(m.timestamp)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Input ────────────────────────────────────────── */}
      <div className="pt-3 border-t border-border">
        <div className="flex gap-2">
          <select
            value={directiveType}
            onChange={e => setDirectiveType(e.target.value)}
            className="bg-card border border-border rounded-lg px-2 py-2 text-xs text-foreground focus:outline-none focus:border-accent"
          >
            <option value="general">General</option>
            <option value="risk_tolerance">Risk</option>
            <option value="focus_sectors">Sectors</option>
            <option value="trading_style">Style</option>
            <option value="market_outlook">Outlook</option>
          </select>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Send a directive to the fleet..."
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent transition-colors"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
