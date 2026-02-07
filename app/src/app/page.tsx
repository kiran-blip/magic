import Link from "next/link";

const services = [
  { icon: "📧", label: "Email", desc: "AI reads, replies, and organizes your inbox" },
  { icon: "🤖", label: "AI Agent", desc: "Runs commands and automates tasks on your server" },
  { icon: "🪙", label: "Crypto", desc: "Track portfolios and monitor prices" },
  { icon: "💻", label: "Dev", desc: "Cloud development environment with AI assist" },
  { icon: "🕷️", label: "Scraper", desc: "Extract structured data from any website" },
  { icon: "📁", label: "Files", desc: "Cloud file storage with smart organization" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-sm">✦</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">Magic</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-20 pb-32">
        {/* Background orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none">
          <div className="absolute inset-0 rounded-full bg-accent/5 blur-[100px] animate-glow-breathe" />
        </div>

        {/* Orbiting icons */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-0 h-0 pointer-events-none hidden md:block">
          <div className="animate-orbit">
            <span className="text-2xl opacity-20">📧</span>
          </div>
          <div className="animate-orbit-2">
            <span className="text-xl opacity-15">🤖</span>
          </div>
          <div className="animate-orbit-3">
            <span className="text-xl opacity-10">💻</span>
          </div>
        </div>

        <div className="relative text-center max-w-3xl mx-auto">
          {/* Badge */}
          <div className="animate-fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-card border border-border text-xs text-muted mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
            Your personal cloud computer
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6"
            style={{ animationDelay: "0.1s" }}
          >
            A computer that
            <br />
            works like{" "}
            <span
              className="bg-gradient-to-r from-accent via-purple-400 to-accent bg-clip-text text-transparent animate-shimmer"
            >
              Magic
            </span>
          </h1>

          {/* Sub */}
          <p
            className="animate-fade-up text-lg sm:text-xl text-muted max-w-xl mx-auto mb-10 leading-relaxed"
            style={{ animationDelay: "0.2s" }}
          >
            One server. AI that manages your email, runs tasks,
            writes code, and gets things done — so you don't have to.
          </p>

          {/* CTA */}
          <div
            className="animate-fade-up flex flex-col sm:flex-row items-center justify-center gap-3"
            style={{ animationDelay: "0.3s" }}
          >
            <Link
              href="/login"
              className="group relative px-8 py-3.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/20"
            >
              <span className="relative z-10">Start using Magic</span>
            </Link>
            <a
              href="https://github.com/kiran-blip/magic"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 bg-card hover:bg-card-hover border border-border text-foreground rounded-xl text-sm font-medium transition-all hover:border-accent/30"
            >
              View on GitHub
            </a>
          </div>
        </div>

        {/* Dashboard preview */}
        <div
          className="animate-fade-up relative mt-20 max-w-4xl mx-auto"
          style={{ animationDelay: "0.5s" }}
        >
          <div className="absolute -inset-4 bg-gradient-to-b from-accent/10 via-transparent to-transparent rounded-2xl blur-xl pointer-events-none" />
          <div className="relative bg-card border border-border rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-danger/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 rounded-md bg-background/50 text-[11px] text-muted font-mono">
                  magic-computer-production.up.railway.app
                </div>
              </div>
              <div className="w-12" />
            </div>
            {/* Fake dashboard */}
            <div className="flex h-[340px]">
              {/* Sidebar */}
              <div className="w-48 border-r border-border bg-card/50 p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
                  <span className="text-xs">◆</span>
                  <span className="text-xs text-accent font-medium">Overview</span>
                </div>
                <div className="mt-2 mb-1 px-3">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted/40">Services</span>
                </div>
                {[
                  { i: "📧", l: "Email" },
                  { i: "🤖", l: "AI Agent" },
                  { i: "🪙", l: "Crypto" },
                  { i: "💻", l: "Dev" },
                  { i: "🕷️", l: "Scraper" },
                  { i: "📁", l: "Files" },
                ].map((s) => (
                  <div
                    key={s.l}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-muted/60"
                  >
                    <span className="text-xs">{s.i}</span>
                    <span className="text-xs">{s.l}</span>
                  </div>
                ))}
              </div>
              {/* Content */}
              <div className="flex-1 p-5 overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
                    <span className="text-[10px]">✦</span>
                  </div>
                  <span className="text-sm font-semibold">Overview</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Email", status: "Connected", color: "bg-success" },
                    { label: "AI Agent", status: "Active", color: "bg-accent" },
                    { label: "Terminal", status: "Ready", color: "bg-success" },
                  ].map((c) => (
                    <div key={c.label} className="p-3 bg-background/50 rounded-xl border border-border/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-foreground/80">{c.label}</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${c.color} animate-pulse-dot`} />
                      </div>
                      <span className="text-[10px] text-muted">{c.status}</span>
                    </div>
                  ))}
                </div>
                {/* Fake chat */}
                <div className="mt-4 p-3 bg-background/50 rounded-xl border border-border/50">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs">🤖</span>
                    <span className="text-[11px] font-medium text-foreground/80">Agent</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-end">
                      <div className="px-3 py-1.5 bg-accent/80 rounded-lg rounded-br-sm text-[11px] text-white max-w-[70%]">
                        Show me disk usage
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="px-3 py-1.5 bg-border/30 rounded-lg rounded-bl-sm text-[11px] text-foreground/70 max-w-[70%] font-mono">
                        Filesystem 8.0G used, 52G available (13%)
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Fade out bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>
      </section>

      {/* Services grid */}
      <section className="relative max-w-6xl mx-auto px-6 pb-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Everything in one place
          </h2>
          <p className="text-muted text-lg max-w-lg mx-auto">
            Each service runs on your server. Your data, your rules.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s, i) => (
            <div
              key={s.label}
              className="group relative p-6 bg-card border border-border rounded-2xl hover:border-accent/30 transition-all hover:bg-card-hover"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl bg-accent/5 border border-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/10 transition-colors">
                <span className="text-2xl">{s.icon}</span>
              </div>
              <h3 className="text-base font-semibold mb-1.5">{s.label}</h3>
              <p className="text-sm text-muted leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative max-w-6xl mx-auto px-6 pb-28">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Three steps. That's it.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Deploy",
              desc: "One click to Railway, Fly, or any server. Your Magic Computer boots in seconds.",
            },
            {
              step: "02",
              title: "Connect",
              desc: "Link your Gmail, wallets, APIs — the agent handles the rest.",
            },
            {
              step: "03",
              title: "Ask",
              desc: "Tell the AI what to do. It runs commands, manages email, and automates your workflow.",
            },
          ].map((item) => (
            <div key={item.step} className="relative p-6">
              <span className="text-5xl font-bold text-accent/10 block mb-3">
                {item.step}
              </span>
              <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Open source + CTA */}
      <section className="relative max-w-6xl mx-auto px-6 pb-20">
        <div className="relative bg-card border border-border rounded-2xl p-12 text-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-purple-500/5 pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-background border border-border text-xs text-muted mb-6">
              Open source
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Your computer. Your data. Your rules.
            </h2>
            <p className="text-muted text-lg max-w-lg mx-auto mb-8">
              Magic is fully open source. Self-host it, fork it, make it yours.
              No vendor lock-in. No data harvesting. Just magic.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/login"
                className="px-8 py-3.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-accent/20"
              >
                Start using Magic
              </Link>
              <a
                href="https://github.com/kiran-blip/magic"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 bg-background hover:bg-card-hover border border-border text-foreground rounded-xl text-sm font-medium transition-all hover:border-accent/30"
              >
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
              <span className="text-[10px]">✦</span>
            </div>
            <span className="text-sm font-medium text-muted">Magic</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/kiran-blip/magic"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <span className="text-xs text-muted/40">MIT License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
