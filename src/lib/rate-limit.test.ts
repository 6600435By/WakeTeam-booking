import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  _resetRateLimitStoreForTests,
  checkRateLimit,
  clientIpFromHeaders,
} from "./rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    _resetRateLimitStoreForTests();
  });

  it("allows requests under the limit", () => {
    for (let i = 0; i < 5; i++) {
      assert.equal(checkRateLimit("login", "1.2.3.4").ok, true);
    }
  });

  it("blocks after exceeding the limit", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("login", "1.2.3.4");
    }
    const blocked = checkRateLimit("login", "1.2.3.4");
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.retryAfterSec >= 1);
    }
  });

  it("tracks buckets separately", () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit("login", "1.2.3.4");
    }
    assert.equal(checkRateLimit("login", "1.2.3.4").ok, false);
    assert.equal(checkRateLimit("public_read", "1.2.3.4").ok, true);
  });

  it("extracts first forwarded IP", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.1, 10.0.0.1",
    });
    assert.equal(clientIpFromHeaders(headers), "203.0.113.1");
  });
});
