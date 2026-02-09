"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TierProvider, useTier } from "./components/TierProvider";
import { TIER_INFO, type UserTier } from "@/lib/golddigger/tier";
import type { Notification } from "@/lib/golddigger/notifications";

// ── SVG icons by nav key ──────────────────────────────────────────────────

const NAV_ICONS: Record<string, React.ReactNode> = {
  chat: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  investments: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  fleet: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  chatroom: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  trading: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  portfolio: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  watchlist: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  rules: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  predictions: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

// ── Taglines by tier ──────────────────────────────────────────────────────

const TIER_TAGLINES: Record<UserTier, string> = {
  newbie: "Your AI investment company — fully automated",
  intermediate: "AI-powered trading — you approve, we execute",
  expert: "Full fleet control — investment analysis, market research, automated trading",
};

// ── Inner layout (uses tier context) ──────────────────────────────────────

function GoldDiggerLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tier, navItems, loading: tierLoading } = useTier();
  const [status, setStatus] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => {
      fetch("/api/golddigger/health")
        .then((r) => r.json())
        .then((d) => setStatus(d.status))
        .catch(() => setStatus("error"));
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const res = await fetch("/api/golddigger/notifications?limit=10");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications ?? []);
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch {
        // Non-critical
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notifPanelRef.current &&
        !notifPanelRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    }

    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/golddigger/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-all-read" }),
      });
      setUnreadCount(0);
      setNotifications(notifications.map((n) => ({ ...n, read: true })));
    } catch {
      // Non-critical
    }
  };

  function isActive(href: string) {
    if (href === "/dashboard/gold-digger") {
      return pathname === href;
    }
    if (href === "/dashboard/gold-digger/fleet") {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  const tierInfo = TIER_INFO[tier];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-lg">{"\u26CF\uFE0F"}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">
              Gold Digger{" "}
              <span className="text-accent text-xs font-normal align-middle">
                AGI
              </span>
            </h1>
            <p className="text-muted text-[11px] leading-tight">
              {TIER_TAGLINES[tier]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Notifications Bell */}
          <div className="relative" ref={notifPanelRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card border border-transparent hover:border-border transition-colors"
              title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
            >
              {/* Bell icon */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {/* Unread count badge */}
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Notifications dropdown panel */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-lg shadow-black/20 z-50">
                {/* Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-accent hover:text-accent-hover transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notifications list */}
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <div className="text-2xl mb-2">🔔</div>
                    <div className="text-sm text-muted">No notifications yet</div>
                    <div className="text-xs text-muted/50 mt-1">
                      You're all caught up
                    </div>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto divide-y divide-border">
                    {notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className={`px-4 py-3 transition-colors ${
                          notif.read ? "bg-background/50" : "bg-background hover:bg-background/70"
                        }`}
                      >
                        {/* Priority indicator + type */}
                        <div className="flex items-start gap-2 mb-1">
                          <div
                            className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${
                              notif.priority === "high"
                                ? "bg-red-400"
                                : notif.priority === "medium"
                                  ? "bg-amber-400"
                                  : "bg-blue-400"
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {notif.title}
                              </span>
                              <span className="text-[10px] text-muted/60 flex-shrink-0 whitespace-nowrap">
                                {notif.type.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">
                              {notif.message}
                            </p>
                            <div className="text-[10px] text-muted/50 mt-1">
                              {new Date(notif.timestamp).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                {notifications.length > 0 && (
                  <div className="px-4 py-2 border-t border-border text-center">
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="text-xs text-muted hover:text-foreground transition-colors"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tier badge */}
          {!tierLoading && (
            <Link
              href="/dashboard/gold-digger/settings"
              className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${tierInfo.bgColor} ${tierInfo.color} ${tierInfo.borderColor} border hover:opacity-80`}
            >
              {tierInfo.emoji} {tierInfo.label}
            </Link>
          )}
          {/* Health status */}
          <span
            className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${
              status === "ready"
                ? "bg-success/10 text-success border border-success/20"
                : status === "unconfigured"
                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                  : status === "error"
                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : "bg-border/50 text-muted/60"
            }`}
          >
            {status === "ready"
              ? "\u25CF Online"
              : status === "unconfigured"
                ? "\u25CF No API Key"
                : status === "error"
                  ? "\u25CF Offline"
                  : "\u25CF Checking..."}
          </span>
        </div>
      </div>

      {/* ─── Navigation Tabs (tier-filtered) ────────────────── */}
      <nav aria-label="Gold Digger navigation" className="flex gap-1 mb-3 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-none">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const icon = NAV_ICONS[item.key] || NAV_ICONS.chat;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.description}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap border ${
                active
                  ? "bg-accent/10 text-accent border-accent/25 shadow-sm shadow-accent/5"
                  : "text-muted border-transparent hover:text-foreground hover:bg-card hover:border-border"
              }`}
            >
              <span
                aria-hidden="true"
                className={`transition-colors ${
                  active
                    ? "text-accent"
                    : "text-muted/60 group-hover:text-foreground"
                }`}
              >
                {icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ─── Page Content ───────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
    </div>
  );
}

// ── Outer layout wraps with TierProvider ──────────────────────────────────

export default function GoldDiggerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TierProvider>
      <GoldDiggerLayoutInner>{children}</GoldDiggerLayoutInner>
    </TierProvider>
  );
}
