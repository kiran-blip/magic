"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import AiChat from "@/components/AiChat";

const mainNav = [
  { href: "/dashboard", label: "Overview", icon: "◆" },
];

const services = [
  { href: "/dashboard/email", label: "Email", icon: "📧" },
  { href: "/dashboard/crypto", label: "Crypto", icon: "🪙", coming: true },
  { href: "/dashboard/dev", label: "Dev", icon: "💻", coming: true },
  { href: "/dashboard/scraper", label: "Scraper", icon: "🕷️", coming: true },
  { href: "/dashboard/agent", label: "AI Agent", icon: "🤖", coming: true },
  { href: "/dashboard/files", label: "Files", icon: "📁", coming: true },
] as const;

const systemNav = [
  { href: "/dashboard/terminal", label: "Terminal", icon: "▶" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setUser(data.username))
      .catch(() => router.push("/login"));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  function NavLink({
    href,
    label,
    icon,
    coming,
  }: {
    href: string;
    label: string;
    icon: string;
    coming?: boolean;
  }) {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
          active
            ? "bg-accent/10 text-accent border border-accent/20"
            : coming
              ? "text-muted/50 hover:text-muted hover:bg-card-hover"
              : "text-muted hover:text-foreground hover:bg-card-hover"
        }`}
      >
        <span className={`text-base flex-shrink-0 ${coming ? "opacity-50" : ""}`}>{icon}</span>
        <span>{label}</span>
        {coming && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-border/50 text-muted/50">
            soon
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-card flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
            <span className="text-sm">✦</span>
          </div>
          <span className="font-semibold text-foreground">Magic</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-auto">
          {/* Main */}
          <div className="space-y-1">
            {mainNav.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>

          {/* Services */}
          <div className="mt-5 mb-2 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">
              Services
            </span>
          </div>
          <div className="space-y-1">
            {services.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>

          {/* System */}
          <div className="mt-5 mb-2 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">
              System
            </span>
          </div>
          <div className="space-y-1">
            {systemNav.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        </nav>

        {/* User */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-accent">
                {user[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {user}
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-muted hover:text-danger transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>

      {/* AI Chat */}
      <AiChat />
    </div>
  );
}
