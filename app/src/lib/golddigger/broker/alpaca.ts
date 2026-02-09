/**
 * Alpaca Trading API Wrapper for Gold Digger AGI.
 *
 * Paper trading by default. Live trading requires:
 *   1. Explicit opt-in via config
 *   2. Win rate threshold met (tracked by prediction system)
 *   3. User confirmation on every order
 *
 * Supports: stocks, ETFs, crypto via Alpaca Markets.
 */

import Alpaca from "@alpacahq/alpaca-trade-api";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ============================================================================
// Types
// ============================================================================

export type TradingMode = "paper" | "live";
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
export type OrderTimeInForce = "day" | "gtc" | "ioc" | "fok";
export type OrderStatus =
  | "new"
  | "partially_filled"
  | "filled"
  | "done_for_day"
  | "canceled"
  | "expired"
  | "replaced"
  | "pending_new"
  | "accepted"
  | "pending_cancel"
  | "pending_replace"
  | "stopped"
  | "rejected"
  | "suspended"
  | "calculated";

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
  tradingMode: TradingMode;
}

export interface BrokerAccount {
  id: string;
  accountNumber: string;
  status: string;
  currency: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  equity: number;
  longMarketValue: number;
  shortMarketValue: number;
  daytradeCount: number;
  patternDayTrader: boolean;
  tradingBlocked: boolean;
  transfersBlocked: boolean;
  tradingMode: TradingMode;
  lastSyncedAt: string;
}

export interface BrokerPosition {
  symbol: string;
  assetId: string;
  assetClass: string; // "us_equity" | "crypto"
  quantity: number;
  side: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  changeToday: number;
}

export interface OrderParams {
  symbol: string;
  quantity: number;
  side: OrderSide;
  type: OrderType;
  timeInForce: OrderTimeInForce;
  limitPrice?: number;
  stopPrice?: number;
  trailPercent?: number;
  trailPrice?: number;
  clientOrderId?: string;
  extendedHours?: boolean;
}

export interface BrokerOrder {
  id: string;
  clientOrderId: string;
  symbol: string;
  quantity: number;
  filledQuantity: number;
  side: OrderSide;
  type: OrderType;
  timeInForce: OrderTimeInForce;
  status: OrderStatus;
  limitPrice?: number;
  stopPrice?: number;
  filledAvgPrice?: number;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  filledAt?: string;
  canceledAt?: string;
  assetClass: string;
}

// ============================================================================
// Credential Encryption
// ============================================================================

const ALGO = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || "golddigger-default-encryption-key";
  // Derive 32-byte key from JWT_SECRET
  const key = Buffer.alloc(32);
  Buffer.from(secret).copy(key);
  return key;
}

