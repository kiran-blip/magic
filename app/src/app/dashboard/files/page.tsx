"use client";

export default function FilesPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Files</h1>
          <p className="text-muted mt-1">
            Cloud file storage and management
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">&#x1F4C1;</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Coming Soon
        </h2>
        <p className="text-muted max-w-md mx-auto mb-6">
          The Files service will provide cloud storage for your Magic Computer
          with file upload, download, sharing, search, and AI-powered
          organization.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            "Cloud storage",
            "File sharing",
            "Smart search",
            "AI organization",
            "Version history",
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
