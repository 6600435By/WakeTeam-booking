import { NextResponse } from "next/server";

type Bucket = "login" | "public_write" | "public_read";

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

const DEFAULTS: Record<Bucket, { limit: number; windowMs: number }> = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  public_write: { limit: 15, windowMs: 15 * 60_000 },
  public_read: { limit: 120, windowMs: 60_000 },
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bucketConfig(bucket: Bucket) {
  const base = DEFAULTS[bucket];
  if (bucket === "login") {
    return {
      limit: envInt("RATE_LIMIT_LOGIN_MAX", base.limit),
      windowMs: envInt("RATE_LIMIT_LOGIN_WINDOW_MS", base.windowMs),
    };
  }
  if (bucket === "public_write") {
    return {
      limit: envInt("RATE_LIMIT_PUBLIC_WRITE_MAX", base.limit),
      windowMs: envInt("RATE_LIMIT_PUBLIC_WRITE_WINDOW_MS", base.windowMs),
    };
  }
  return {
    limit: envInt("RATE_LIMIT_PUBLIC_READ_MAX", base.limit),
    windowMs: envInt("RATE_LIMIT_PUBLIC_READ_WINDOW_MS", base.windowMs),
  };
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function checkRateLimit(
  bucket: Bucket,
  clientKey: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const { limit, windowMs } = bucketConfig(bucket);
  const key = `${bucket}:${clientKey}`;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count += 1;

  if (entry.count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  return { ok: true };
}

export function rateLimitResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Слишком много запросов. Повторите позже." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

/** @internal test helper */
export function _resetRateLimitStoreForTests() {
  store.clear();
}
