import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCalendarAnchorDateKey } from "./calendar-ui";

describe("resolveCalendarAnchorDateKey", () => {
  it("uses value when valid", () => {
    assert.equal(resolveCalendarAnchorDateKey("2026-07-15"), "2026-07-15");
  });

  it("falls back to today for empty value", () => {
    const anchor = resolveCalendarAnchorDateKey("");
    assert.match(anchor, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("prefers viewDate over value", () => {
    assert.equal(
      resolveCalendarAnchorDateKey("2026-01-01", "2026-12-25"),
      "2026-12-25",
    );
  });
});
