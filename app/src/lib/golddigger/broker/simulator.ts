/**
 * Built-in Simulator Broker for Gold Digger AGI
 *
 * Implements the same interface as AlpacaBroker but runs entirely locally
 * with simulated trades using real market data from Yahoo Finance.
 *
 * Key features:
 * - In-memory state with JSON file persistence
 * - Real market data via Yahoo Finance getQuote()
 * - Instant market order fills, conditional limit order fills
 * - P&L tracking and position management
 * - Singleton pattern with getSimulator(), initSimulator(), disconnectSimulator()
 */

import * as fs from "fs";
import * as path from "path";
import { getQuote } from "../tools/market-tools";
import {
  type TradingMode,
  type OrderSide,
  type OrderType,
  type OrderTimeInForce,
  type OrderStatus,
  type BrokerAccount,
  type BrokerPosition,
  type OrderParams,
  type BrokerOrder,
} from "./alpaca";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface SimulatorPosition {
  symbol: string;
  quantity: number;
  entryPrice: number;
  entryTime: string; // ISO date
}

interface SimulatorOrder {
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
}

interface PortfolioSnapshot {
  timestamp: number; // Unix epoch seconds
  equity: number;
}

interface SimulatorState {
  cash: number;
  positions: SimulatorPosition[];
  orders: SimulatorOrder[];
  accountId: string;
  createdAt: string;
  lastSyncedAt: string;
  portfolioHistory: PortfolioSnapshot[];
}

interface PriceCache {
  symbol: string;
  price: number;
  timestamp: number; // Unix timestamp in ms
}

// ============================================================================
// Simulator Broker Class
// ============================================================================

let simulatorInstance: SimulatorBroker | null = null;

export class SimulatorBroker {
  private state: SimulatorState;
  private connected: boolean = false;
  private startingCapital: number;
  private stateFilePath: string;
  private priceCache: Map<string, PriceCache> = new Map();
  private readonly PRICE_CACHE_DURATION = 60000; // 1 minute in ms

  constructor(startingCapital: number = 100000) {
    this.startingCapital = startingCapital;
    this.stateFilePath = this.getStateFilePath();

    // Try to load existing state
    const existingState = this.loadState();
    if (existingState) {
      this.state = existingState;
    } else {
      // Create new state
      this.state = {
        cash: startingCapital,
        positions: [],
        orders: [],
        accountId: `sim-${Date.now()}`,
        createdAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
        portfolioHistory: [{ timestamp: Math.floor(Date.now() / 1000), equity: startingCapital }],
      };
      this.saveState();
    }

    console.log(
      `[Simulator Broker] Initialized with $${startingCapital} starting capital`
    );
  }

  // --------------------------------------------------------------------------
  // State Management
  // --------------------------------------------------------------------------

