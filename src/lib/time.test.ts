import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTimeOnDate, TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";

describe("parseTimeOnDate", () => {
  it("interprets wall time as Europe/Minsk regardless of host TZ", () => {
    const d = parseTimeOnDate("2026-04-12", "10:30");
    assert.equal(formatInTimeZone(d, TZ, "yyyy-MM-dd HH:mm"), "2026-04-12 10:30");
    assert.equal(d.toISOString(), "2026-04-12T07:30:00.000Z");
  });

  it("handles midnight boundary", () => {
    const d = parseTimeOnDate("2026-12-31", "00:00");
    assert.equal(formatInTimeZone(d, TZ, "yyyy-MM-dd HH:mm"), "2026-12-31 00:00");
  });
});
