import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Conversation memory: Stores user queries and agent responses
 */
export interface ConversationMemory {
  id: string;            // UUID
  timestamp: string;     // ISO date
  userQuery: string;     // What the user asked
  agentType: string;     // "investment" | "research" | "general"
  summary: string;       // Brief summary of the response (max 300 chars)
  fullResponse: string;  // Complete response text
  symbols?: string[];    // Any ticker symbols mentioned
  tags: string[];        // Auto-generated tags for search
}

/**
 * Investment memory: Stores investment decisions and recommendations
 */
export interface InvestmentMemory {
  id: string;
  timestamp: string;
  symbol: string;
  action: string;        // BUY/SELL/HOLD/AVOID
  confidence: number;    // 0-100
  reasoning: string;     // Brief reasoning
  priceAtTime?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

/**
 * Research memory: Stores niche research findings and verdicts
 */
export interface ResearchMemory {
  id: string;
  timestamp: string;
  niche: string;
  opportunityScore: number;
  keyFindings: string;
  verdict: string;       // "Strong" | "Moderate" | "Weak"
}

/**
 * Main memory store containing all memory types
 */
export interface MemoryStore {
  conversations: ConversationMemory[];
  investments: InvestmentMemory[];
  research: ResearchMemory[];
  lastUpdated: string;
}

// In-memory cache with file modification tracking
let memoryCache: MemoryStore | null = null;
let cacheFileModTime: number | null = null;

/**
 * Get the data directory for memory storage
 */
function getDataDirectory(): string {
  const dataDir = process.env.GOLDDIGGER_DATA_DIR || path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

/**
 * Get the memory store file path
 */
function getMemoryFilePath(): string {
  return path.join(getDataDirectory(), 'golddigger-memory.json');
}

/**
 * Load memory store from JSON file, create if not exists
 */
export function loadMemoryStore(): MemoryStore {
  const filePath = getMemoryFilePath();

  // Check if file exists and hasn't been modified since last cache
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const currentModTime = stats.mtimeMs;

    // Return cached version if file hasn't changed
    if (memoryCache !== null && cacheFileModTime === currentModTime) {
      return memoryCache;
    }

    // Load from file and update cache
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const parsed: MemoryStore = JSON.parse(fileContent);
      memoryCache = parsed;
      cacheFileModTime = currentModTime;
      return parsed;
    } catch (error) {
      console.error('Error loading memory store:', error);
      // Return empty store if parsing fails
      memoryCache = createEmptyStore();
      cacheFileModTime = null;
      return memoryCache;
    }
  }

  // Create new empty store if file doesn't exist
  memoryCache = createEmptyStore();
  cacheFileModTime = null;
  saveMemoryStore(memoryCache);
  return memoryCache;
}

/**
 * Create an empty memory store
 */
