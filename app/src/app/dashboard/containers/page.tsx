"use client";

import { useEffect, useState } from "react";

interface Container {
  id: string;
  name: string;
  type: string;
  status: string;
  created: string;
  ports: { [key: string]: string };
  labels: { [key: string]: string };
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: string; content: string } | null>(null);
  const [execModal, setExecModal] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [execOutput, setExecOutput] = useState("");

  async function fetchContainers() {
    try {
      const res = await fetch("/api/containers");
      const data = await res.json();
      setContainers(data.containers || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(id: string, action: string) {
    setActionLoading(`${id}-${action}`);
    try {
      if (action === "remove") {
        await fetch(`/api/containers/${id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/containers/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      }
      await fetchContainers();
    } catch {
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLogs(id: string) {
    const res = await fetch(`/api/containers/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logs" }),
    });
    const data = await res.json();
    setLogs({ id, content: data.logs || "No logs available" });
  }

  async function handleExec(id: string) {
    if (!command.trim()) return;
    const res = await fetch(`/api/containers/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "exec", command }),
    });
    const data = await res.json();
    setExecOutput(data.output || data.error || "No output");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Containers</h1>
          <p className="text-muted mt-1">Manage your running workspaces</p>
        </div>
        <button
          onClick={fetchContainers}
          className="px-4 py-2 bg-card border border-border rounded-lg text-sm text-muted hover:text-foreground hover:border-accent/40 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted">
          Loading containers...
        </div>
      ) : containers.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">▣</div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            No containers yet
          </h3>
          <p className="text-muted mb-4">
            Deploy a container from the Store to get started.
          </p>
          <a
            href="/dashboard/store"
            className="inline-block px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors"
          >
            Browse Store
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {containers.map((container) => (
            <div
              key={container.id}
              className="bg-card border border-border rounded-xl p-5 hover:border-accent/20 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      container.status === "running"
                        ? "bg-success animate-pulse-dot"
                        : "bg-muted"
                    }`}
                  />
                  <div>
                    <h3 className="font-medium text-foreground">
                      {container.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                        {container.type}
                      </span>
                      <span className="text-xs text-muted">
                        ID: {container.id}
                      </span>
                      <span
                        className={`text-xs ${
                          container.status === "running"
                            ? "text-success"
                            : "text-muted"
                        }`}
                      >
                        {container.status}
                      </span>
                    </div>
                    {Object.keys(container.ports).length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {Object.entries(container.ports).map(([port, host]) => (
                          <span
                            key={port}
                            className="text-xs px-2 py-0.5 bg-background rounded border border-border text-muted"
                          >
                            {port} → {host}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {container.status === "running" ? (
                    <button
                      onClick={() => handleAction(container.id, "stop")}
                      disabled={actionLoading === `${container.id}-stop`}
                      className="px-3 py-1.5 text-xs bg-warning/10 text-warning border border-warning/20 rounded-lg hover:bg-warning/20 transition-colors disabled:opacity-50"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(container.id, "start")}
                      disabled={actionLoading === `${container.id}-start`}
                      className="px-3 py-1.5 text-xs bg-success/10 text-success border border-success/20 rounded-lg hover:bg-success/20 transition-colors disabled:opacity-50"
                    >
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => handleLogs(container.id)}
                    className="px-3 py-1.5 text-xs bg-card border border-border rounded-lg text-muted hover:text-foreground transition-colors"
                  >
                    Logs
                  </button>
                  <button
                    onClick={() => {
                      setExecModal(container.id);
                      setCommand("");
                      setExecOutput("");
                    }}
                    className="px-3 py-1.5 text-xs bg-card border border-border rounded-lg text-muted hover:text-foreground transition-colors"
                  >
                    Exec
                  </button>
                  <button
                    onClick={() => handleAction(container.id, "remove")}
                    disabled={actionLoading === `${container.id}-remove`}
                    className="px-3 py-1.5 text-xs bg-danger/10 text-danger border border-danger/20 rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Logs Modal */}
      {logs && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
          <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-medium text-foreground">
                Logs — {logs.id}
              </h3>
              <button
                onClick={() => setLogs(null)}
                className="text-muted hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            <pre className="p-4 text-xs text-muted font-mono overflow-auto flex-1 whitespace-pre-wrap">
              {logs.content}
            </pre>
          </div>
        </div>
      )}

      {/* Exec Modal */}
      {execModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-8">
          <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-medium text-foreground">
                Execute in — {execModal}
              </h3>
              <button
                onClick={() => setExecModal(null)}
                className="text-muted hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4 border-b border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleExec(execModal)
                  }
                  placeholder="Enter command (e.g. ls -la)"
                  className="flex-1 bg-background border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => handleExec(execModal)}
                  className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
                >
                  Run
                </button>
              </div>
            </div>
            <pre className="p-4 text-xs text-muted font-mono overflow-auto flex-1 whitespace-pre-wrap min-h-[200px]">
              {execOutput || "Output will appear here..."}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