  private getStateFilePath(): string {
    const dataDir =
      process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), "data");
    return path.join(dataDir, "simulator-state.json");
  }

  private loadState(): SimulatorState | null {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const content = fs.readFileSync(this.stateFilePath, "utf-8");
        return JSON.parse(content);
      }
    } catch (error) {
      console.error(
        "[Simulator Broker] Failed to load state:",
        error instanceof Error ? error.message : error
      );
    }
    return null;
  }

  private saveState(): void {
    try {
      const dataDir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.state.lastSyncedAt = new Date().toISOString();
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error(
        "[Simulator Broker] Failed to save state:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // --------------------------------------------------------------------------
  // Price Fetching with Caching
  // --------------------------------------------------------------------------

  private async getCachedQuote(symbol: string): Promise<number | null> {
    const now = Date.now();
    const cached = this.priceCache.get(symbol);

    // Return cached price if still fresh
    if (cached && now - cached.timestamp < this.PRICE_CACHE_DURATION) {
      return cached.price;
    }

    // Fetch fresh price from Yahoo Finance
    try {
      const result = await getQuote(symbol);
      if (result.data) {
        this.priceCache.set(symbol, {
          symbol,
          price: result.data.price,
          timestamp: now,
        });
        return result.data.price;
      }
    } catch (error) {
      console.error(
        `[Simulator Broker] Failed to fetch quote for ${symbol}:`,
        error instanceof Error ? error.message : error
      );
    }

    return null;
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
      this.connected = true;
      const account = await this.getAccount();
      return { connected: true, account };
    } catch (error) {
      this.connected = false;
      const message =
        error instanceof Error ? error.message : "Unknown connection error";
      console.error(
        "[Simulator Broker] Connection test failed:",
        message
      );
      return { connected: false, error: message };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getTradingMode(): TradingMode {
    return "paper";
  }

  // --------------------------------------------------------------------------
  // Account
  // --------------------------------------------------------------------------

  async getAccount(): Promise<BrokerAccount> {
    const positions = await this.getPositions();

    // Calculate totals
    let longMarketValue = 0;
    let shortMarketValue = 0;
    for (const pos of positions) {
      if (pos.side === "long") {
        longMarketValue += pos.marketValue;
      } else {
        shortMarketValue += pos.marketValue;
      }
    }

    const portfolioValue = this.state.cash + longMarketValue - shortMarketValue;
    const equity = portfolioValue;
    const buyingPower = equity * 4; // 4:1 for simulated margin

    return {
      id: this.state.accountId,
      accountNumber: `SIM-${this.state.accountId.slice(-8)}`,
      status: "active",
      currency: "USD",
      buyingPower,
      cash: this.state.cash,
      portfolioValue,
      equity,
      longMarketValue,
      shortMarketValue,
      daytradeCount: 0,
      patternDayTrader: false,
      tradingBlocked: false,
      transfersBlocked: false,
      tradingMode: "paper",
      lastSyncedAt: this.state.lastSyncedAt,
    };
  }

  // --------------------------------------------------------------------------
  // Positions
  // --------------------------------------------------------------------------

  async getPositions(): Promise<BrokerPosition[]> {
    const positions: BrokerPosition[] = [];

    for (const simPos of this.state.positions) {
      const currentPrice = await this.getCachedQuote(simPos.symbol);
      if (currentPrice === null) {
        console.warn(
          `[Simulator Broker] Could not fetch current price for ${simPos.symbol}`
        );
        continue;
      }

      const marketValue = Math.abs(simPos.quantity) * currentPrice;
      const costBasis = Math.abs(simPos.quantity) * simPos.entryPrice;
      const unrealizedPnl = marketValue - costBasis;
      const unrealizedPnlPercent =
        costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

      positions.push({
        symbol: simPos.symbol,
        assetId: `sim-${simPos.symbol}`,
        assetClass: "us_equity",
        quantity: Math.abs(simPos.quantity),
        side: simPos.quantity >= 0 ? "long" : "short",
        entryPrice: simPos.entryPrice,
        currentPrice,
        marketValue,
        costBasis,
        unrealizedPnl,
        unrealizedPnlPercent,
        changeToday: 0, // Simplified: would need historical tracking
      });
    }

    return positions;
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    const positions = await this.getPositions();
    return positions.find((p) => p.symbol === symbol) || null;
  }

  async closePosition(symbol: string, _quantity?: number): Promise<BrokerOrder> {
    const position = this.state.positions.find((p) => p.symbol === symbol);
    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }

    const orderId = this.generateOrderId();
    const quantity = Math.abs(position.quantity);
    const side: OrderSide = position.quantity > 0 ? "sell" : "buy";

    const order: SimulatorOrder = {
      id: orderId,
      clientOrderId: "",
      symbol,
      quantity,
      filledQuantity: 0,
      side,
      type: "market",
      timeInForce: "day",
      status: "pending_new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
    };

    // Try to fill the order immediately
    await this.fillMarketOrder(order);

    return this.mapOrderToResponse(order);
  }

  // --------------------------------------------------------------------------
  // Orders
  // --------------------------------------------------------------------------

  async createOrder(params: OrderParams): Promise<BrokerOrder> {
    const orderId = this.generateOrderId();

    const order: SimulatorOrder = {
      id: orderId,
      clientOrderId: params.clientOrderId || "",
      symbol: params.symbol,
      quantity: params.quantity,
      filledQuantity: 0,
      side: params.side,
      type: params.type,
      timeInForce: params.timeInForce,
      status: "pending_new",
      limitPrice: params.limitPrice,
      stopPrice: params.stopPrice,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
    };

    this.state.orders.push(order);

    console.log(
      `[Simulator Broker] Created ${params.side} order: ${params.quantity}x${params.symbol} (${params.type})`
    );

    // For market orders, fill immediately
    if (params.type === "market") {
      await this.fillMarketOrder(order);
    } else if (params.type === "limit") {
      // For limit orders, check if conditions are met
      await this.checkAndFillLimitOrder(order);
    }

    // Record portfolio snapshot after trade
    if (order.status === "filled") {
      await this.recordSnapshot();
    }

    this.saveState();
    return this.mapOrderToResponse(order);
  }

  async getOrder(orderId: string): Promise<BrokerOrder> {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    return this.mapOrderToResponse(order);
  }

  async getOrders(
    status: "open" | "closed" | "all" = "all",
    limit: number = 50
  ): Promise<BrokerOrder[]> {
    let filtered = [...this.state.orders];

    if (status === "open") {
      filtered = filtered.filter(
        (o) =>
          o.status === "pending_new" ||
          o.status === "partially_filled" ||
          o.status === "accepted"
      );
    } else if (status === "closed") {
      filtered = filtered.filter(
        (o) =>
          o.status === "filled" ||
          o.status === "canceled" ||
          o.status === "rejected"
      );
    }

    // Sort by newest first
    filtered.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return filtered.slice(0, limit).map((o) => this.mapOrderToResponse(o));
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.state.orders.find((o) => o.id === orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (
      order.status === "filled" ||
      order.status === "canceled" ||
      order.status === "rejected"
    ) {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    order.status = "canceled";
    order.canceledAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();

    this.saveState();
    console.log(`[Simulator Broker] Canceled order: ${orderId}`);
  }

  // --------------------------------------------------------------------------
  // Market Clock
  // --------------------------------------------------------------------------

  async isMarketOpen(): Promise<{
    isOpen: boolean;
    nextOpen: string;
    nextClose: string;
  }> {
    // Simplified: assume market is always open for simulation
    const now = new Date();
    const nextOpen = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const nextClose = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString();

    return {
      isOpen: true,
      nextOpen,
      nextClose,
    };
  }

  // --------------------------------------------------------------------------
  // Portfolio History
  // --------------------------------------------------------------------------

  /**
   * Record a portfolio snapshot (called after each trade fill).
   */
  async recordSnapshot(): Promise<void> {
    try {
      const account = await this.getAccount();
      const snapshot: PortfolioSnapshot = {
        timestamp: Math.floor(Date.now() / 1000),
        equity: account.equity,
      };

      // Initialize history array if loading from old state
      if (!this.state.portfolioHistory) {
        this.state.portfolioHistory = [];
      }

      // Avoid duplicate snapshots within 30 seconds
      const last = this.state.portfolioHistory[this.state.portfolioHistory.length - 1];
      if (!last || snapshot.timestamp - last.timestamp > 30) {
        this.state.portfolioHistory.push(snapshot);
        // Keep last 500 snapshots
        if (this.state.portfolioHistory.length > 500) {
          this.state.portfolioHistory = this.state.portfolioHistory.slice(-500);
        }
        this.saveState();
      }
    } catch {
      // Non-critical — skip snapshot
    }
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
    const account = await this.getAccount();
    const history = this.state.portfolioHistory ?? [];

    // Always include current state as the latest point
    const now = Math.floor(Date.now() / 1000);
    const allPoints = [
      ...history,
      { timestamp: now, equity: account.equity },
    ];

    return {
      timestamps: allPoints.map((p) => p.timestamp),
      equity: allPoints.map((p) => p.equity),
      profitLoss: allPoints.map((p) => p.equity - this.startingCapital),
      profitLossPct: allPoints.map(
        (p) => ((p.equity - this.startingCapital) / this.startingCapital) * 100
      ),
      baseValue: this.startingCapital,
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private generateOrderId(): string {
    return `sim-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private async fillMarketOrder(order: SimulatorOrder): Promise<void> {
    const currentPrice = await this.getCachedQuote(order.symbol);
    if (currentPrice === null) {
      order.status = "rejected";
      console.error(
        `[Simulator Broker] Could not fill order: no price for ${order.symbol}`
      );
      return;
    }

    // Check if we have enough cash or positions
    const orderCost = order.quantity * currentPrice;

    if (order.side === "buy") {
      if (orderCost > this.state.cash) {
        order.status = "rejected";
        console.warn(
          `[Simulator Broker] Insufficient cash: need $${orderCost}, have $${this.state.cash}`
        );
        return;
      }
      this.state.cash -= orderCost;
    } else {
      // Sell: check if we have the position
      const existingPos = this.state.positions.find(
        (p) => p.symbol === order.symbol
      );
      if (!existingPos || existingPos.quantity < order.quantity) {
        order.status = "rejected";
        console.warn(
          `[Simulator Broker] Insufficient position for sale: need ${order.quantity}, have ${existingPos?.quantity || 0}`
        );
        return;
      }
      // Add sale proceeds back to cash
      this.state.cash += orderCost;
    }

    // Fill the order
    order.filledQuantity = order.quantity;
    order.filledAvgPrice = currentPrice;
    order.status = "filled";
    order.filledAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();

    console.log(
      `[Simulator Broker] Filled ${order.side} ${order.quantity}x${order.symbol} @ $${currentPrice.toFixed(2)}`
    );

    // Update position
    this.updatePositionFromFill(order, currentPrice);
  }

  private async checkAndFillLimitOrder(order: SimulatorOrder): Promise<void> {
    if (!order.limitPrice) {
      order.status = "rejected";
      return;
    }

    const currentPrice = await this.getCachedQuote(order.symbol);
    if (currentPrice === null) {
      // Leave as pending; can retry later
      order.status = "accepted";
      return;
    }

    const shouldFill =
      (order.side === "buy" && currentPrice <= order.limitPrice) ||
      (order.side === "sell" && currentPrice >= order.limitPrice);

    if (shouldFill) {
      // Fill at limit price
      const fillPrice = order.limitPrice;
      const orderCost = order.quantity * fillPrice;

      if (order.side === "buy") {
        if (orderCost > this.state.cash) {
          order.status = "accepted";
          return;
        }
        this.state.cash -= orderCost;
      } else {
        const existingPos = this.state.positions.find(
          (p) => p.symbol === order.symbol
        );
        if (!existingPos || existingPos.quantity < order.quantity) {
          order.status = "accepted";
          return;
        }
      }

      order.filledQuantity = order.quantity;
      order.filledAvgPrice = fillPrice;
      order.status = "filled";
      order.filledAt = new Date().toISOString();
      order.updatedAt = new Date().toISOString();

      this.updatePositionFromFill(order, fillPrice);
    } else {
      order.status = "accepted";
    }
  }

  private updatePositionFromFill(order: SimulatorOrder, fillPrice: number): void {
    const existingPos = this.state.positions.find(
      (p) => p.symbol === order.symbol
    );

    if (order.side === "buy") {
      if (existingPos) {
        // Average up
        const newQty = existingPos.quantity + order.quantity;
        existingPos.entryPrice =
          (existingPos.entryPrice * existingPos.quantity +
            fillPrice * order.quantity) /
          newQty;
        existingPos.quantity = newQty;
      } else {
        // New position
        this.state.positions.push({
          symbol: order.symbol,
          quantity: order.quantity,
          entryPrice: fillPrice,
          entryTime: new Date().toISOString(),
        });
      }
    } else {
      // Sell
      if (existingPos) {
        existingPos.quantity -= order.quantity;
        if (existingPos.quantity === 0) {
          // Remove fully closed position
          this.state.positions = this.state.positions.filter(
            (p) => p.symbol !== order.symbol
          );
        }
      }
    }
  }

  private mapOrderToResponse(order: SimulatorOrder): BrokerOrder {
    return {
      id: order.id,
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      quantity: order.quantity,
      filledQuantity: order.filledQuantity,
      side: order.side,
      type: order.type,
      timeInForce: order.timeInForce,
      status: order.status,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      filledAvgPrice: order.filledAvgPrice,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      submittedAt: order.submittedAt,
      filledAt: order.filledAt,
      canceledAt: order.canceledAt,
      assetClass: "us_equity",
    };
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

export function getSimulator(): SimulatorBroker | null {
  return simulatorInstance;
}

export function initSimulator(startingCapital: number = 100000): SimulatorBroker {
  simulatorInstance = new SimulatorBroker(startingCapital);
  simulatorInstance.testConnection();
  return simulatorInstance;
}

export function disconnectSimulator(): void {
  simulatorInstance = null;
  console.log("[Simulator Broker] Disconnected");
}
