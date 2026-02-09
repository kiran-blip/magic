/**
 * CCXT Crypto Broker for Gold Digger AGI.
 *
 * Supports 100+ exchanges via CCXT (MIT license).
 * Implements the same broker interface as Alpaca and Simulator.
 *
 * Phase 2A: Paper trading via exchange sandbox/testnet.
 *           Live trading with explicit user opt-in.
 *
 * Supported exchanges (primary targets):
 *   - Binance (testnet for paper)
 *   - KuCoin
 *   - Kraken
 *   - Bybit
 *   - Coinbase Advanced
 */

import type { Exchange, Order, Balances, Position as CCXTPosition } from "ccxt";
import type {
  TradingMode,
  BrokerAccount,
  BrokerPosition,
  OrderParams,
  BrokerOrder,
  OrderSide,
  OrderType,
  OrderStatus,
} from "./alpaca";

// Lazy-load CCXT to avoid bundling issues with protobufjs
let ccxtModule: any = null;

async function getCCXT() {
  if (!ccxtModule) {
    ccxtModule = await import("ccxt");
  }
  return ccxtModule;
}

// ============================================================================
// Types
// ============================================================================

export type CryptoExchangeId =
  | "binance"
  | "kucoin"
  | "kraken"
  | "bybit"
  | "coinbase";

export interface CryptoBrokerCredentials {
  exchangeId: CryptoExchangeId;
  apiKey: string;
  apiSecret: string;
  passphrase?: string; // Required for KuCoin, Coinbase
  tradingMode: TradingMode;
}

export interface CryptoConfig {
  exchangeId: CryptoExchangeId;
  tradingMode: TradingMode;
  defaultQuoteCurrency: string; // "USDT" or "USD"
  enabledPairs: string[]; // ["BTC/USDT", "ETH/USDT", ...]
}

// Exchange-specific sandbox URLs
const SANDBOX_CONFIG: Record<CryptoExchangeId, { sandbox: boolean; urls?: Record<string, string> }> = {
  binance: {
    sandbox: true,
    urls: { api: "https://testnet.binance.vision" },
  },
  kucoin: {
    sandbox: true,
    urls: { api: "https://openapi-sandbox.kucoin.com" },
  },
  kraken: {
    sandbox: false, // Kraken doesn't have a testnet — use small amounts
  },
  bybit: {
    sandbox: true,
    urls: { api: "https://api-testnet.bybit.com" },
  },
  coinbase: {
    sandbox: true,
    urls: { api: "https://api-public.sandbox.exchange.coinbase.com" },
  },
};

// Default trading pairs per exchange
const DEFAULT_PAIRS: Record<CryptoExchangeId, string[]> = {
  binance: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "DOGE/USDT", "XRP/USDT", "ADA/USDT", "MATIC/USDT", "LINK/USDT", "DOT/USDT"],
  kucoin: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "DOGE/USDT", "XRP/USDT", "ADA/USDT"],
  kraken: ["BTC/USD", "ETH/USD", "SOL/USD", "AVAX/USD", "DOGE/USD", "XRP/USD", "ADA/USD"],
  bybit: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "AVAX/USDT", "DOGE/USDT", "XRP/USDT"],
  coinbase: ["BTC/USD", "ETH/USD", "SOL/USD", "AVAX/USD", "DOGE/USD", "XRP/USD"],
};

// ============================================================================
// CryptoBroker Class
// ============================================================================

let cryptoBrokerInstance: CryptoBroker | null = null;

export class CryptoBroker {
  private exchange: Exchange | null = null;
  private exchangeId: CryptoExchangeId;
  private mode: TradingMode;
  private connected: boolean = false;
  private defaultQuote: string;
  private enabledPairs: string[];
  private orderHistory: BrokerOrder[] = [];
  private initPromise: Promise<void> | null = null;

