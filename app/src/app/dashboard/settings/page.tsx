"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openclawUrl, setOpenclawUrl] = useState("http://localhost:11434");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // In production, these would be saved server-side
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted mt-1">Configure your Magic Computer</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* LLM Configuration */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            LLM Configuration
          </h2>
          <p className="text-sm text-muted mb-5">
            Connect your AI provider for smart container features.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Anthropic API Key
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-muted mt-1">
                Used for Claude MCP integration in containers.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                OpenClaw / Ollama URL
              </label>
              <input
                type="text"
                value={openclawUrl}
                onChange={(e) => setOpenclawUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-muted mt-1">
                Local LLM endpoint for OpenClaw agent features.
              </p>
            </div>
          </div>
        </div>

        {/* Server Info */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Server
          </h2>
          <p className="text-sm text-muted mb-5">
            Your Magic Computer server details.
          </p>

          <div className="space-y-3">
            <InfoRow label="Platform" value="Docker (Local)" />
            <InfoRow label="Storage" value="Host filesystem" />
            <InfoRow label="Network" value="Bridge (magic-network)" />
            <InfoRow label="Status" value="Running" valueColor="text-success" />
          </div>
        </div>

        {/* Export */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Export & Backup
          </h2>
          <p className="text-sm text-muted mb-5">
            Export your entire Magic Computer setup.
          </p>

          <div className="flex gap-3">
            <button className="px-4 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-lg text-sm hover:bg-accent hover:text-white transition-all">
              Export Docker Compose
            </button>
            <button className="px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted hover:text-foreground transition-colors">
              Backup All Volumes
            </button>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors"
          >
            Save Settings
          </button>
          {saved && (
            <span className="text-sm text-success">Settings saved!</span>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  valueColor = "text-foreground",
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm font-medium ${valueColor}`}>{value}</span>
    </div>
  );
}
