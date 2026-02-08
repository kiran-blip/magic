"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UserProfile {
  riskTolerance: "conservative" | "moderate" | "aggressive";
  capitalRange: "under_5k" | "5k_50k" | "50k_500k" | "over_500k";
  focusAreas: Array<"stocks" | "crypto" | "business" | "real_estate" | "all">;
  experienceLevel: "beginner" | "intermediate" | "advanced";
}

interface PublicConfig {
  setupComplete: boolean;
  hasAnthropicKey: boolean;
  hasOpenrouterKey: boolean;
  anthropicKeyHint: string;
  openrouterKeyHint: string;
  routingMode: string;
  preferences: {
    defaultAgent: string;
    enableDisclaimers: boolean;
    enableSafetyGovernor: boolean;
    enablePersonality: boolean;
  };
  userProfile?: UserProfile;
  createdAt: string;
  updatedAt: string;
  envOnly: boolean;
}

export default function GoldDiggerSettings() {
  const router = useRouter();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [routingMode, setRoutingMode] = useState("auto");
  const [enableDisclaimers, setEnableDisclaimers] = useState(true);
  const [enableSafety, setEnableSafety] = useState(true);
  const [enablePersonality, setEnablePersonality] = useState(true);

  // Investor profile
  const [riskTolerance, setRiskTolerance] = useState<UserProfile["riskTolerance"]>("moderate");
  const [capitalRange, setCapitalRange] = useState<UserProfile["capitalRange"]>("5k_50k");
  const [focusAreas, setFocusAreas] = useState<UserProfile["focusAreas"]>(["stocks"]);
  const [experienceLevel, setExperienceLevel] = useState<UserProfile["experienceLevel"]>("beginner");

  function toggleFocusArea(area: UserProfile["focusAreas"][number]) {
    if (area === "all") {
      setFocusAreas(["all"]);
      return;
    }
    setFocusAreas((prev) => {
      const without = prev.filter((a) => a !== "all");
      if (without.includes(area)) {
        const result = without.filter((a) => a !== area);
        return result.length === 0 ? ["stocks"] : result;
      }
      return [...without, area];
    });
  }

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  /* ── Load current config ─────────────────────── */

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/jarvis/settings");
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setRoutingMode(data.routingMode || "auto");
          setEnableDisclaimers(data.preferences?.enableDisclaimers ?? true);
          setEnableSafety(data.preferences?.enableSafetyGovernor ?? true);
          setEnablePersonality(data.preferences?.enablePersonality ?? true);
          // Load investor profile
          if (data.userProfile) {
            setRiskTolerance(data.userProfile.riskTolerance ?? "moderate");
            setCapitalRange(data.userProfile.capitalRange ?? "5k_50k");
            setFocusAreas(data.userProfile.focusAreas ?? ["stocks"]);
            setExperienceLevel(data.userProfile.experienceLevel ?? "beginner");
          }
        }
      } catch {
        setError("Failed to load settings");
      }
      setLoading(false);
    }
    load();
  }, []);

  /* ── Save settings ───────────────────────────── */

  async function saveSettings() {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const body: Record<string, unknown> = {
        routingMode,
        preferences: {
          defaultAgent: "auto",
          enableDisclaimers,
          enableSafetyGovernor: enableSafety,
          enablePersonality,
        },
        userProfile: {
          riskTolerance,
          capitalRange,
          focusAreas,
          experienceLevel,
        },
      };

      // Only send keys if user entered new ones
      if (anthropicKey.trim()) body.anthropicApiKey = anthropicKey.trim();
      if (openrouterKey.trim()) body.openrouterApiKey = openrouterKey.trim();

      const res = await fetch("/api/jarvis/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        setSaved(true);
        setConfig(data.config);
        setAnthropicKey("");
        setOpenrouterKey("");
        if (data.warning) {
          setWarning(data.warning);
          setTimeout(() => setWarning(""), 8000);
        }
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Failed to save settings");
    }
    setSaving(false);
  }

  /* ── Render ──────────────────────────────────── */

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
        <div className="text-muted text-sm">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gold Digger Settings</h1>
          <p className="text-sm text-muted mt-1">Manage API keys, routing, and preferences</p>
        </div>
        <Link
          href="/dashboard/gold-digger"
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Back to chat
        </Link>
      </div>

      {/* Railway env-only notice */}
      {config?.envOnly && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 text-sm">
          <div className="font-medium text-warning mb-1">Environment Variable Mode</div>
          <div className="text-muted text-xs">
            Config changes {"won't"} persist across deploys. To make settings permanent, set environment variables in your Railway dashboard
            (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, etc.) or attach a Railway Volume at /app/data.
          </div>
        </div>
      )}

      {/* Status card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-foreground">Connection Status</div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            config?.hasAnthropicKey || config?.hasOpenrouterKey
              ? "bg-success/10 text-success border border-success/20"
              : "bg-warning/10 text-warning border border-warning/20"
          }`}>
            {config?.hasAnthropicKey || config?.hasOpenrouterKey ? "configured" : "no keys"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">Anthropic</span>
            <span className={`text-xs ${config?.hasAnthropicKey ? "text-success" : "text-muted/50"}`}>
              {config?.hasAnthropicKey ? config.anthropicKeyHint : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">OpenRouter</span>
            <span className={`text-xs ${config?.hasOpenrouterKey ? "text-success" : "text-muted/50"}`}>
              {config?.hasOpenrouterKey ? config.openrouterKeyHint : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">Routing Mode</span>
            <span className="text-xs text-foreground">{config?.routingMode || "auto"}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border">
            <span className="text-xs text-muted">Last Updated</span>
            <span className="text-xs text-foreground">
              {config?.updatedAt ? new Date(config.updatedAt).toLocaleDateString() : "Never"}
            </span>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-foreground">Update API Keys</div>
        <p className="text-xs text-muted">Leave blank to keep existing key. Enter a new key to replace it.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted mb-1 block">Anthropic API Key</label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder={config?.hasAnthropicKey ? `Current: ${config.anthropicKeyHint}` : "sk-ant-api03-..."}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">OpenRouter API Key</label>
            <input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder={config?.hasOpenrouterKey ? `Current: ${config.openrouterKeyHint}` : "sk-or-v1-..."}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* Routing Mode */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-foreground">Routing Mode</div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "auto", label: "Auto", disabled: false },
            { value: "hybrid", label: "Hybrid", disabled: !config?.hasAnthropicKey || !config?.hasOpenrouterKey },
            { value: "anthropic_only", label: "Anthropic Only", disabled: !config?.hasAnthropicKey },
            { value: "openrouter_only", label: "OpenRouter Only", disabled: !config?.hasOpenrouterKey },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => !opt.disabled && setRoutingMode(opt.value)}
              disabled={opt.disabled || !!config?.envOnly}
              className={`px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                opt.disabled
                  ? "border-border bg-background text-muted/30 cursor-not-allowed"
                  : routingMode === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:text-foreground hover:border-accent/40"
              } ${config?.envOnly ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {opt.label}
              {opt.disabled && <span className="block text-[10px] text-muted/40">No key</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Feature Toggles */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-foreground">Features</div>
        {([
          { key: "disclaimers", label: "Financial Disclaimers", desc: "Auto-append disclaimers to investment analysis", value: enableDisclaimers, setter: setEnableDisclaimers },
          { key: "safety", label: "Safety Governor", desc: "Content guard, credential detection, PII filtering", value: enableSafety, setter: setEnableSafety },
          { key: "personality", label: "JARVIS Personality", desc: "Warm, witty AI personality in responses", value: enablePersonality, setter: setEnablePersonality },
        ] as const).map((t) => (
          <div key={t.key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div>
              <div className="text-sm text-foreground">{t.label}</div>
              <div className="text-xs text-muted">{t.desc}</div>
            </div>
            <button
              onClick={() => t.setter(!t.value)}
              className={`w-10 h-5 rounded-full transition-colors relative ${t.value ? "bg-accent" : "bg-border"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${t.value ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Investor Profile */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <div className="text-sm font-medium text-foreground">Investor Profile</div>
          <p className="text-xs text-muted mt-0.5">These shape how Gold Digger AGI tailors its analysis and recommendations for you</p>
        </div>

        {/* Risk Tolerance */}
        <div>
          <div className="text-xs text-muted mb-2">Risk Tolerance</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "conservative" as const, label: "Conservative", icon: "🛡️" },
              { value: "moderate" as const, label: "Moderate", icon: "⚖️" },
              { value: "aggressive" as const, label: "Aggressive", icon: "🚀" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRiskTolerance(opt.value)}
                className={`px-3 py-2.5 rounded-lg border text-xs transition-colors ${
                  riskTolerance === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                <span className="mr-1">{opt.icon}</span> {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Capital Range */}
        <div>
          <div className="text-xs text-muted mb-2">Investment Capital</div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "under_5k" as const, label: "Under $5K" },
              { value: "5k_50k" as const, label: "$5K – $50K" },
              { value: "50k_500k" as const, label: "$50K – $500K" },
              { value: "over_500k" as const, label: "$500K+" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCapitalRange(opt.value)}
                className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                  capitalRange === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus Areas */}
        <div>
          <div className="text-xs text-muted mb-2">Focus Areas <span className="text-muted/40">(multi-select)</span></div>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: "stocks" as const, label: "Stocks & ETFs" },
              { value: "crypto" as const, label: "Crypto & Web3" },
              { value: "business" as const, label: "Business & Side Income" },
              { value: "real_estate" as const, label: "Real Estate" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleFocusArea(opt.value)}
                className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                  focusAreas.includes(opt.value) || focusAreas.includes("all")
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Experience Level */}
        <div>
          <div className="text-xs text-muted mb-2">Experience Level</div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "beginner" as const, label: "Beginner" },
              { value: "intermediate" as const, label: "Intermediate" },
              { value: "advanced" as const, label: "Advanced" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setExperienceLevel(opt.value)}
                className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                  experienceLevel === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-background text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/dashboard/gold-digger/setup")}
          className="px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-muted hover:text-foreground transition-colors"
        >
          Re-run Setup Wizard
        </button>

        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-success">Settings saved</span>}
          {warning && <span className="text-sm text-warning">{warning}</span>}
          {error && <span className="text-sm text-danger">{error}</span>}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