  constructor(credentials: CryptoBrokerCredentials) {
    this.exchangeId = credentials.exchangeId;
    this.mode = credentials.tradingMode;
    this.defaultQuote = credentials.exchangeId === "kraken" || credentials.exchangeId === "coinbase" ? "USD" : "USDT";
    this.enabledPairs = DEFAULT_PAIRS[credentials.exchangeId] ?? DEFAULT_PAIRS.binance;

    // Initialize exchange asynchronously
    this.initPromise = this.initializeExchange(credentials);
  }

  private async initializeExchange(credentials: CryptoBrokerCredentials): Promise<void> {
    try {
      const ccxt = await getCCXT();

      // Create CCXT exchange instance
      const ExchangeClass = (ccxt as Record<string, typeof Exchange>)[credentials.exchangeId];
      if (!ExchangeClass) {
        throw new Error(`Unsupported exchange: ${credentials.exchangeId}`);
      }

      const config: Record<string, unknown> = {
        apiKey: credentials.apiKey,
        secret: credentials.apiSecret,
        enableRateLimit: true,
        timeout: 30000,
      };

      // Add passphrase for exchanges that require it
      if (credentials.passphrase) {
        config.password = credentials.passphrase;
      }

      // Enable sandbox/testnet for paper trading
      if (this.mode === "paper") {
        const sandboxConfig = SANDBOX_CONFIG[credentials.exchangeId];
        if (sandboxConfig.sandbox) {
          config.sandbox = true;
          if (sandboxConfig.urls) {
            config.urls = sandboxConfig.urls;
          }
        }
      }

      this.exchange = new ExchangeClass(config);

      console.log(
        `[Gold Digger Crypto] Initialized ${credentials.exchangeId} (${this.mode} mode)`
      );
    } catch (error) {
      console.error(`[Gold Digger Crypto] Failed to initialize exchange:`, error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.exchange) {
      throw new Error("Exchange not initialized");
    }
  }

  // --------------------------------------------------------------------------
  // Connection
  // --------------------------------------------------------------------------

  async testConnection(): Promise<{
    connected: boolean;
    account?: BrokerAccount;
    error?: string;
  }> {
    try {
      await this.ensureInitialized();
      await this.exchange!.loadMarkets();
      const account = await this.getAccount();
      this.connected = true;
      return { connected: true, account };
    } catch (error) {
      this.connected = false;
      const message = error instanceof Error ? error.message : "Unknown connection error";
      console.error(`[Gold Digger Crypto] Connection test failed:`, message);
      return { connected: false, error: message };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getTradingMode(): TradingMode {
    return this.mode;
  }

  getExchangeId(): CryptoExchangeId {
    return this.exchangeId;
  }

  getEnabledPairs(): string[] {
    return this.enabledPairs;
  }

  // --------------------------------------------------------------------------
  // Account
  // --------------------------------------------------------------------------

  async getAccount(): Promise<BrokerAccount> {
    await this.ensureInitialized();
    const balance: Balances = await this.exchange!.fetchBalance();

    // Calculate total portfolio value in USD/USDT
    let totalValue = 0;
    let cash = 0;

    // Get quote currency balance
    const quoteBalance = balance[this.defaultQuote];
    if (quoteBalance) {
      cash = quoteBalance.free ?? 0;
      totalValue += (quoteBalance.total ?? 0);
    }

    // Add value of all non-quote holdings
    for (const [currency, bal] of Object.entries(balance)) {
      if (currency === this.defaultQuote || currency === "info" || currency === "free" || currency === "used" || currency === "total" || currency === "timestamp" || currency === "datetime") continue;
      const typedBal = bal as { total?: number; free?: number };
      if (!typedBal?.total || typedBal.total === 0) continue;

      // Fetch current price for this asset
      try {
        const pair = `${currency}/${this.defaultQuote}`;
        if (this.exchange!.markets && this.exchange!.markets[pair]) {
          const ticker = await this.exchange!.fetchTicker(pair);
          totalValue += (typedBal.total ?? 0) * (ticker.last ?? 0);
        }
      } catch {
        // Skip assets we can't price
      }
    }

    return {
      id: `crypto-${this.exchangeId}`,
      accountNumber: this.exchangeId,
      status: "active",
      currency: this.defaultQuote,
      buyingPower: cash, // Crypto doesn't have 4x margin by default
      cash,
      portfolioValue: totalValue,
      equity: totalValue,
      longMarketValue: totalValue - cash,
      shortMarketValue: 0,
      daytradeCount: 0,
      patternDayTrader: false, // N/A for crypto
      tradingBlocked: false,
      transfersBlocked: false,
      tradingMode: this.mode,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Positions
  // --------------------------------------------------------------------------

  async getPositions(): Promise<BrokerPosition[]> {
    await this.ensureInitialized();
    const balance: Balances = await this.exchange!.fetchBalance();
    const positions: BrokerPosition[] = [];

    for (const [currency, bal] of Object.entries(balance)) {
      if (currency === this.defaultQuote || currency === "info" || currency === "free" || currency === "used" || currency === "total" || currency === "timestamp" || currency === "datetime") continue;
      const typedBal = bal as { total?: number; free?: number };
      if (!typedBal?.total || typedBal.total <= 0) continue;

      const pair = `${currency}/${this.defaultQuote}`;

      try {
        if (this.exchange!.markets && this.exchange!.markets[pair]) {
          const ticker = await this.exchange!.fetchTicker(pair);
          const currentPrice = ticker.last ?? 0;
          const quantity = typedBal.total;
          const marketValue = quantity * currentPrice;

          // We don't track entry price perfectly via CCXT, approximate from recent trades
          const entryPrice = currentPrice; // Placeholder — could track via our DB

          positions.push({
            symbol: pair,
            assetId: currency,
            assetClass: "crypto",
            quantity,
            side: "long",
            entryPrice,
            currentPrice,
            marketValue,
            costBasis: entryPrice * quantity,
            unrealizedPnl: 0, // Without entry tracking, we can't calculate
            unrealizedPnlPercent: 0,
            changeToday: ticker.percentage ?? 0,
          });
        }
      } catch {
        // Skip assets we can't price
      }
    }

    return positions;
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol || p.assetId === symbol) ?? null;
  }

  // --------------------------------------------------------------------------
  // Orders
  // --------------------------------------------------------------------------

  async createOrder(params: OrderParams): Promise<BrokerOrder> {
    await this.ensureInitialized();
    // Convert our OrderParams to CCXT format
    const symbol = this.normalizePair(params.symbol);
    const type = this.mapOrderType(params.type);
    const side = params.side as "buy" | "sell";
    const amount = params.quantity;
    const price = params.limitPrice;

    let ccxtOrder: Order;

    if (type === "market") {
      ccxtOrder = await this.exchange!.createOrder(symbol, "market", side, amount);
    } else if (type === "limit" && price) {
      ccxtOrder = await this.exchange!.createOrder(symbol, "limit", side, amount, price);
    } else {
      throw new Error(`Unsupported order type: ${params.type}`);
    }

    const brokerOrder = this.mapCCXTOrder(ccxtOrder);
    this.orderHistory.push(brokerOrder);
    return brokerOrder;
  }

  async getOrders(
    status: "open" | "closed" | "all" = "all",
    limit: number = 50
  ): Promise<BrokerOrder[]> {
    await this.ensureInitialized();
    const orders: Order[] = [];

    try {
      if (status === "open" || status === "all") {
        // Fetch open orders for each enabled pair
        for (const pair of this.enabledPairs.slice(0, 5)) {
          try {
            const openOrders = await this.exchange!.fetchOpenOrders(pair, undefined, 10);
            orders.push(...openOrders);
          } catch { /* Skip pairs that fail */ }
        }
      }

      if (status === "closed" || status === "all") {
        // Fetch closed orders for primary pair
        try {
          const closedOrders = await this.exchange!.fetchClosedOrders(
            this.enabledPairs[0],
            undefined,
            limit
          );
          orders.push(...closedOrders);
        } catch { /* Skip if not supported */ }
      }
    } catch {
      // Return in-memory history if exchange calls fail
      return this.orderHistory.slice(-limit);
    }

    // Combine with in-memory history
    const mapped = orders.map((o) => this.mapCCXTOrder(o));
    const combined = [...mapped, ...this.orderHistory];

    // Deduplicate by ID
    const seen = new Set<string>();
    const unique = combined.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

    return unique.slice(0, limit);
  }

  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      await this.exchange!.cancelOrder(orderId, symbol);
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Market Data
  // --------------------------------------------------------------------------

  async isMarketOpen(): Promise<{ isOpen: boolean; nextOpen?: string; nextClose?: string }> {
    // Crypto markets are always open
    return { isOpen: true };
  }

  async getPortfolioHistory(
    _period: "1D" | "1W" | "1M" | "3M" | "1A" = "1M",
    _timeframe: "1Min" | "5Min" | "15Min" | "1H" | "1D" = "1D"
  ): Promise<{
    timestamps: number[];
    equity: number[];
    profitLoss: number[];
    profitLossPct: number[];
    baseValue: number;
  }> {
    // CCXT doesn't have portfolio history — use current state
    const account = await this.getAccount();
    const now = Math.floor(Date.now() / 1000);

    return {
      timestamps: [now],
      equity: [account.equity],
      profitLoss: [0],
      profitLossPct: [0],
      baseValue: account.equity,
    };
  }

  /**
   * Get current prices for multiple pairs (batch)
   */
  async getTickers(pairs?: string[]): Promise<Record<string, { last: number; change24h: number; volume: number }>> {
    await this.ensureInitialized();
    const symbols = pairs ?? this.enabledPairs;
    const tickers: Record<string, { last: number; change24h: number; volume: number }> = {};

    try {
      // Use fetchTickers for batch (more efficient)
      if (this.exchange!.has["fetchTickers"]) {
        const allTickers = await this.exchange!.fetchTickers(symbols);
        for (const [symbol, ticker] of Object.entries(allTickers)) {
          tickers[symbol] = {
            last: ticker.last ?? 0,
            change24h: ticker.percentage ?? 0,
            volume: ticker.quoteVolume ?? ticker.baseVolume ?? 0,
          };
        }
      } else {
        // Fallback to individual fetches
        for (const symbol of symbols) {
          try {
            const ticker = await this.exchange!.fetchTicker(symbol);
            tickers[symbol] = {
              last: ticker.last ?? 0,
              change24h: ticker.percentage ?? 0,
              volume: ticker.quoteVolume ?? ticker.baseVolume ?? 0,
            };
          } catch { /* Skip */ }
        }
      }
    } catch {
      // Return empty on error
    }

    return tickers;
  }

  /**
   * Get OHLCV candle data for technical analysis
   */
  async getCandles(
    symbol: string,
    timeframe: string = "1h",
    limit: number = 100
  ): Promise<Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>> {
    try {
      await this.ensureInitialized();
      const pair = this.normalizePair(symbol);
      const ohlcv = await this.exchange!.fetchOHLCV(pair, timeframe, undefined, limit);

      return ohlcv.map(([timestamp, open, high, low, close, volume]) => ({
        timestamp: timestamp as number,
        open: open as number,
        high: high as number,
        low: low as number,
        close: close as number,
        volume: volume as number,
      }));
    } catch {
      return [];
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Normalize symbol to CCXT pair format (e.g., "BTC" → "BTC/USDT")
   */
  private normalizePair(symbol: string): string {
    // Already a pair
    if (symbol.includes("/")) return symbol;

    // Convert "BTCUSDT" → "BTC/USDT"
    for (const quote of ["USDT", "USD", "USDC", "EUR", "BTC", "ETH"]) {
      if (symbol.endsWith(quote) && symbol.length > quote.length) {
        return `${symbol.slice(0, -quote.length)}/${quote}`;
      }
    }

    // Assume default quote currency
    return `${symbol}/${this.defaultQuote}`;
  }

  /**
   * Map our order types to CCXT types
   */
  private mapOrderType(type: OrderType): string {
    switch (type) {
      case "market": return "market";
      case "limit": return "limit";
      case "stop": return "stop";
      case "stop_limit": return "stopLimit";
      default: return "market";
    }
  }

  /**
   * Map CCXT order to our BrokerOrder format
   */
  private mapCCXTOrder(order: Order): BrokerOrder {
    return {
      id: order.id,
      clientOrderId: order.clientOrderId ?? order.id,
      symbol: order.symbol,
      quantity: order.amount,
      filledQuantity: order.filled ?? 0,
      side: (order.side as OrderSide) ?? "buy",
      type: (order.type as OrderType) ?? "market",
      timeInForce: "gtc",
      status: this.mapCCXTOrderStatus(order.status),
      limitPrice: order.price ?? undefined,
      filledAvgPrice: order.average ?? order.price ?? undefined,
      createdAt: order.datetime ?? new Date().toISOString(),
      updatedAt: order.datetime ?? new Date().toISOString(),
      submittedAt: order.datetime ?? new Date().toISOString(),
      filledAt: order.status === "closed" ? (order.datetime ?? new Date().toISOString()) : undefined,
      assetClass: "crypto",
    };
  }

  /**
   * Map CCXT order status to our OrderStatus
   */
  private mapCCXTOrderStatus(status: string | undefined): OrderStatus {
    switch (status) {
      case "open": return "new";
      case "closed": return "filled";
      case "canceled": return "canceled";
      case "expired": return "expired";
      case "rejected": return "rejected";
      default: return "pending_new";
    }
  }

  /**
   * Disconnect and clean up
   */
  disconnect(): void {
    this.connected = false;
    console.log(`[Gold Digger Crypto] Disconnected from ${this.exchangeId}`);
  }
}

// ============================================================================
// Module-level accessors
// ============================================================================

export function getCryptoBroker(): CryptoBroker | null {
  return cryptoBrokerInstance;
}

export function initCryptoBroker(credentials: CryptoBrokerCredentials): CryptoBroker {
  if (cryptoBrokerInstance) {
    cryptoBrokerInstance.disconnect();
  }
  cryptoBrokerInstance = new CryptoBroker(credentials);
  return cryptoBrokerInstance;
}

export function disconnectCryptoBroker(): void {
  if (cryptoBrokerInstance) {
    cryptoBrokerInstance.disconnect();
    cryptoBrokerInstance = null;
  }
}

/**
 * Get list of supported exchanges with their features
 */
export function getSupportedExchanges(): Array<{
  id: CryptoExchangeId;
  name: string;
  hasTestnet: boolean;
  needsPassphrase: boolean;
  defaultPairs: string[];
  features: string[];
}> {
  return [
    {
      id: "binance",
      name: "Binance",
      hasTestnet: true,
      needsPassphrase: false,
      defaultPairs: DEFAULT_PAIRS.binance,
      features: ["Spot", "Futures", "Margin", "Staking"],
    },
    {
      id: "kucoin",
      name: "KuCoin",
      hasTestnet: true,
      needsPassphrase: true,
      defaultPairs: DEFAULT_PAIRS.kucoin,
      features: ["Spot", "Futures", "Margin"],
    },
    {
      id: "kraken",
      name: "Kraken",
      hasTestnet: false,
      needsPassphrase: false,
      defaultPairs: DEFAULT_PAIRS.kraken,
      features: ["Spot", "Margin", "Staking"],
    },
    {
      id: "bybit",
      name: "Bybit",
      hasTestnet: true,
      needsPassphrase: false,
      defaultPairs: DEFAULT_PAIRS.bybit,
      features: ["Spot", "Futures", "Options"],
    },
    {
      id: "coinbase",
      name: "Coinbase Advanced",
      hasTestnet: true,
      needsPassphrase: true,
      defaultPairs: DEFAULT_PAIRS.coinbase,
      features: ["Spot"],
    },
  ];
}
