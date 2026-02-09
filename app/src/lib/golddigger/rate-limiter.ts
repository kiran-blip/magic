import { NextRequest } from 'next/server';

interface TokenBucketConfig {
  tokensPerInterval: number;
  interval: number; // in milliseconds
  maxBurst?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

interface TokenBucket {
  tokens: number;
  lastRefillTime: number;
}

/**
 * In-memory rate limiter using token bucket algorithm
 * Stores per-IP token buckets with automatic expiration
 */
class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private config: TokenBucketConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: TokenBucketConfig) {
    this.config = {
      maxBurst: config.tokensPerInterval,
      ...config,
    };
    this.startCleanup();
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(req: NextRequest | { headers: Headers }): string {
    const forwardedFor = req.headers?.get?.('x-forwarded-for');
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    return req.headers?.get?.('x-real-ip') || '127.0.0.1';
  }

  /**
   * Check if request is allowed under rate limit
   */
  check(ip: string): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(ip);

    if (!bucket) {
      bucket = {
        tokens: this.config.tokensPerInterval,
        lastRefillTime: now,
      };
      this.buckets.set(ip, bucket);
    }

    // Refill tokens based on elapsed time
    const timePassed = now - bucket.lastRefillTime;
    const intervalsElapsed = timePassed / this.config.interval;
    const tokensToAdd = intervalsElapsed * this.config.tokensPerInterval;

    bucket.tokens = Math.min(
      this.config.maxBurst!,
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefillTime = now;

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
      };
    }

    // Calculate retry-after in seconds
    const retryAfterMs = (1 - bucket.tokens) * (this.config.interval / this.config.tokensPerInterval);
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

    return {
      allowed: false,
      remaining: 0,
      retryAfter: retryAfterSeconds,
    };
  }

  /**
   * Clean up old entries (older than 10 minutes)
   */
  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 10 * 60 * 1000; // 10 minutes

      for (const [ip, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefillTime > maxAge) {
          this.buckets.delete(ip);
        }
      }
    }, 5 * 60 * 1000); // Run cleanup every 5 minutes

    // Allow process to exit even if interval is running
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Destroy the rate limiter and cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buckets.clear();
  }
}

/**
 * Helper function to apply rate limiting to a request
 */
export function rateLimit(
  req: NextRequest | { headers: Headers },
  limiter: RateLimiter
): RateLimitResult {
  const ip = getClientIp(req);
  return limiter.check(ip);
}

/**
 * Extract client IP from request
 */
function getClientIp(req: NextRequest | { headers: Headers }): string {
  const forwardedFor = req.headers?.get?.('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.headers?.get?.('x-real-ip') || '127.0.0.1';
}

// Pre-configured limiters for different endpoint types

/**
 * Chat limiter: 10 requests per minute
 * Used for expensive AI/chat API calls
 */
export const chatLimiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: 60 * 1000, // 1 minute
  maxBurst: 10,
});

/**
 * General API limiter: 60 requests per minute
 * Used for standard API endpoints
 */
export const apiLimiter = new RateLimiter({
  tokensPerInterval: 60,
  interval: 60 * 1000, // 1 minute
  maxBurst: 60,
});

/**
 * Stream limiter: 5 concurrent connections per minute
 * Used for SSE (Server-Sent Events) and streaming endpoints
 */
export const streamLimiter = new RateLimiter({
  tokensPerInterval: 5,
  interval: 60 * 1000, // 1 minute
  maxBurst: 5,
});

// Export the RateLimiter class for custom configurations
export default RateLimiter;
