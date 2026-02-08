"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/* ── Step definitions ────────────────────────────── */

type Step = "welcome" | "keys" | "preferences" | "test" | "complete";

const STEPS: Step[] = ["welcome", "keys", "preferences", "test", "complete"];

const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  keys: "API Keys",
  preferences: "Preferences",
  test: "Test",
  complete: "Done",
};

/* ── Page component ──────────────────────────────── */

export default function GoldDiggerSetup() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [routingMode, setRoutingMode] = useState<string>("auto");
  const [enableDisclaimers, setEnableDisclaimers] = useState(true);
  const [enableSafety, setEnableSafety] = useState(true);
  const [enablePersonality, setEnablePersonality] = useState(true);

  const [testStatus, setTestStatus] = useState<Record<string, { testing: boolean; result?: { success: boolean; message: string } }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stepIndex = STEPS.indexOf(step);

  /* ── API key testing ─────────────────────────── */

  async function testKey(provider: "anthropic" | "openrouter", apiKey: string) {
    if (!apiKey.trim()) return;
    setTestStatus((prev) => ({ ...prev, [provider]: { testing: true } }));

    try {
      const res = await fetch("/api/jarvis/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      const data = await res.json();
      setTestStatus((prev) => ({ ...prev, [provider]: { testing: false, result: data } }));
    } catch {
      setTestStatus((prev) => ({
        ...prev,
        [provider]: { testing: false, result: { success: false, message: "Connection failed" } },
      }));
    }
  }

  /* ── Complete setup ──────────────────────────── */

  async function completeSetup() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/jarvis/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropicApiKey: anthropicKey,
          openrouterApiKey: openrouterKey,
          routingMode,
          preferences: {
            defaultAgent: "auto",
            enableDisclaimers,
            enableSafetyGovernor: enableSafety,
            enablePersonality,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Setup failed");
        setSaving(false);
        return;
      }
      setStep("complete");
    } catch {
      setError("Failed to save settings");
    }
    setSaving(false);
  }

  /* ── Step: Welcome ───────────────────────────── */

  function renderWelcome() {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <div className="text-5xl">&#x26CF;&#xFE0F;</div>
          <h2 className="text-2xl font-bold text-foreground">Welcome to Gold Digger</h2>
          <p className="text-muted text-sm max-w-md mx-auto">
            AI-powered investment analysis and market research, built into Magic.
            {"Let's"} get you set up in a few quick steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          {[
            { icon: "\uD83D\uDCCA", title: "Investment Analysis", desc: "6-node pipeline with live market data, technicals, and AI recommendations" },
            { icon: "\uD83D\uDD2C", title: "Market Research", desc: "7-node pipeline with competitive analysis, opportunity scoring, and insights" },
            { icon: "\uD83D\uDEE1\uFE0F", title: "Safety Built In", desc: "Content guard with 60+ patterns, credential detection, and disclaimers" },
          ].map((f) => (
            <div key={f.title} className="bg-background border border-border rounded-lg p-4 text-center">
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-sm font-medium text-foreground mb-1">{f.title}</div>
              <div className="text-xs text-muted">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Step: API Keys ──────────────────────────── */

  function renderKeys() {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-xl font-bold text-foreground">API Keys</h2>
          <p className="text-muted text-sm">Gold Digger needs at least one API key. Both is ideal for cost savings.</p>
        </div>

        {/* Anthropic */}
        <div className="bg-background border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">Anthropic API Key</div>
              <div className="text-xs text-muted">Used for premium analysis (Claude Sonnet)</div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">Recommended</span>
          </div>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent"
          />
          {testStatus.anthropic?.result && (
            <div className={`text-xs ${testStatus.anthropic.result.success ? "text-success" : "text-danger"}`}>
              {testStatus.anthropic.result.message}
            </div>
          )}
        </div>

        {/* OpenRouter */}
        <div className="bg-background border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">OpenRouter API Key</div>
              <div className="text-xs text-muted">Used for cost-efficient light/standard tasks</div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-border/50 text-muted/60">Optional</span>
          </div>
          <input
            type="password"
            value={openrouterKey}
            onChange={(e) => setOpenrouterKey(e.target.value)}
            placeholder="sk-or-v1-..."
            className="w-full bg-card border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-accent"
          />
          {testStatus.openrouter?.result && (
            <div className={`text-xs ${testStatus.openrouter.result.success ? "text-success" : "text-danger"}`}>
              {testStatus.openrouter.result.message}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4 text-xs text-muted space-y-1">
          <div className="font-medium text-foreground mb-2">How routing works:</div>
          <div><span className="text-accent">Both keys</span> = Hybrid mode (cheapest). Light tasks use OpenRouter, premium uses Claude.</div>
          <div><span className="text-accent">Anthropic only</span> = Claude handles everything. Most reliable, ~10x more expensive.</div>
          <div><span className="text-accent">OpenRouter only</span> = All tiers via OpenRouter. Most affordable.</div>
        </div>
      </div>
    );
  }

  /* ── Step: Preferences ───────────────────────── */

  function renderPreferences() {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-xl font-bold text-foreground">Preferences</h2>
          <p className="text-muted text-sm">Fine-tune behavior. You can change these anytime in settings.</p>
        </div>

        <div className="bg-background border border-border rounded-xl p-5 space-y-3">
          <div className="text-sm font-medium text-foreground">Routing Mode</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "auto", label: "Auto", desc: "Best mode based on available keys" },
              { value: "hybrid", label: "Hybrid", desc: "OpenRouter cheap + Anthropic premium" },
              { value: "anthropic_only", label: "Anthropic Only", desc: "Claude handles all tasks" },
              { value: "openrouter_only", label: "OpenRouter Only", desc: "All tasks via OpenRouter" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRoutingMode(opt.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  routingMode === opt.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-card text-muted hover:border-accent/40 hover:text-foreground"
                }`}
              >
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-background border border-border rounded-xl p-5 space-y-4">
          <div className="text-sm font-medium text-foreground">Features</div>
          {([
            { key: "disclaimers", label: "Financial Disclaimers", desc: "Auto-append investment disclaimers", value: enableDisclaimers, setter: setEnableDisclaimers },
            { key: "safety", label: "Safety Governor", desc: "Block risky content, detect credentials & PII", value: enableSafety, setter: setEnableSafety },
            { key: "personality", label: "JARVIS Personality", desc: "Witty, warm, personality-driven responses", value: enablePersonality, setter: setEnablePersonality },
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
      </div>
    );
  }

  /* ── Step: Test ──────────────────────────────── */

  function renderTest() {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-xl font-bold text-foreground">Test Connection</h2>
          <p className="text-muted text-sm">Verify your API keys before finishing.</p>
        </div>

        <div className="space-y-4">
          {anthropicKey && (
            <div className="bg-background border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">Anthropic (Claude)</div>
                  <div className="text-xs text-muted">sk-ant...{anthropicKey.slice(-4)}</div>
                </div>
                <div className="flex items-center gap-3">
                  {testStatus.anthropic?.result && (
                    <span className={`text-xs ${testStatus.anthropic.result.success ? "text-success" : "text-danger"}`}>
                      {testStatus.anthropic.result.success ? "Connected" : "Failed"}
                    </span>
                  )}
                  <button
                    onClick={() => testKey("anthropic", anthropicKey)}
                    disabled={testStatus.anthropic?.testing}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs transition-colors disabled:opacity-50"
                  >
                    {testStatus.anthropic?.testing ? "Testing..." : "Test"}
                  </button>
                </div>
              </div>
              {testStatus.anthropic?.result && !testStatus.anthropic.result.success && (
                <div className="text-xs text-danger mt-3 bg-danger/10 rounded-lg p-2">{testStatus.anthropic.result.message}</div>
              )}
            </div>
          )}

          {openrouterKey && (
            <div className="bg-background border border-border rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">OpenRouter</div>
                  <div className="text-xs text-muted">sk-or...{openrouterKey.slice(-4)}</div>
                </div>
                <div className="flex items-center gap-3">
                  {testStatus.openrouter?.result && (
                    <span className={`text-xs ${testStatus.openrouter.result.success ? "text-success" : "text-danger"}`}>
                      {testStatus.openrouter.result.success ? "Connected" : "Failed"}
                    </span>
                  )}
                  <button
                    onClick={() => testKey("openrouter", openrouterKey)}
                    disabled={testStatus.openrouter?.testing}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs transition-colors disabled:opacity-50"
                  >
                    {testStatus.openrouter?.testing ? "Testing..." : "Test"}
                  </button>
                </div>
              </div>
              {testStatus.openrouter?.result && !testStatus.openrouter.result.success && (
                <div className="text-xs text-danger mt-3 bg-danger/10 rounded-lg p-2">{testStatus.openrouter.result.message}</div>
              )}
            </div>
          )}

          {!anthropicKey && !openrouterKey && (
            <div className="text-center text-muted text-sm py-8">No API keys entered. Go back to add at least one.</div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-4 text-xs text-muted">
          Testing sends a minimal request to verify your key. You can skip and finish setup.
        </div>
      </div>
    );
  }

  /* ── Step: Complete ──────────────────────────── */

  function renderComplete() {
    return (
      <div className="text-center space-y-6 py-8">
        <div className="text-5xl">{"\uD83C\uDF89"}</div>
        <h2 className="text-2xl font-bold text-foreground">{"You're"} All Set</h2>
        <p className="text-muted text-sm max-w-sm mx-auto">
          Gold Digger is ready. Try asking it to analyze a stock or research a market.
        </p>

        <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mt-6">
          <div className="bg-background border border-border rounded-lg p-3 text-left">
            <div className="text-xs text-muted mb-1">Try saying:</div>
            <div className="text-sm text-foreground">{'"Analyze AAPL stock"'}</div>
          </div>
          <div className="bg-background border border-border rounded-lg p-3 text-left">
            <div className="text-xs text-muted mb-1">Or:</div>
            <div className="text-sm text-foreground">{'"Research AI tools market"'}</div>
          </div>
        </div>

        <button
          onClick={() => router.push("/dashboard/gold-digger")}
          className="px-8 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          Start Using Gold Digger
        </button>
      </div>
    );
  }

  /* ── Navigation ──────────────────────────────── */

  function canProceed(): boolean {
    if (step === "keys") return !!(anthropicKey || openrouterKey);
    return true;
  }

  function nextStep() {
    if (step === "test") { completeSetup(); return; }
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }

  function prevStep() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  /* ── Render ──────────────────────────────────── */

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gold Digger Setup</h1>
          <p className="text-sm text-muted mt-1">Step {stepIndex + 1} of {STEPS.length}</p>
        </div>
        {step !== "complete" && (
          <button onClick={() => router.push("/dashboard/gold-digger")} className="text-xs text-muted hover:text-foreground transition-colors">
            Skip setup
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-col items-center flex-1">
            <div className={`w-full h-1 rounded-full transition-colors ${i <= stepIndex ? "bg-accent" : "bg-border"}`} />
            <div className={`text-[10px] mt-1.5 ${i <= stepIndex ? "text-accent" : "text-muted/50"}`}>{STEP_LABELS[s]}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="bg-card border border-border rounded-xl p-6 min-h-[400px]">
        {step === "welcome" && renderWelcome()}
        {step === "keys" && renderKeys()}
        {step === "preferences" && renderPreferences()}
        {step === "test" && renderTest()}
        {step === "complete" && renderComplete()}

        {error && (
          <div className="mt-4 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">{error}</div>
        )}
      </div>

      {/* Navigation buttons */}
      {step !== "complete" && (
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={prevStep}
            disabled={stepIndex === 0}
            className="px-5 py-2.5 bg-card border border-border rounded-lg text-sm text-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={nextStep}
            disabled={!canProceed() || saving}
            className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : step === "test" ? "Finish Setup" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}
