/**
 * Market Tools Module
 * Provides market data fetching and analysis capabilities for trading agents
 * Uses Yahoo Finance APIs to retrieve stock, crypto, and market data
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface StockData {
  symbol: string;
  price: number;
  change5d: number;
  volume: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface ScreenStocksResult {
  criteria: string;
  stocks: StockData[];
  fetchedAt: string;
  error?: string;
}

export interface CryptoData {
  symbol: string;
  price: number;
  change24h: number;
  change7d: number;
  change30d: number;
  volume24h: number;
  marketCap: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface CryptoDataResult {
  data?: CryptoData;
  error?: string;
}

export interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change1d: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface MarketOverviewResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  indices: IndexData[];
  vixLevel: number;
  fearGreedEstimate: string;
  timestamp: string;
  error?: string;
}

export interface SectorData {
  name: string;
  etf: string;
  change5d: number;
  trend: 'up' | 'down' | 'neutral';
}

export interface SectorPerformanceResult {
  sectors: SectorData[];
  topSector?: string;
  weakestSector?: string;
  timestamp: string;
  error?: string;
}

export interface RelatedAssetsResult {
  symbol: string;
  sector?: string;
  peers: string[];
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const STOCK_SCREENER_CRITERIA: Record<string, string[]> = {
  blue_chip: ['AAPL', 'MSFT', 'JNJ', 'V', 'WMT', 'PG', 'KO', 'DIS'],
  growth: ['TSLA', 'NVDA', 'AVGO', 'NFLX', 'MSTR', 'CRM', 'ADBE', 'SQ'],
  dividend: ['PEP', 'MCD', 'O', 'SCHD', 'VYM', 'DGRO', 'SDIV', 'JNJ'],
  value: ['JPM', 'BAC', 'C', 'F', 'GE', 'XOM', 'CVX', 'T'],
  momentum: ['TSLA', 'MSTR', 'AVGO', 'NVDA', 'NFLX', 'UBER', 'PLTR', 'PYPL'],
  quick_wins: ['SOFI', 'RIOT', 'MARA', 'CLSK', 'MSTR', 'COIN', 'MVIS', 'FUBO'],
};

const SECTOR_ETFS: Record<string, string> = {
  Technology: 'XLK',
  Finance: 'XLF',
  Energy: 'XLE',
  Healthcare: 'XLV',
  'Consumer Discretionary': 'XLY',
  Industrial: 'XLI',
  'Consumer Staples': 'XLP',
  Utilities: 'XLU',
  'Real Estate': 'XLRE',
  Communication: 'XLC',
};

const SECTOR_PEERS: Record<string, string[]> = {
  Technology: ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD', 'INTC'],
  Finance: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'AXP'],
  Energy: ['XOM', 'CVX', 'COP', 'MPC', 'PSX', 'VLO', 'OXY'],
  Healthcare: ['UNH', 'JNJ', 'PFE', 'ABBV', 'MRK', 'TMO', 'AMGN'],
  'Consumer Discretionary': ['AMZN', 'MCD', 'NKE', 'TSLA', 'HD', 'LOW', 'TJX'],
  Industrial: ['BA', 'CAT', 'GE', 'MMM', 'HON', 'RTX', 'DE'],
  'Consumer Staples': ['PG', 'PEP', 'KO', 'WMT', 'CL', 'MO', 'EL'],
  Utilities: ['NEE', 'DUK', 'SO', 'EXC', 'D', 'AEE', 'AWK'],
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Fetches JSON data from Yahoo Finance with error handling
 */
async function fetchYahooFinance(url: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GoldDigger/1.0)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Yahoo Finance API request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calculates trend direction based on percentage change
 */
function calculateTrend(changePercent: number): 'up' | 'down' | 'neutral' {
  if (changePercent > 0.5) return 'up';
  if (changePercent < -0.5) return 'down';
  return 'neutral';
}

/**
 * Extracts OHLC data from Yahoo Finance chart response
 */
