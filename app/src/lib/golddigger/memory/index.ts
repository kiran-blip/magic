/**
 * Gold Digger AGI Memory System - Index
 *
 * Uses SQLite for persistent storage with FTS5 full-text search.
 * Auto-migrates existing JSON data on first run.
 *
 * The JSON store is kept for generateTags() (pure function, no DB needed).
 * All storage/retrieval uses the SQLite backend.
 */

export type {
  ConversationMemory,
  InvestmentMemory,
  ResearchMemory,
  MemoryStore,
} from './store';

// Tag generation is a pure function — keep from original store
export { generateTags } from './store';

// All storage & retrieval now uses SQLite
export {
  loadMemoryStore,
  saveMemoryStore,
  storeConversation,
  storeInvestmentDecision,
  storeResearchFinding,
  recallRelevant,
  recallInvestmentHistory,
  recallResearchHistory,
  getRecentConversations,
  getMemoryStats,
  pruneOldMemories,
  // SQLite-only extras
  searchConversations,
  getInvestmentsByDateRange,
  getTrackedSymbols,
  closeDatabase,
} from './sqlite-store';
