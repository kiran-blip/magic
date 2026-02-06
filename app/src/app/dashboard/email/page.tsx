"use client";

import { useEffect, useState, useRef } from "react";

interface Email {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  labels: string[];
  isUnread: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function EmailPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [authUrl, setAuthUrl] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"inbox" | "chat">("inbox");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const error = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("error");

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatMessages]);

  async function checkAuth() {
    try {
      const res = await fetch("/api/email/auth");
      const data = await res.json();
      setAuthenticated(data.authenticated);
      if (!data.authenticated && data.authUrl) {
        setAuthUrl(data.authUrl);
      }
      if (data.authenticated) {
        fetchEmails();
      }
    } catch {
      setAuthenticated(false);
    }
  }

  async function fetchEmails(q: string = "") {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("max", "20");
      const res = await fetch(`/api/email/messages?${params}`);
      const data = await res.json();
      setEmails(data.emails || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailAction(id: string, action: string) {
    try {
      await fetch(`/api/email/messages/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (action === "trash" || action === "archive") {
        setEmails((prev) => prev.filter((e) => e.id !== id));
        if (selectedEmail?.id === id) setSelectedEmail(null);
      }
      if (action === "read") {
        setEmails((prev) =>
          prev.map((e) => (e.id === id ? { ...e, isUnread: false } : e))
        );
      }
    } catch {}
  }

  async function handleChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: userMsg },
    ];
    setChatMessages(newMessages);
    setChatLoading(true);

    try {
      const res = await fetch("/api/email/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: data.reply || data.error || "No response" },
      ]);
    } catch {
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: "Connection failed." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // Not connected state
  if (authenticated === null) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (authenticated === false) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            📧 Email Manager
          </h1>
          <p className="text-muted mt-1">
            AI-powered email with Claude MCP
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-danger/10 border border-danger/20 text-danger rounded-lg px-4 py-3 text-sm">
            Auth error: {error}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-8 text-center max-w-lg mx-auto">
          <div className="text-4xl mb-4">📧</div>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Connect Gmail
          </h2>
          <p className="text-sm text-muted mb-6">
            Connect your Gmail account to let Magic Computer manage your email
            with AI. Claude will be able to read, summarize, draft replies, and
            clean up your inbox.
          </p>
          {authUrl ? (
            <a
              href={authUrl}
              className="inline-block px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              Connect Gmail Account
            </a>
          ) : (
            <div className="text-sm text-muted">
              <p className="mb-2">Google OAuth not configured.</p>
              <p>
                Set <code className="text-accent">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="text-accent">GOOGLE_CLIENT_SECRET</code> in
                your environment variables.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Connected state
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            📧 Email Manager
          </h1>
          <p className="text-muted mt-1">
            {view === "inbox" ? "Your inbox" : "Chat with Claude about your emails"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (confirm("Disconnect Gmail?")) {
                await fetch("/api/email/auth/disconnect", { method: "POST" });
                setAuthenticated(false);
                setEmails([]);
              }
            }}
            className="px-3 py-2 rounded-lg text-xs bg-card border border-border text-muted hover:text-danger hover:border-danger/30 transition-colors"
          >
            Disconnect
          </button>
          <button
            onClick={() => setView("inbox")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              view === "inbox"
                ? "bg-accent text-white"
                : "bg-card border border-border text-muted hover:text-foreground"
            }`}
          >
            Inbox
          </button>
          <button
            onClick={() => setView("chat")}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              view === "chat"
                ? "bg-accent text-white"
                : "bg-card border border-border text-muted hover:text-foreground"
            }`}
          >
            AI Chat
          </button>
        </div>
      </div>

      {view === "inbox" ? (
        <div>
          {/* Search */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchEmails(query)}
              placeholder="Search emails (e.g. is:unread, from:boss@...)"
              className="flex-1 bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => fetchEmails(query)}
              className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors"
            >
              Search
            </button>
            <button
              onClick={() => {
                setQuery("");
                fetchEmails();
              }}
              className="px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted hover:text-foreground transition-colors"
            >
              Refresh
            </button>
          </div>

          <div className="flex gap-4">
            {/* Email list */}
            <div className="flex-1 space-y-2">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-card border border-border rounded-xl p-4 animate-pulse"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="h-4 w-32 bg-border rounded" />
                            <div className="h-3 w-16 bg-border rounded" />
                          </div>
                          <div className="h-4 w-48 bg-border rounded mt-2" />
                          <div className="h-3 w-64 bg-border rounded mt-2" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : emails.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-8 text-center text-muted">
                  No emails found.
                </div>
              ) : (
                emails.map((email) => (
                  <div
                    key={email.id}
                    onClick={() => {
                      setSelectedEmail(email);
                      if (email.isUnread) handleEmailAction(email.id, "read");
                    }}
                    className={`bg-card border rounded-xl p-4 cursor-pointer transition-all ${
                      selectedEmail?.id === email.id
                        ? "border-accent/40 glow"
                        : "border-border hover:border-accent/20"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {email.isUnread && (
                        <div className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm truncate ${
                              email.isUnread
                                ? "font-semibold text-foreground"
                                : "text-muted"
                            }`}
                          >
                            {email.from.replace(/<.*>/, "").trim()}
                          </span>
                          <span className="text-xs text-muted flex-shrink-0 ml-2">
                            {new Date(email.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div
                          className={`text-sm truncate mt-0.5 ${
                            email.isUnread ? "text-foreground" : "text-muted"
                          }`}
                        >
                          {email.subject}
                        </div>
                        <div className="text-xs text-muted truncate mt-0.5">
                          {email.snippet}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Email detail */}
            {selectedEmail && (
              <div className="w-[450px] bg-card border border-border rounded-xl flex flex-col max-h-[calc(100vh-220px)]">
                <div className="p-4 border-b border-border">
                  <h3 className="font-medium text-foreground">
                    {selectedEmail.subject}
                  </h3>
                  <div className="text-sm text-muted mt-1">
                    From: {selectedEmail.from}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {new Date(selectedEmail.date).toLocaleString()}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() =>
                        handleEmailAction(selectedEmail.id, "archive")
                      }
                      className="px-3 py-1.5 text-xs bg-card border border-border rounded-lg text-muted hover:text-foreground transition-colors"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() =>
                        handleEmailAction(selectedEmail.id, "trash")
                      }
                      className="px-3 py-1.5 text-xs bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition-colors"
                    >
                      Trash
                    </button>
                    <button
                      onClick={() => {
                        setView("chat");
                        setChatInput(
                          `Draft a reply to this email from ${selectedEmail.from} with subject "${selectedEmail.subject}"`
                        );
                      }}
                      className="px-3 py-1.5 text-xs bg-accent/10 text-accent border border-accent/20 rounded-lg hover:bg-accent/20 transition-colors"
                    >
                      AI Reply
                    </button>
                  </div>
                </div>
                <div className="p-4 overflow-auto flex-1 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {selectedEmail.body.replace(/<[^>]*>/g, "")}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* AI Chat View */
        <div className="bg-card border border-border rounded-xl overflow-hidden max-w-3xl mx-auto" style={{ height: "calc(100vh - 220px)" }}>
          {/* Chat messages */}
          <div
            ref={chatRef}
            className="flex-1 overflow-auto p-6 space-y-4"
            style={{ height: "calc(100% - 72px)" }}
          >
            {chatMessages.length === 0 && (
              <div className="text-center py-12">
                <div className="text-3xl mb-3">📧</div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  Email AI Assistant
                </h3>
                <p className="text-sm text-muted mb-6 max-w-md mx-auto">
                  Ask Claude to manage your inbox. It can read, summarize,
                  draft replies, clean up, and more.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    "Summarize my unread emails",
                    "Find emails from last week I haven't replied to",
                    "Draft a reply to the latest email",
                    "Find and unsubscribe from newsletters",
                    "What are my most urgent emails?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setChatInput(suggestion);
                      }}
                      className="px-3 py-2 bg-background border border-border rounded-lg text-xs text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => (
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

            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-background border border-border rounded-xl rounded-bl-sm px-4 py-3 text-sm text-muted">
                  Reading your emails and thinking...
                </div>
              </div>
            )}
          </div>

          {/* Chat input */}
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChat()}
                placeholder="Ask about your emails..."
                className="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
