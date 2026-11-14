import "server-only";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory sliding window rate limiter
const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Periodically purge expired rate limit keys to prevent memory leak
 */
if (typeof setInterval !== "undefined") {
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (record.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60 * 1000);
  interval.unref?.();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  error?: string;
}

/**
 * Checks and increments rate limit for an identifier (e.g. client IP, normalized phone, or composite key).
 * 
 * @param identifier Unique key to rate limit on
 * @param maxAttempts Max allowed attempts within the window (default: 5)
 * @param windowSeconds Window length in seconds (default: 60)
 */
export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowSeconds: number = 60
): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitStore.get(identifier);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetSeconds: windowSeconds,
    };
  }

  if (existing.count >= maxAttempts) {
    const resetSeconds = Math.ceil((existing.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetSeconds,
      error: `Too many submissions. Please wait ${resetSeconds} seconds before trying again.`,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: maxAttempts - existing.count,
    resetSeconds: Math.ceil((existing.resetAt - now) / 1000),
  };
}