export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptCredential(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid encrypted credential format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ============================================================================
// Alpaca Broker Class
// ============================================================================

let brokerInstance: AlpacaBroker | null = null;

export class AlpacaBroker {
  private client: Alpaca;
  private mode: TradingMode;
  private connected: boolean = false;

  constructor(credentials: BrokerCredentials) {
    this.mode = credentials.tradingMode;

    const paper = this.mode === "paper";
    this.client = new Alpaca({
      keyId: credentials.apiKey,
      secretKey: credentials.apiSecret,
      paper,
      // Paper: https://paper-api.alpaca.markets
      // Live: https://api.alpaca.markets
    });

    console.log(
      `[Gold Digger Broker] Initialized Alpaca client (${this.mode} mode)`
    );
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
      const account = await this.getAccount();
      this.connected = true;
      return { connected: true, account };
    } catch (error) {
      this.connected = false;
      const message =
        error instanceof Error ? error.message : "Unknown connection error";
      console.error("[Gold Digger Broker] Connection test failed:", message);
      return { connected: false, error: message };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getTradingMode(): TradingMode {
    return this.mode;
  }

  // --------------------------------------------------------------------------
  // Account
  // --------------------------------------------------------------------------

  async getAccount(): Promise<BrokerAccount> {
    const raw = await this.client.getAccount();
    return {
      id: raw.id,
      accountNumber: raw.account_number,
      status: raw.status,
      currency: raw.currency,
      buyingPower: parseFloat(raw.buying_power),
      cash: parseFloat(raw.cash),
      portfolioValue: parseFloat(raw.portfolio_value),
      equity: parseFloat(raw.equity),
      longMarketValue: parseFloat(raw.long_market_value),
      shortMarketValue: parseFloat(raw.short_market_value),
      daytradeCount: raw.daytrade_count,
      patternDayTrader: raw.pattern_day_trader,
      tradingBlocked: raw.trading_blocked,
      transfersBlocked: raw.transfers_blocked,
      tradingMode: this.mode,
      lastSyncedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Positions
  // --------------------------------------------------------------------------

  async getPositions(): Promise<BrokerPosition[]> {
    const rawPositions = await this.client.getPositions();
    return rawPositions.map(this.mapPosition);
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    try {
      const raw = await this.client.getPosition(symbol);
      return this.mapPosition(raw);
    } catch {
      // Position not found
      return null;
    }
  }

  async closePosition(
    symbol: string,
    _quantity?: number
  ): Promise<BrokerOrder> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (this.client as any).closePosition(symbol);
    return this.mapOrder(raw);
  }

  private mapPosition(raw: Record<string, unknown>): BrokerPosition {
    return {
      symbol: String(raw.symbol ?? ""),
      assetId: String(raw.asset_id ?? ""),
      assetClass: String(raw.asset_class ?? "us_equity"),
      quantity: Math.abs(parseFloat(String(raw.qty ?? "0"))),
      side: parseFloat(String(raw.qty ?? "0")) >= 0 ? "long" : "short",
      entryPrice: parseFloat(String(raw.avg_entry_price ?? "0")),
      currentPrice: parseFloat(String(raw.current_price ?? "0")),
      marketValue: Math.abs(parseFloat(String(raw.market_value ?? "0"))),
      costBasis: Math.abs(parseFloat(String(raw.cost_basis ?? "0"))),
      unrealizedPnl: parseFloat(String(raw.unrealized_pl ?? "0")),
      unrealizedPnlPercent: parseFloat(
        String(raw.unrealized_plpc ?? "0")
      ) * 100,
      changeToday: parseFloat(String(raw.change_today ?? "0")) * 100,
    };
  }

  // --------------------------------------------------------------------------
  // Orders
  // --------------------------------------------------------------------------

  async createOrder(params: OrderParams): Promise<BrokerOrder> {
    const orderParams: Record<string, unknown> = {
      symbol: params.symbol,
      qty: params.quantity,
      side: params.side,
      type: params.type,
      time_in_force: params.timeInForce,
    };

    if (params.limitPrice !== undefined) {
      orderParams.limit_price = params.limitPrice;
    }
    if (params.stopPrice !== undefined) {
      orderParams.stop_price = params.stopPrice;
    }
    if (params.trailPercent !== undefined) {
      orderParams.trail_percent = params.trailPercent;
    }
    if (params.trailPrice !== undefined) {
      orderParams.trail_price = params.trailPrice;
    }
    if (params.clientOrderId) {
      orderParams.client_order_id = params.clientOrderId;
    }
    if (params.extendedHours !== undefined) {
      orderParams.extended_hours = params.extendedHours;
    }

    console.log(
      `[Gold Digger Broker] Creating ${params.side} order: ${params.quantity} x ${params.symbol} (${params.type}, ${this.mode} mode)`
    );

    const raw = await this.client.createOrder(orderParams);
    return this.mapOrder(raw);
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    const raw = await this.client.getOrder(orderId);
    return this.mapOrder(raw);
  }

  async getOrders(
    status: "open" | "closed" | "all" = "all",
    limit: number = 50
  ): Promise<BrokerOrder[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawOrders = await (this.client.getOrders as any)({
      status,
      limit,
      direction: "desc",
    });
    return rawOrders.map(this.mapOrder);
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.client.cancelOrder(orderId);
    console.log(`[Gold Digger Broker] Canceled order: ${orderId}`);
  }

  private mapOrder(raw: Record<string, unknown>): BrokerOrder {
    return {
      id: String(raw.id ?? ""),
      clientOrderId: String(raw.client_order_id ?? ""),
      symbol: String(raw.symbol ?? ""),
      quantity: parseFloat(String(raw.qty ?? "0")),
      filledQuantity: parseFloat(String(raw.filled_qty ?? "0")),
      side: String(raw.side ?? "buy") as OrderSide,
      type: String(raw.type ?? "market") as OrderType,
      timeInForce: String(raw.time_in_force ?? "day") as OrderTimeInForce,
      status: String(raw.status ?? "new") as OrderStatus,
      limitPrice: raw.limit_price
        ? parseFloat(String(raw.limit_price))
        : undefined,
      stopPrice: raw.stop_price
        ? parseFloat(String(raw.stop_price))
        : undefined,
      filledAvgPrice: raw.filled_avg_price
        ? parseFloat(String(raw.filled_avg_price))
        : undefined,
      createdAt: String(raw.created_at ?? ""),
      updatedAt: String(raw.updated_at ?? ""),
      submittedAt: String(raw.submitted_at ?? ""),
      filledAt: raw.filled_at ? String(raw.filled_at) : undefined,
      canceledAt: raw.canceled_at ? String(raw.canceled_at) : undefined,
      assetClass: String(raw.asset_class ?? "us_equity"),
    };
  }

  // --------------------------------------------------------------------------
  // Market Clock
  // --------------------------------------------------------------------------

  async isMarketOpen(): Promise<{
    isOpen: boolean;
    nextOpen: string;
    nextClose: string;
  }> {
    const clock = await this.client.getClock();
    return {
      isOpen: clock.is_open,
      nextOpen: clock.next_open,
      nextClose: clock.next_close,
    };
  }

  // --------------------------------------------------------------------------
  // Portfolio History
  // --------------------------------------------------------------------------

  async getPortfolioHistory(
    period: "1D" | "1W" | "1M" | "3M" | "1A" = "1M",
    timeframe: "1Min" | "5Min" | "15Min" | "1H" | "1D" = "1D"
  ): Promise<{
    timestamps: number[];
    equity: number[];
    profitLoss: number[];
    profitLossPct: number[];
    baseValue: number;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await (this.client.getPortfolioHistory as any)({
      period,
      timeframe,
    });
    return {
      timestamps: raw.timestamp || [],
      equity: raw.equity || [],
      profitLoss: raw.profit_loss || [],
      profitLossPct: raw.profit_loss_pct || [],
      baseValue: raw.base_value || 0,
    };
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

export function getBroker(): AlpacaBroker | null {
  return brokerInstance;
}

export function initBroker(credentials: BrokerCredentials): AlpacaBroker {
  brokerInstance = new AlpacaBroker(credentials);
  return brokerInstance;
}

export function disconnectBroker(): void {
  brokerInstance = null;
  console.log("[Gold Digger Broker] Disconnected");
}
