"use client";

import { useEffect, useState, useRef } from "react";

interface Container {
  id: string;
  name: string;
  status: string;
  type: string;
}

export default function TerminalPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [history, setHistory] = useState<
    { command: string; output: string; timestamp: string }[]
  >([]);
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/containers")
      .then((res) => res.json())
      .then((data) => {
        const running = (data.containers || []).filter(
          (c: Container) => c.status === "running"
        );
        setContainers(running);
        if (running.length > 0) setSelectedContainer(running[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  async function handleExec() {
    if (!command.trim() || !selectedContainer || running) return;
    setRunning(true);
    const cmd = command;
    setCommand("");

    try {
      const res = await fetch(`/api/containers/${selectedContainer}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exec", command: cmd }),
      });
      const data = await res.json();
      setHistory((prev) => [
        ...prev,
        {
          command: cmd,
          output: data.output || data.error || "No output",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } catch {
      setHistory((prev) => [
        ...prev,
        {
          command: cmd,
          output: "Error: Connection failed",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Terminal</h1>
          <p className="text-muted mt-1">
            Execute commands in your containers
          </p>
        </div>
        <select
          value={selectedContainer}
          onChange={(e) => {
            setSelectedContainer(e.target.value);
            setHistory([]);
          }}
          className="bg-card border border-border rounded-lg px-4 py-2 text-sm text-foreground focus:outline-none focus:border-accent"
        >
          {containers.length === 0 && (
            <option value="">No running containers</option>
          )}
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
      </div>

      {/* Terminal */}
      <div className="bg-[#0d0d12] border border-border rounded-xl overflow-hidden glow">
        {/* Title bar */}
        <div className="bg-card border-b border-border px-4 py-2.5 flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/60" />
            <div className="w-3 h-3 rounded-full bg-warning/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
          </div>
          <span className="text-xs text-muted ml-3 font-mono">
            magic@{selectedContainer || "none"} ~
          </span>
        </div>

        {/* Output */}
        <div
          ref={outputRef}
          className="p-4 h-[500px] overflow-auto font-mono text-sm"
          onClick={() => inputRef.current?.focus()}
        >
          {/* Welcome */}
          <div className="text-accent mb-4">
            ✦ Magic Computer Terminal v1.0
            <br />
            <span className="text-muted">
              {selectedContainer
                ? `Connected to container ${selectedContainer}`
                : "No container selected. Deploy one from the Store."}
            </span>
          </div>

          {/* History */}
          {history.map((entry, i) => (
            <div key={i} className="mb-3">
              <div className="flex items-center gap-2">
                <span className="text-accent">$</span>
                <span className="text-foreground">{entry.command}</span>
                <span className="text-muted text-xs ml-auto">
                  {entry.timestamp}
                </span>
              </div>
              <pre className="text-muted mt-1 whitespace-pre-wrap text-xs leading-relaxed">
                {entry.output}
              </pre>
            </div>
          ))}

          {/* Input line */}
          <div className="flex items-center gap-2">
            <span className="text-accent">$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExec()}
              placeholder={
                selectedContainer
                  ? "Type a command..."
                  : "Select a container first"
              }
              disabled={!selectedContainer || running}
              className="flex-1 bg-transparent text-foreground focus:outline-none placeholder:text-muted/40 disabled:opacity-40"
              autoFocus
            />
            {running && (
              <span className="text-muted text-xs animate-pulse">
                Running...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick commands */}
      {selectedContainer && (
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            "ls -la",
            "pwd",
            "whoami",
            "uname -a",
            "df -h",
            "ps aux",
            "env",
            "cat /etc/os-release",
          ].map((cmd) => (
            <button
              key={cmd}
              onClick={() => {
                setCommand(cmd);
                inputRef.current?.focus();
              }}
              className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-muted hover:text-foreground hover:border-accent/30 transition-colors font-mono"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
