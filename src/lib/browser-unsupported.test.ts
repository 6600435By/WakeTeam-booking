import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isChromiumFamilyUserAgent,
  isUnsupportedSafariUserAgent,
  parseSafariVersion,
} from "./browser-unsupported";

describe("browser unsupported detection", () => {
  it("detects old Safari versions", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Safari/605.1.15";
    assert.equal(isUnsupportedSafariUserAgent(ua), true);
    assert.deepEqual(parseSafariVersion(ua), { major: 15, minor: 6 });
  });

  it("allows Safari 16.4+", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15";
    assert.equal(isUnsupportedSafariUserAgent(ua), false);
  });

  it("does not flag Chrome on Mac as Safari", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    assert.equal(isChromiumFamilyUserAgent(ua), true);
    assert.equal(isUnsupportedSafariUserAgent(ua), false);
  });

  it("does not flag Firefox", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:115.0) Gecko/20100101 Firefox/115.0";
    assert.equal(isUnsupportedSafariUserAgent(ua), false);
  });
});
