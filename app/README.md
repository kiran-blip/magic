# Gold Digger AGI

A fully autonomous AI investment company built on Next.js 16. Gold Digger automates investment analysis, market research, and trading — maximizing profit for the user regardless of their experience level.

The system runs a fleet of 6 specialized AI agents that analyze markets, generate trade proposals, cross-verify each other's work, and execute trades on connected broker accounts.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Next.js 16 App Router                │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │            Tier System (UX Layer)              │  │
│  │  Easy Mode → Balanced → Full Control           │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │          Autonomous Agent Fleet (6 AI)         │  │
│  │  Research │ Risk │ Portfolio │ Trading │        │  │
│  │  Sentiment │ Quant — all on staggered timers   │  │
│  └────────────────────────────────────────────────┘  │
│           ↓                                           │
│  ┌────────────────────────────────────────────────┐  │
│  │          Auto-Trading Engine                   │  │
│  │  Fleet Proposal → Governor → Approve → Execute │  │
│  └────────────────────────────────────────────────┘  │
│           ↓                                           │
│  ┌────────────────────────────────────────────────┐  │
│  │          Broker Abstraction Layer              │  │
│  │  Alpaca (Paper/Live) │ Built-in Simulator      │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │          Data & Tools                          │  │
│  │  Yahoo Finance │ Stock Screener │ Crypto Data  │  │
│  │  Neural Networks │ Chain-of-Verification       │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌────────────────────────────────────────────────┐  │
│  │          Storage                               │  │
│  │  SQLite (memory/proposals) │ JSON (config)     │  │
│  │  AES-256-GCM (encrypted credentials)           │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:3000 and navigate to the Gold Digger dashboard. Complete the setup wizard to configure your API keys and connect a broker.

### Environment Variables

```env
# Required: At least one LLM provider
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...

# Optional: Broker (can also configure via UI)
ALPACA_API_KEY=...
ALPACA_API_SECRET=...
ALPACA_TRADING_MODE=paper
```

## User Experience Tiers

Gold Digger uses a three-tier progressive disclosure system. All tiers get the same AI engine under the hood — the tiers control how much of the machine you see.

| Tier | Label | What You See | Navigation |
|------|-------|-------------|------------|
| Newbie | Easy Mode | "My Money" overview, friendly language, no red numbers | Chat, My Money, Settings |
| Intermediate | Balanced | Trading proposals, portfolio details, predictions | Chat, Trading, Portfolio, Watchlist, Predictions, Settings |
| Expert | Full Control | Fleet management, chatroom, rules engine, all analytics | All 9 tabs |

### Beginner-Friendly Design

- Losses show as "Adjusting" in amber (not red dollar amounts)
- Paper trading labeled "Practice Mode"
- Portfolio shows "Your AI is managing your investments"
- Simplified position list without technical details

## Agent Fleet

Six specialized AI agents run autonomously on staggered timers:

| Agent | Role | Interval | Capabilities |
|-------|------|----------|-------------|
| Research Analyst (CRO) | Market scanning | 90s | Stock screening, sector analysis, opportunity detection |
| Risk Manager (CRiskO) | Risk monitoring | 60s | VIX tracking, proposal verification, risk alerts |
| Portfolio Strategist (PD) | Allocation | 120s | Sector rotation, rebalancing proposals, verification |
| Trading Analyst (HoT) | Trade signals | 45s | Momentum detection, entry/exit signals, position sizing |
| Sentiment Analyst (SD) | Market mood | 75s | Fear/greed analysis, crypto sentiment, contrarian signals |
| Quant Analyst (HoQ) | Neural models | 150s | TradeScorer network, RiskAssessor, quantitative scoring |

### Auto-Trading Pipeline

```
Fleet Agent generates proposal
    ↓
Chain-of-Verification (other agents cross-check)
    ↓
Trading Governor (risk limits, position sizing)
    ↓
Auto-Approve (Easy Mode: confidence ≥65%, risk ≤medium)
    ↓
Execute on Broker (Alpaca or Simulator)
    ↓
Notification sent to user
```

## Broker Integration

### Built-in Simulator
- Zero-setup paper trading with configurable starting capital
- Real market data from Yahoo Finance
- Instant market order fills, conditional limit orders
- P&L tracking with JSON persistence

### Alpaca Markets
- Paper trading (default) and live trading
- Stocks, ETFs, and crypto (20+ assets)
- AES-256-GCM encrypted credential storage
- Graduated live readiness system (50 predictions, 55% win rate, 30 days)

## Key Features

