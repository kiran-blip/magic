"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function DashboardPage() {
  const [gmailConnected, setGmailConnected] = useState(false);

  useEffect(() => {
    fetch("/api/email/auth")
      .then((res) => res.json())
      .then((data) => setGmailConnected(data.authenticated || false))
      .catch(() => {});
  }, []);

  const services = [
    {
      href: "/dashboard/gold-digger",
      icon: "⛏️",
      name: "Gold Digger",
      description: "AI-powered investment analysis and market research",
      status: "connected",
      active: true,
    },
    {
      href: "/dashboard/email",
      icon: "📧",
      name: "Email",
      description: "AI-powered inbox management with Claude",
      status: gmailConnected ? "connected" : "not connected",
      active: true,
    },
    {
      href: "/dashboard/crypto",
      icon: "🪙",
      name: "Crypto",
      description: "Portfolio tracking and DeFi monitoring",
      status: "coming soon",
      active: false,
    },
    {
      href: "/dashboard/dev",
      icon: "💻",
      name: "Dev",
      description: "Development environment with AI assistant",
      status: "coming soon",
      active: false,
    },
    {
      href: "/dashboard/scraper",
      icon: "🕷️",
      name: "Scraper",
      description: "Web scraping with AI data extraction",
      status: "coming soon",
      active: false,
    },
    {
      href: "/dashboard/agent",
      icon: "🤖",
      name: "AI Agent",
      description: "Autonomous task execution with OpenClaw",
      status: "coming soon",
      active: false,
    },
    {
      href: "/dashboard/files",
      icon: "📁",
      name: "Files",
      description: "Cloud storage with AI search",
      status: "coming soon",
      active: false,
    },
  ];

  const activeCount = services.filter(
    (s) => s.status === "connected"
  ).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome to Magic Computer
        </h1>
        <p className="text-muted mt-1">
          Your personal cloud computer, always running.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-muted text-sm">Services</span>
            <span className="text-lg">✦</span>
          </div>
          <div className="text-3xl font-bold text-foreground">
            {services.length}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-muted text-sm">Connected</span>
            <span className="text-lg">▶</span>
          </div>
          <div className="text-3xl font-bold text-success">{activeCount}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-muted text-sm">Coming Soon</span>
            <span className="text-lg">◆</span>
          </div>
          <div className="text-3xl font-bold text-accent">
            {services.filter((s) => s.status === "coming soon").length}
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Your Services
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((service) => (
            <Link
              key={service.href}
              href={service.active ? service.href : "#"}
              className={`bg-card border border-border rounded-xl p-5 transition-all group ${
                service.active
                  ? "hover:border-accent/40 hover:bg-card-hover cursor-pointer"
                  : "opacity-50 cursor-default"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{service.icon}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    service.status === "connected"
                      ? "bg-success/10 text-success border border-success/20"
                      : service.status === "not connected"
                      ? "bg-warning/10 text-warning border border-warning/20"
                      : "bg-border/50 text-muted/60"
                  }`}
                >
                  {service.status}
                </span>
              </div>
              <h3
                className={`font-medium transition-colors ${
                  service.active
                    ? "text-foreground group-hover:text-accent"
                    : "text-muted"
                }`}
              >
                {service.name}
              </h3>
              <p className="text-sm text-muted mt-1">{service.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/dashboard/email"
            className="bg-card border border-border rounded-xl p-5 hover:border-accent/40 hover:bg-card-hover transition-all group"
          >
            <div className="text-2xl mb-3">📧</div>
            <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
              {gmailConnected ? "Open Email" : "Connect Gmail"}
            </h3>
            <p className="text-sm text-muted mt-1">
              {gmailConnected
                ? "Manage your inbox with AI"
                : "Connect your Gmail to get started"}
            </p>
          </Link>
          <Link
            href="/dashboard/terminal"
            className="bg-card border border-border rounded-xl p-5 hover:border-accent/40 hover:bg-card-hover transition-all group"
          >
            <div className="text-2xl mb-3">▶</div>
            <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
              Open Terminal
            </h3>
            <p className="text-sm text-muted mt-1">
              Access your server&apos;s command line
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
