import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  JOURNAL_HIDDEN_STATUSES,
  getStatusDef,
  slotOccupancyStatusWhere,
} from "./appointment-status";

describe("appointment-status slot occupancy", () => {
  it("completed and no_show block slots until cancelled/deleted", () => {
    assert.equal(getStatusDef("completed").blocksSlot, true);
    assert.equal(getStatusDef("no_show").blocksSlot, true);
    assert.ok(ACTIVE_APPOINTMENT_STATUSES.includes("completed"));
    assert.ok(ACTIVE_APPOINTMENT_STATUSES.includes("no_show"));
  });

  it("cancelled and deleted do not block slots", () => {
    assert.equal(getStatusDef("cancelled").blocksSlot, false);
    assert.equal(getStatusDef("deleted").blocksSlot, false);
    assert.deepEqual([...JOURNAL_HIDDEN_STATUSES].sort(), [
      "cancelled",
      "deleted",
    ]);
  });

  it("slotOccupancyStatusWhere matches journal-visible statuses", () => {
    assert.deepEqual(slotOccupancyStatusWhere(), {
      notIn: ["deleted", "cancelled"],
    });
  });
});