- **SSE Streaming**: Real-time chat and fleet updates via Server-Sent Events
- **Token Bucket Rate Limiting**: Prevents API abuse
- **Trading Governor**: Safety checks on every order (position limits, daily loss caps)
- **Chain-of-Verification**: Multi-agent cross-validation before trade execution
- **Neural Networks**: TradeScorer, PositionSizer, RiskAssessor models
- **Notifications**: In-memory alert system for trades, opportunities, and risk events
- **Performance Charts**: SVG equity curves on portfolio pages
- **Watchlist**: Real-time price tracking with tier-appropriate display
- **Predictions**: AI prediction tracking with accuracy analytics and live readiness gate

---

## Development Progress

### Completed

| # | Feature | Status | Description |
|---|---------|--------|-------------|
| 1 | Global Broker Providers | ✅ Done | Alpaca + Simulator broker abstraction layer |
| 2 | Memory & Persistence | ✅ Done | SQLite for history/proposals, JSON for config |
| 3 | Chain-of-Verification | ✅ Done | Multi-agent cross-validation on proposals |
| 4 | Test Suite | ✅ Done | 255 tests passing across 7 suites |
| 5 | WebSocket/SSE Streaming | ✅ Done | Real-time chat and fleet event streams |
| 6 | Production Hardening | ✅ Done | Rate limiting, error handling, graceful degradation |
| 7 | UX Redesign — Tier System | ✅ Done | Three-tier progressive disclosure (Easy/Balanced/Full Control) |
| 8 | Auto-Trading Engine | ✅ Done | Fleet proposal → governor → approve → execute pipeline |
| 9 | Fleet Auto-Start | ✅ Done | Fleet bootstraps when broker connects (any page) |
| 10 | Performance Tracking | ✅ Done | SVG equity chart on portfolio page |
| 11 | Notifications System | ✅ Done | In-memory alerts with bell icon + dropdown |
| 12 | Live Trading Readiness | ✅ Done | Real prediction stats for paper → live graduation |
| 13 | Tier-Aware Pages | ✅ Done | Watchlist + Predictions adapted per tier |
| 14 | Portfolio Dashboard | ✅ Done | "My Money" for newbies, full portfolio for experts |
| 15 | Duplicate UX Cleanup | ✅ Done | Single experience selector, broker-sourced capital |

### In Progress / Next Up

| # | Feature | Status | Description |
|---|---------|--------|-------------|
| 16 | Crypto Trading Expansion | 🔄 Planned | CCXT integration for 100+ crypto exchanges |
| 17 | AI Agent Upgrade | 🔄 Planned | FinRL/FinGPT integration for pre-trained market intelligence |
| 18 | Multi-Exchange Support | 🔄 Planned | Binance, KuCoin, Kraken via CCXT |
| 19 | Advanced Backtesting | 🔄 Planned | Historical strategy validation before live deployment |
| 20 | Mobile Responsive | 🔄 Planned | Touch-friendly layouts for all tiers |

---

## Development Plan — Phase 2: Crypto & Intelligence Expansion

### Phase 2A: Crypto Trading via CCXT

**Goal**: Add crypto trading to Gold Digger via the CCXT unified exchange library.

**Why CCXT**: We already have a broker abstraction layer. CCXT wraps 100+ exchanges with a consistent interface — write once, deploy anywhere. MIT licensed, native TypeScript/npm support.

**Integration plan**:

1. Install `ccxt` npm package
2. Create `CcxtBroker` class implementing the same interface as `AlpacaBroker`/`SimulatorBroker`
3. Support Binance testnet for paper trading, then Binance/KuCoin/Kraken for live
4. Update broker config to support `provider: "ccxt"` with exchange selection
5. Extend fleet agents to analyze crypto markets (already partially done via `getCryptoData()`)

**Supported exchanges (Phase 2A)**:

| Exchange | Paper Trading | Crypto Pairs | Priority |
|----------|--------------|-------------|----------|
| Binance | Yes (testnet) | 1000+ | High |
| KuCoin | Yes (demo) | 500+ | Medium |
| Kraken | Yes (demo) | 200+ | Medium |
| Bybit | Yes (testnet) | 200+ | Low |

**Note**: Alpaca already supports 20+ crypto assets — existing integration works for basic crypto. CCXT adds the full exchange ecosystem.

### Phase 2B: AI Agent Intelligence Upgrade

**Goal**: Integrate genuinely pre-trained financial AI models into the fleet.

**Current fleet**: Agents use heuristic analysis (stock screeners, VIX checks, sector rotation rules) + neural network scoring. This works but isn't "super smart."

**Upgrade path — recommended stack**:

| Component | Framework | License | What It Adds |
|-----------|-----------|---------|-------------|
| Trading Policy Brain | FinRL | MIT | Pre-trained RL agents with actual market policies |
| Strategic Reasoning | FinGPT | MIT | Financial LLM fine-tuned on market corpus |
| Sentiment Analysis | FinBERT | MIT | Pre-trained financial NLP (outperforms VADER by ~8%) |
| Agent Orchestration | FinRobot | Apache 2.0 | Purpose-built AI agent platform for finance |
| Data Pipeline | OpenBB | Apache 2.0 | Bloomberg-alternative data aggregation |
| Document Analysis | LlamaIndex | MIT | SEC filings, earnings reports, news analysis |

