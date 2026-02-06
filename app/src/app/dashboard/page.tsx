"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Container {
  id: string;
  name: string;
  type: string;
  status: string;
  created: string;
}

export default function DashboardPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/containers")
      .then((res) => res.json())
      .then((data) => setContainers(data.containers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const running = containers.filter((c) => c.status === "running").length;
  const stopped = containers.filter((c) => c.status !== "running").length;

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Containers" value={containers.length} icon="▣" />
        <StatCard label="Running" value={running} icon="▶" color="success" />
        <StatCard label="Stopped" value={stopped} icon="■" color="warning" />
        <StatCard label="Available Templates" value={8} icon="✦" color="accent" />
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/dashboard/store"
            className="bg-card border border-border rounded-xl p-5 hover:border-accent/40 hover:bg-card-hover transition-all group"
          >
            <div className="text-2xl mb-3">✦</div>
            <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
              Deploy a Container
            </h3>
            <p className="text-sm text-muted mt-1">
              Browse templates and launch a new workspace
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
          <Link
            href="/dashboard/containers"
            className="bg-card border border-border rounded-xl p-5 hover:border-accent/40 hover:bg-card-hover transition-all group"
          >
            <div className="text-2xl mb-3">▣</div>
            <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
              Manage Containers
            </h3>
            <p className="text-sm text-muted mt-1">
              Start, stop, and monitor your workspaces
            </p>
          </Link>
        </div>
      </div>

      {/* Running Containers */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Active Containers
        </h2>
        {loading ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-muted">
            Loading containers...
          </div>
        ) : containers.filter((c) => c.status === "running").length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <div className="text-3xl mb-3">🚀</div>
            <p className="text-muted">No containers running yet.</p>
            <Link
              href="/dashboard/store"
              className="inline-block mt-3 text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Deploy your first container →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {containers
              .filter((c) => c.status === "running")
              .map((container) => (
                <div
                  key={container.id}
                  className="bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:border-accent/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
                    <div>
                      <div className="font-medium text-foreground">
                        {container.name}
                      </div>
                      <div className="text-xs text-muted">
                        {container.type} · {container.id}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/containers`}
                    className="text-sm text-accent hover:text-accent-hover transition-colors"
                  >
                    Manage →
                  </Link>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = "foreground",
}: {
  label: string;
  value: number;
  icon: string;
  color?: string;
}) {
  const colorClass =
    color === "success"
      ? "text-success"
      : color === "warning"
      ? "text-warning"
      : color === "accent"
      ? "text-accent"
      : "text-foreground";

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-muted text-sm">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-3xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}
