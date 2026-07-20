import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePlannedReverseIds } from "./shift-planned-reverses";

describe("resolvePlannedReverseIds", () => {
  it("falls back to primary plannedStaffId when junction is empty", async () => {
    const db = {
      workShiftPlannedReverse: {
        findMany: async () => [],
      },
    };
    const ids = await resolvePlannedReverseIds(
      "shift-1",
      "rev-primary",
      db as never,
    );
    assert.deepEqual(ids, ["rev-primary"]);
  });

  it("prefers junction rows over legacy plannedStaffId", async () => {
    const db = {
      workShiftPlannedReverse: {
        findMany: async () => [{ staffId: "rev-a" }, { staffId: "rev-b" }],
      },
    };
    const ids = await resolvePlannedReverseIds(
      "shift-1",
      "rev-primary",
      db as never,
    );
    assert.deepEqual(ids, ["rev-a", "rev-b"]);
  });
});
