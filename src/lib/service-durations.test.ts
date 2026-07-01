import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookingDurationOptions,
  defaultAllowedDurationsForSlot,
  normalizeAllowedDurationsForSlot,
  parseAllowedDurations,
} from "./service-durations";

describe("service-durations", () => {
  it("parses allowed duration lists", () => {
    assert.deepEqual(parseAllowedDurations("10,30,60"), [10, 30, 60]);
    assert.deepEqual(parseAllowedDurations(" 30 , 60 "), [30, 60]);
  });

  it("lists booking options for slot size", () => {
    assert.deepEqual(bookingDurationOptions(10), [10, 30, 60]);
    assert.deepEqual(bookingDurationOptions(30), [30, 60]);
    assert.deepEqual(bookingDurationOptions(60), [60]);
  });

  it("normalizes allowed durations when slot changes", () => {
    assert.equal(
      normalizeAllowedDurationsForSlot("10,30,60", 30),
      "30,60",
    );
    assert.equal(
      normalizeAllowedDurationsForSlot("10,30", 60),
      "60",
    );
    assert.equal(defaultAllowedDurationsForSlot(30), "30,60");
  });
});
