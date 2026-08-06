type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, max - 1), retryAfterMs: 0 };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - now),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, max - existing.count),
    retryAfterMs: 0,
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function clientIp(request: { ip?: string; headers: Record<string, unknown> | { [key: string]: unknown } }): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || request.ip || "unknown";
  }
  return request.ip || "unknown";
}
