import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDateKey } from "@/lib/time";

/** Mirrors probe window sizing used by /api/public/slots/first-free. */
function dateKeysInRange(fromDate: string, maxDays: number): string[] {
  const keys: string[] = [];
  let cursor = fromDate;
  const capped = Math.max(1, Math.min(maxDays, 31));
  for (let i = 0; i < capped; i++) {
    keys.push(cursor);
    const d = new Date(cursor + "T12:00:00");
    d.setDate(d.getDate() + 1);
    cursor = formatDateKey(d);
  }
  return keys;
}

describe("first-free date window", () => {
  it("builds contiguous days from fromDate", () => {
    const keys = dateKeysInRange("2026-08-21", 3);
    assert.deepEqual(keys, ["2026-08-21", "2026-08-22", "2026-08-23"]);
  });

  it("caps maxDays at 31", () => {
    assert.equal(dateKeysInRange("2026-08-01", 100).length, 31);
  });
});
