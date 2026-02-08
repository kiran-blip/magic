/**
 * Gold Digger AGI Memory System - Index
 * Exports all memory-related types and functions
 */

export type {
  ConversationMemory,
  InvestmentMemory,
  ResearchMemory,
  MemoryStore,
} from './store';

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
  generateTags,
  getMemoryStats,
  pruneOldMemories,
} from './store';
