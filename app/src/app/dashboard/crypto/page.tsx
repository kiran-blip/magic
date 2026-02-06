"use client";

export default function CryptoPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Crypto</h1>
          <p className="text-muted mt-1">
            Track portfolios, monitor prices, and manage wallets
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">&#x1FA99;</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Coming Soon
        </h2>
        <p className="text-muted max-w-md mx-auto mb-6">
          The Crypto service will let you track your portfolio across wallets
          and exchanges, monitor real-time prices, set alerts, and get
          AI-powered market insights.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            "Portfolio tracking",
            "Price alerts",
            "Wallet monitoring",
            "Market analysis",
            "DeFi positions",
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
