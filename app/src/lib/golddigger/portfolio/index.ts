/**
 * Portfolio module — position tracking, P&L, sync, performance.
 */

export {
  getOpenPositions,
  getAllPositions,
  getPositionBySymbol,
  upsertPosition,
  closePosition,
  recordTransaction,
  getRecentTransactions,
  recordDailyPerformance,
  getPerformanceHistory,
  syncFromBroker,
  getPortfolioSummary,
  logAuditEvent,
  type PortfolioPositionRow,
  type PortfolioTransactionRow,
  type PerformanceSnapshot,
  type PortfolioSummary,
  type SyncResult,
} from "./manager";