function createEmptyStore(): MemoryStore {
  return {
    conversations: [],
    investments: [],
    research: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Save memory store to JSON file
 */
export function saveMemoryStore(store: MemoryStore): boolean {
  try {
    const filePath = getMemoryFilePath();
    store.lastUpdated = new Date().toISOString();

    // Write to file with pretty formatting
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');

    // Update cache and modification time
    const stats = fs.statSync(filePath);
    memoryCache = store;
    cacheFileModTime = stats.mtimeMs;

    return true;
  } catch (error) {
    console.error('Error saving memory store:', error);
    return false;
  }
}

/**
 * Store a conversation memory and return its ID
 */
export function storeConversation(
  memory: Omit<ConversationMemory, 'id'>
): string {
  const store = loadMemoryStore();
  const id = randomUUID();

  const conversationMemory: ConversationMemory = {
    ...memory,
    id,
    timestamp: new Date().toISOString(),
  };

  store.conversations.push(conversationMemory);

  // Enforce max 1000 conversations
  if (store.conversations.length > 1000) {
    store.conversations = store.conversations.slice(-1000);
  }

  saveMemoryStore(store);
  return id;
}

/**
 * Store an investment decision and return its ID
 */
export function storeInvestmentDecision(
  memory: Omit<InvestmentMemory, 'id'>
): string {
  const store = loadMemoryStore();
  const id = randomUUID();

  const investmentMemory: InvestmentMemory = {
    ...memory,
    id,
    timestamp: new Date().toISOString(),
  };

  store.investments.push(investmentMemory);

  // Enforce max 500 investments
  if (store.investments.length > 500) {
    store.investments = store.investments.slice(-500);
  }

  saveMemoryStore(store);
  return id;
}

/**
 * Store a research finding and return its ID
 */
export function storeResearchFinding(
  memory: Omit<ResearchMemory, 'id'>
): string {
  const store = loadMemoryStore();
  const id = randomUUID();

  const researchMemory: ResearchMemory = {
    ...memory,
    id,
    timestamp: new Date().toISOString(),
  };

  store.research.push(researchMemory);

  // Enforce max 200 research entries
  if (store.research.length > 200) {
    store.research = store.research.slice(-200);
  }

  saveMemoryStore(store);
  return id;
}

/**
 * Recall relevant conversations based on keyword matching (TF-IDF-like scoring)
 */
export function recallRelevant(query: string, limit: number = 10): ConversationMemory[] {
  const store = loadMemoryStore();

  if (store.conversations.length === 0) {
    return [];
  }

  // Normalize and split query into words
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2); // Filter out very short words

  if (queryWords.length === 0) {
    return store.conversations.slice(-limit);
  }

  // Score each conversation by matching words
  const scored = store.conversations.map(conv => {
    const searchText = `${conv.userQuery} ${conv.summary} ${(conv.tags || []).join(' ')}`.toLowerCase();

    let matchCount = 0;
    for (const word of queryWords) {
      // Count word occurrences
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      const matches = searchText.match(regex) || [];
      matchCount += matches.length;
    }

    // Normalize by total searchable words in the conversation
    const totalWords = searchText.split(/\s+/).length;
    const score = totalWords > 0 ? (matchCount / totalWords) * 100 : 0;

    return { conversation: conv, score };
  });

  // Sort by score (descending) and return top N
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.conversation);
}

/**
 * Recall investment history, optionally filtered by symbol
 */
export function recallInvestmentHistory(
  symbol?: string,
  limit: number = 20
): InvestmentMemory[] {
  const store = loadMemoryStore();

  let investments = store.investments;

  if (symbol) {
    investments = investments.filter(inv => inv.symbol.toUpperCase() === symbol.toUpperCase());
  }

  // Return most recent, up to limit
  return investments.slice(-limit).reverse();
}

/**
 * Recall research history, optionally filtered by niche
 */
export function recallResearchHistory(
  niche?: string,
  limit: number = 20
): ResearchMemory[] {
  const store = loadMemoryStore();

  let research = store.research;

  if (niche) {
    research = research.filter(
      r => r.niche.toLowerCase().includes(niche.toLowerCase())
    );
  }

  // Return most recent, up to limit
  return research.slice(-limit).reverse();
}

/**
 * Get N most recent conversations
 */
export function getRecentConversations(limit: number = 20): ConversationMemory[] {
  const store = loadMemoryStore();
  return store.conversations.slice(-limit).reverse();
}

/**
 * Auto-generate searchable tags from query and response
 */