function extractChartData(
  data: any
): { price: number; change: number; volume: number } | null {
  try {
    const result = data.chart.result[0];
    if (!result || !result.indicators?.quote[0]) {
      return null;
    }

    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;

    if (
      !quote.close ||
      quote.close.length === 0 ||
      !quote.volume ||
      quote.volume.length === 0
    ) {
      return null;
    }

    // Get latest price
    const currentPrice = quote.close[quote.close.length - 1];
    const currentVolume = quote.volume[quote.volume.length - 1] || 0;

    // Calculate change
    let changePercent = 0;
    if (quote.close.length > 1 && quote.close[0] !== null) {
      changePercent =
        ((currentPrice - quote.close[0]) / quote.close[0]) * 100;
    }

    return {
      price: parseFloat(currentPrice.toFixed(2)),
      change: parseFloat(changePercent.toFixed(2)),
      volume: Math.floor(currentVolume),
    };
  } catch (error) {
    return null;
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Screens stocks based on predefined criteria
 * @param criteria - Type of stocks to screen: "blue_chip", "growth", "dividend", "value", "momentum", "quick_wins"
 * @returns Stock screening results sorted by performance
 */
export async function screenStocks(
  criteria: string
): Promise<ScreenStocksResult> {
  try {
    // Validate criteria
    if (!STOCK_SCREENER_CRITERIA[criteria]) {
      return {
        criteria,
        stocks: [],
        fetchedAt: new Date().toISOString(),
        error: `Invalid criteria. Valid options: ${Object.keys(STOCK_SCREENER_CRITERIA).join(', ')}`,
      };
    }

    const tickers = STOCK_SCREENER_CRITERIA[criteria];
    const stocks: StockData[] = [];

    // Fetch data for each ticker
    for (const symbol of tickers) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;
        const data = await fetchYahooFinance(url);
        const chartData = extractChartData(data);

        if (chartData) {
          stocks.push({
            symbol,
            price: chartData.price,
            change5d: chartData.change,
            volume: chartData.volume,
            trend: calculateTrend(chartData.change),
          });
        }
      } catch (error) {
        // Skip stocks that fail to fetch
        console.error(`Failed to fetch ${symbol}:`, error);
      }
    }

    // Sort by 5-day change (best performers first)
    stocks.sort((a, b) => b.change5d - a.change5d);

    return {
      criteria,
      stocks,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      criteria,
      stocks: [],
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets cryptocurrency market data
 * @param symbol - Crypto symbol (e.g., "BTC", "ETH", "DOGE")
 * @returns Crypto market data with 24h, 7d, and 30d changes
 */
export async function getCryptoData(symbol: string): Promise<CryptoDataResult> {
  try {
    // Normalize symbol
    let ticker = symbol.toUpperCase();
    if (!ticker.endsWith('-USD')) {
      ticker = `${ticker}-USD`;
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=30d&interval=1d`;
    const data = await fetchYahooFinance(url);

    if (!data.chart.result[0]) {
      return {
        error: `Could not fetch data for ${symbol}`,
      };
    }

    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    const closeData = quote.close;
    const volumeData = quote.volume;

    if (!closeData || closeData.length === 0) {
      return {
        error: `No price data available for ${symbol}`,
      };
    }

    const currentPrice = closeData[closeData.length - 1];
    const currentVolume =
      (volumeData && volumeData[volumeData.length - 1]) || 0;

    // Calculate changes
    const change24h = (() => {
      if (closeData.length >= 2 && closeData[closeData.length - 2] !== null) {
        return (
          ((currentPrice - closeData[closeData.length - 2]) /
            closeData[closeData.length - 2]) *
          100
        );
      }
      return 0;
    })();

    const change7d = (() => {
      if (closeData.length >= 7 && closeData[closeData.length - 7] !== null) {
        return (
          ((currentPrice - closeData[closeData.length - 7]) /
            closeData[closeData.length - 7]) *
          100
        );
      }
      return change24h;
    })();

    const change30d = (() => {
      if (closeData.length >= 1 && closeData[0] !== null) {
        return (
          ((currentPrice - closeData[0]) / closeData[0]) * 100
        );
      }
      return change7d;
    })();

    return {
      data: {
        symbol: ticker,
        price: parseFloat(currentPrice.toFixed(2)),
        change24h: parseFloat(change24h.toFixed(2)),
        change7d: parseFloat(change7d.toFixed(2)),
        change30d: parseFloat(change30d.toFixed(2)),
        volume24h: Math.floor(currentVolume),
        marketCap: 0, // Yahoo Finance free API doesn't provide marketCap in chart endpoint
        trend: calculateTrend(change7d),
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets full market overview with major indices
 * @returns Market sentiment and index data
 */
export async function getMarketOverview(): Promise<MarketOverviewResult> {
  try {
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX'];
    const indexData: IndexData[] = [];
    let bullishCount = 0;

    // Fetch data for each index
    for (const symbol of indices) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;
        const data = await fetchYahooFinance(url);
        const chartData = extractChartData(data);

        if (chartData) {
          const change = chartData.change;
          const isBullish = change > 0;
          if (isBullish && symbol !== 'VIX') {
            bullishCount++;
          }
          if (!isBullish && symbol === 'VIX') {
            bullishCount++; // VIX down is bullish
          }

          indexData.push({
            symbol,
            name:
              symbol === 'SPY'
                ? 'S&P 500'
                : symbol === 'QQQ'
                  ? 'Nasdaq 100'
                  : symbol === 'DIA'
                    ? 'Dow Jones'
                    : symbol === 'IWM'
                      ? 'Russell 2000'
                      : 'VIX',
            price: chartData.price,
            change1d: change,
            trend: calculateTrend(change),
          });
        }
      } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error);
      }
    }

    // Determine sentiment
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bullishCount >= 4) {
      sentiment = 'bullish';
    } else if (bullishCount <= 1) {
      sentiment = 'bearish';
    }

    // Get VIX level for fear gauge
    const vixIndex = indexData.find((i) => i.symbol === 'VIX');
    const vixLevel = vixIndex ? vixIndex.price : 0;
    let fearGreedEstimate = 'neutral';
    if (vixLevel > 25) {
      fearGreedEstimate = 'fear';
    } else if (vixLevel < 15) {
      fearGreedEstimate = 'greed';
    }

    return {
      sentiment,
      indices: indexData,
      vixLevel,
      fearGreedEstimate,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      sentiment: 'neutral',
      indices: [],
      vixLevel: 0,
      fearGreedEstimate: 'unknown',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets sector performance based on sector ETFs
 * @returns Sector performance sorted by 5-day change
 */
export async function getSectorPerformance(): Promise<SectorPerformanceResult> {
  try {
    const sectors: SectorData[] = [];

    // Fetch data for each sector ETF
    for (const [name, etf] of Object.entries(SECTOR_ETFS)) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${etf}?range=5d&interval=1d`;
        const data = await fetchYahooFinance(url);
        const chartData = extractChartData(data);

        if (chartData) {
          sectors.push({
            name,
            etf,
            change5d: chartData.change,
            trend: calculateTrend(chartData.change),
          });
        }
      } catch (error) {
        console.error(`Failed to fetch sector ${name} (${etf}):`, error);
      }
    }

    // Sort by 5-day change
    sectors.sort((a, b) => b.change5d - a.change5d);

    const topSector = sectors.length > 0 ? sectors[0].name : undefined;
    const weakestSector =
      sectors.length > 0 ? sectors[sectors.length - 1].name : undefined;

    return {
      sectors,
      topSector,
      weakestSector,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      sectors: [],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets related/peer assets for a given symbol
 * @param symbol - Stock symbol to find peers for
 * @returns Symbol, sector, and peer companies
 */
export async function getRelatedAssets(
  symbol: string
): Promise<RelatedAssetsResult> {
  try {
    const ticker = symbol.toUpperCase();

    // Try to fetch sector information from Yahoo Finance
    // Using quoteSummary endpoint
    let sector = 'Technology'; // default fallback

    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile`;
      const data = await fetchYahooFinance(url);

      if (
        data.quoteSummary?.result?.[0]?.assetProfile?.industry
      ) {
        const industry = data.quoteSummary.result[0].assetProfile.industry;

        // Map industry to sector
        if (
          industry.includes('Software') ||
          industry.includes('Semiconductor') ||
          industry.includes('Technology')
        ) {
          sector = 'Technology';
        } else if (
          industry.includes('Finance') ||
          industry.includes('Bank') ||
          industry.includes('Insurance')
        ) {
          sector = 'Finance';
        } else if (
          industry.includes('Energy') ||
          industry.includes('Oil')
        ) {
          sector = 'Energy';
        } else if (
          industry.includes('Healthcare') ||
          industry.includes('Medical') ||
          industry.includes('Pharma')
        ) {
          sector = 'Healthcare';
        } else if (
          industry.includes('Retail') ||
          industry.includes('Consumer')
        ) {
          sector = 'Consumer Discretionary';
        } else if (
          industry.includes('Industrial') ||
          industry.includes('Manufacturing')
        ) {
          sector = 'Industrial';
        }
      }
    } catch (error) {
      console.error(`Failed to fetch sector for ${ticker}:`, error);
      // Use fallback
    }

    // Get peers based on sector
    const peers = SECTOR_PEERS[sector] || SECTOR_PEERS['Technology'];

    // Remove the symbol itself if it's in the peers list
    const filteredPeers = peers.filter((p) => p !== ticker);

    return {
      symbol: ticker,
      sector,
      peers: filteredPeers,
    };
  } catch (error) {
    return {
      symbol: symbol.toUpperCase(),
      peers: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
