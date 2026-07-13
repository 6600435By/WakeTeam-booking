import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBranchOpenLabel, type BranchShiftStatus } from "./branch-shift-status.shared";

function status(openShifts: BranchShiftStatus["openShifts"]): BranchShiftStatus {
  return {
    branchId: "b1",
    date: "2026-07-13",
    isOpen: openShifts.length > 0,
    openCount: openShifts.length,
    openShifts,
    scheduledCount: 0,
  };
}

describe("formatBranchOpenLabel", () => {
  it("returns empty string when branch is closed", () => {
    assert.equal(formatBranchOpenLabel(status([])), "");
  });

  it("formats one opener", () => {
    assert.equal(
      formatBranchOpenLabel(
        status([
          {
            shiftId: "s1",
            memberId: "m1",
            memberName: "Иванов",
            actualStart: null,
            workAsAdmin: false,
          },
        ]),
      ),
      "Иванов",
    );
  });

  it("formats two openers", () => {
    assert.equal(
      formatBranchOpenLabel(
        status([
          {
            shiftId: "s1",
            memberId: "m1",
            memberName: "Иванов",
            actualStart: null,
            workAsAdmin: false,
          },
          {
            shiftId: "s2",
            memberId: "m2",
            memberName: "Петров",
            actualStart: null,
            workAsAdmin: false,
          },
        ]),
      ),
      "Иванов и Петров",
    );
  });
});