export function generateTags(query: string, response: string): string[] {
  const tags = new Set<string>();

  const combinedText = `${query} ${response}`.toLowerCase();

  // Extract ticker symbols (uppercase 1-5 chars)
  const tickerRegex = /\b([A-Z]{1,5})\b/g;
  let match;
  while ((match = tickerRegex.exec(query + response)) !== null) {
    if (match[1].length >= 1 && match[1].length <= 5) {
      tags.add(match[1]);
    }
  }

  // Financial action terms
  const financialActions = ['buy', 'sell', 'hold', 'avoid', 'long', 'short', 'bullish', 'bearish', 'rally', 'dump', 'pump'];
  for (const term of financialActions) {
    if (combinedText.includes(term)) {
      tags.add(term);
    }
  }

  // Asset types
  const assetTypes = ['stock', 'crypto', 'bitcoin', 'ethereum', 'etf', 'fund', 'bond', 'commodity', 'forex', 'gold', 'oil'];
  for (const type of assetTypes) {
    if (combinedText.includes(type)) {
      tags.add(type);
    }
  }

  // Market categories and concepts
  const concepts = ['growth', 'value', 'dividend', 'dividend-paying', 'earnings', 'revenue', 'market-cap', 'volatility', 'risk', 'hedge', 'portfolio', 'diversification', 'momentum', 'trend', 'support', 'resistance', 'breakout', 'chart', 'technical', 'fundamental'];
  for (const concept of concepts) {
    if (combinedText.includes(concept) || combinedText.includes(concept.replace('-', ' '))) {
      tags.add(concept);
    }
  }

  // Extract time-related tags
  if (combinedText.includes('short') || combinedText.includes('week') || combinedText.includes('day')) {
    tags.add('short-term');
  }
  if (combinedText.includes('long') || combinedText.includes('year') || combinedText.includes('month')) {
    tags.add('long-term');
  }

  return Array.from(tags);
}

/**
 * Get memory statistics
 */
export function getMemoryStats(): {
  totalConversations: number;
  totalInvestments: number;
  totalResearch: number;
  oldestMemory: string | null;
  newestMemory: string | null;
} {
  const store = loadMemoryStore();

  const allMemories = [
    ...store.conversations,
    ...store.investments,
    ...store.research,
  ];

  if (allMemories.length === 0) {
    return {
      totalConversations: 0,
      totalInvestments: 0,
      totalResearch: 0,
      oldestMemory: null,
      newestMemory: null,
    };
  }

  const timestamps = allMemories.map(m => new Date(m.timestamp).getTime());
  const oldestTime = Math.min(...timestamps);
  const newestTime = Math.max(...timestamps);

  return {
    totalConversations: store.conversations.length,
    totalInvestments: store.investments.length,
    totalResearch: store.research.length,
    oldestMemory: new Date(oldestTime).toISOString(),
    newestMemory: new Date(newestTime).toISOString(),
  };
}

/**
 * Prune old memories based on age (in days)
 * Also enforces max limits: 1000 conversations, 500 investments, 200 research
 * Returns count of removed entries
 */
export function pruneOldMemories(maxAge: number): number {
  const store = loadMemoryStore();
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - maxAge * 24 * 60 * 60 * 1000);

  let removed = 0;

  // Prune conversations
  const originalConvCount = store.conversations.length;
  store.conversations = store.conversations.filter(
    conv => new Date(conv.timestamp) > cutoffTime
  );
  removed += originalConvCount - store.conversations.length;

  // Enforce max 1000 conversations (keep newest)
  if (store.conversations.length > 1000) {
    removed += store.conversations.length - 1000;
    store.conversations = store.conversations.slice(-1000);
  }

  // Prune investments
  const originalInvCount = store.investments.length;
  store.investments = store.investments.filter(
    inv => new Date(inv.timestamp) > cutoffTime
  );
  removed += originalInvCount - store.investments.length;

  // Enforce max 500 investments (keep newest)
  if (store.investments.length > 500) {
    removed += store.investments.length - 500;
    store.investments = store.investments.slice(-500);
  }

  // Prune research
  const originalResCount = store.research.length;
  store.research = store.research.filter(
    res => new Date(res.timestamp) > cutoffTime
  );
  removed += originalResCount - store.research.length;

  // Enforce max 200 research entries (keep newest)
  if (store.research.length > 200) {
    removed += store.research.length - 200;
    store.research = store.research.slice(-200);
  }

  if (removed > 0) {
    saveMemoryStore(store);
  }

  return removed;
}
