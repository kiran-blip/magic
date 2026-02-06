"use client";

export default function ScraperPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Scraper</h1>
          <p className="text-muted mt-1">
            Extract data from websites and automate web tasks
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">&#x1F577;&#xFE0F;</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Coming Soon
        </h2>
        <p className="text-muted max-w-md mx-auto mb-6">
          The Scraper service will let you extract structured data from any
          website, schedule recurring scrapes, monitor page changes, and export
          data in multiple formats.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            "Visual selector",
            "Scheduled scrapes",
            "Change monitoring",
            "Data export",
            "AI extraction",
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
