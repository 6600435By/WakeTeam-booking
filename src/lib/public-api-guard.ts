import type { NextRequest } from "next/server";
import {
  checkRateLimit,
  clientIpFromHeaders,
  rateLimitResponse,
} from "@/lib/rate-limit";

export function enforcePublicReadLimit(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  const result = checkRateLimit("public_read", ip);
  if (!result.ok) return rateLimitResponse(result.retryAfterSec);
  return null;
}

export function enforcePublicWriteLimit(req: NextRequest) {
  const ip = clientIpFromHeaders(req.headers);
  const result = checkRateLimit("public_write", ip);
  if (!result.ok) return rateLimitResponse(result.retryAfterSec);
  return null;
}

export function enforceLoginLimit(headers: Headers) {
  const ip = clientIpFromHeaders(headers);
  const result = checkRateLimit("login", ip);
  if (!result.ok) {
    return { blocked: true as const, retryAfterSec: result.retryAfterSec };
  }
  return { blocked: false as const };
}