**Integration architecture**:

```
Node.js Fleet Controller (existing)
    ↓ REST/gRPC calls
Python Microservices Layer (new)
    ├── FinRL Agent Service (trained trading policies)
    ├── FinGPT Service (strategic analysis + recommendations)
    ├── FinBERT Service (real-time sentiment scoring)
    └── Data Pipeline (OpenBB + LlamaIndex)
```

**Key insight**: All recommended frameworks are Python-based. Integration with our Node.js fleet uses REST API wrappers around Python microservices. Each AI model runs as an independent service that fleet agents call as tools.

### Phase 2C: Fleet Capability Matrix (Post-Upgrade)

| Agent | Current Intelligence | With FinRL/FinGPT | Stocks | Crypto |
|-------|---------------------|-------------------|--------|--------|
| Research Analyst | Stock screener heuristics | FinGPT strategic analysis + FinBERT sentiment | ✅ | ✅ |
| Risk Manager | VIX + market overview | FinRL RiskAssessor policies + FinBERT fear/greed | ✅ | ✅ |
| Portfolio Strategist | Sector rotation rules | FinRL portfolio optimization policies | ✅ | ✅ |
| Trading Analyst | Momentum screening | FinRL TradeScorer policies + FinGPT entry signals | ✅ | ✅ |
| Sentiment Analyst | Yahoo Finance sentiment | FinBERT NLP + social media analysis | ✅ | ✅ |
| Quant Analyst | Basic neural networks | FinRL trained RL policies + backtesting | ✅ | ✅ |

### Phase 2D: Future Roadmap

| Feature | Priority | Description |
|---------|----------|-------------|
| Portfolio Rebalancing Engine | High | Auto-rebalance based on Portfolio Strategist proposals |
| Stop Loss / Take Profit Automation | High | Auto-manage exit points on open positions |
| Multi-Account Support | Medium | Manage multiple broker accounts from one dashboard |
| Tax Reporting | Medium | P&L reports, wash sale detection, tax lot tracking |
| Social Trading | Low | Share strategies, follow top performers |
| Custom Strategy Builder | Low | Visual strategy builder for expert users |

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4 with Magic Design System
- **Database**: SQLite (better-sqlite3) for memory/proposals
- **Broker**: Alpaca Markets API + built-in simulator
- **Market Data**: Yahoo Finance (via custom tools)
- **AI**: Anthropic Claude + OpenRouter (multi-model routing)
- **Neural Networks**: Custom TradeScorer, PositionSizer, RiskAssessor
- **Streaming**: Server-Sent Events (SSE)
- **Security**: AES-256-GCM credential encryption, JWT auth
- **Testing**: Jest with 255+ tests

## Project Structure

```
src/
├── app/
│   ├── api/golddigger/          # API routes
│   │   ├── broker/              # Broker connect/status/orders
│   │   ├── chat/                # AI chat + streaming
│   │   ├── fleet/               # Fleet status + SSE stream
│   │   ├── notifications/       # Alert system
│   │   ├── predictions/         # Prediction tracking
│   │   ├── settings/            # Config management
│   │   ├── trading/             # Proposals + execution
│   │   └── watchlist/           # Symbol tracking
│   └── dashboard/gold-digger/   # Frontend pages
│       ├── components/          # TierProvider, shared UI
│       ├── fleet/               # Fleet dashboard + chatroom
│       ├── portfolio/           # My Money / Portfolio
│       ├── predictions/         # Prediction analytics
│       ├── settings/            # Settings page
│       ├── setup/               # Onboarding wizard
│       ├── trading/             # Trading dashboard
│       └── watchlist/           # Price tracking
├── lib/golddigger/
│   ├── broker/                  # AlpacaBroker, SimulatorBroker, config
│   ├── config/                  # Settings management
│   ├── fleet/                   # Agent fleet system
│   │   ├── agent-behaviors.ts   # Real agent logic
│   │   ├── agents.ts            # Agent definitions
│   │   ├── bus.ts               # FleetBus message system
│   │   ├── neural.ts            # Neural network models
│   │   ├── orchestrator.ts      # Fleet lifecycle manager
│   │   ├── types.ts             # Type definitions
│   │   └── verification.ts      # Chain-of-verification
│   ├── governor/                # Trading safety governor
│   ├── portfolio/               # Position + transaction tracking
│   ├── predictions/             # Prediction system
│   ├── tier.ts                  # User tier system
│   ├── tools/                   # Market data tools
│   └── trading/
│       ├── auto-trader.ts       # Autonomous trading engine
│       └── executor.ts          # Order proposal lifecycle
└── ...
```

## License

Proprietary. All rights reserved.
