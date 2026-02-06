"use client";

export default function AgentPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Agent</h1>
          <p className="text-muted mt-1">
            Autonomous AI that performs tasks on your behalf
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">&#x1F916;</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Coming Soon
        </h2>
        <p className="text-muted max-w-md mx-auto mb-6">
          The AI Agent service will let you create autonomous agents that can
          browse the web, manage files, interact with APIs, and complete
          multi-step tasks with minimal supervision.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            "Task automation",
            "Web browsing",
            "API integration",
            "Multi-step workflows",
            "Custom agents",
          ].map((feature) => (
            <span
              key={feature}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-muted"
            >
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
