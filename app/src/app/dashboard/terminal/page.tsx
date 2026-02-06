"use client";

import { useState, useRef, useEffect } from "react";

export default function TerminalPage() {
  const [history, setHistory] = useState<
    { command: string; output: string; timestamp: string }[]
  >([]);
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  async function handleExec() {
    if (!command.trim() || running) return;
    setRunning(true);
    const cmd = command;
    setCommand("");
    setCmdHistory((prev) => [cmd, ...prev]);
    setHistoryIdx(-1);

    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleExec();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
        setHistoryIdx(newIdx);
        setCommand(cmdHistory[newIdx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setCommand(cmdHistory[newIdx]);
      } else {
        setHistoryIdx(-1);
        setCommand("");
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Terminal</h1>
          <p className="text-muted mt-1">
            Execute commands on your Magic Computer server
          </p>
        </div>
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
            magic@server ~
          </span>
        </div>

        {/* Output */}
        <div
          ref={outputRef}
          className="p-4 h-[500px] overflow-auto font-mono text-sm"
          onClick={() => inputRef.current?.focus()}
        >
          <div className="text-accent mb-4">
            ✦ Magic Computer Terminal v1.0
            <br />
            <span className="text-muted">
              Connected to your server. Type commands below.
            </span>
          </div>

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

          <div className="flex items-center gap-2">
            <span className="text-accent">$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              disabled={running}
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

      <div className="mt-4 flex flex-wrap gap-2">
        {[
          "ls -la",
          "pwd",
          "whoami",
          "uname -a",
          "df -h",
          "ps aux",
          "node --version",
          "uptime",
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
    </div>
  );
}
