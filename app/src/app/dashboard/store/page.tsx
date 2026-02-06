"use client";

import { useEffect, useState } from "react";

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  features: string[];
}

interface Category {
  id: string;
  name: string;
  icon: string;
}

export default function StorePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [deploying, setDeploying] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates(data.templates || []);
        setCategories(data.categories || []);
      })
      .catch(() => {});
  }, []);

  async function handleDeploy(templateId: string) {
    setDeploying(templateId);
    setDeployResult(null);

    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();

      if (res.ok) {
        setDeployResult({
          success: true,
          message: `Container deployed! ID: ${data.id}`,
        });
      } else {
        setDeployResult({
          success: false,
          message: data.error || "Deployment failed",
        });
      }
    } catch {
      setDeployResult({
        success: false,
        message: "Connection failed",
      });
    } finally {
      setDeploying(null);
    }
  }

  const filtered =
    activeCategory === "all"
      ? templates
      : templates.filter((t) => t.category === activeCategory);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Container Store</h1>
        <p className="text-muted mt-1">
          Deploy pre-built workspaces for specific tasks
        </p>
      </div>

      {/* Deploy result banner */}
      {deployResult && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg border text-sm ${
            deployResult.success
              ? "bg-success/10 border-success/20 text-success"
              : "bg-danger/10 border-danger/20 text-danger"
          }`}
        >
          {deployResult.message}
          <button
            onClick={() => setDeployResult(null)}
            className="float-right opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
            activeCategory === "all"
              ? "bg-accent text-white"
              : "bg-card border border-border text-muted hover:text-foreground"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? "bg-accent text-white"
                : "bg-card border border-border text-muted hover:text-foreground"
            }`}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* Templates grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((template) => (
          <div
            key={template.id}
            className="bg-card border border-border rounded-xl p-6 hover:border-accent/30 transition-all group flex flex-col"
          >
            <div className="text-3xl mb-4">{template.icon}</div>
            <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
              {template.name}
            </h3>
            <p className="text-sm text-muted mt-2 flex-1">
              {template.description}
            </p>

            <div className="mt-4 space-y-2">
              {template.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 text-xs text-muted"
                >
                  <span className="text-accent">→</span>
                  {feature}
                </div>
              ))}
            </div>

            <button
              onClick={() => handleDeploy(template.id)}
              disabled={deploying === template.id}
              className="mt-5 w-full px-4 py-2.5 bg-accent/10 text-accent border border-accent/20 rounded-lg text-sm font-medium hover:bg-accent hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deploying === template.id ? "Deploying..." : "Deploy Container"}
            </button>
          </div>
        ))}
      </div>

      {/* Custom workspace */}
      <div className="mt-8 bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Custom Workspace
        </h3>
        <p className="text-sm text-muted mb-4">
          Create a blank workspace for any task.
        </p>
        <CustomDeploy />
      </div>
    </div>
  );
}

function CustomDeploy() {
  const [name, setName] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState("");

  async function handleDeploy() {
    if (!name.trim()) return;
    setDeploying(true);
    setResult("");

    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setResult(
        res.ok
          ? `Deployed! ID: ${data.id}`
          : data.error || "Failed"
      );
    } catch {
      setResult("Connection failed");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workspace name"
        className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent flex-1"
      />
      <button
        onClick={handleDeploy}
        disabled={deploying || !name.trim()}
        className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors disabled:opacity-50"
      >
        {deploying ? "Deploying..." : "Deploy"}
      </button>
      {result && (
        <span className="text-xs text-muted self-center">{result}</span>
      )}
    </div>
  );
}
