import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildShiftReadinessWarnings,
  type ReadinessResource,
  type ReadinessStaffShift,
} from "./shift-readiness";
import {
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
} from "@/lib/admin-roles";

const rev1: ReadinessResource = {
  id: "rev-1",
  name: "Реверс №1",
  kind: "revers",
  weekday: 1,
  scheduleToday: { isWorking: true, timeFrom: "10:00", timeTo: "22:00" },
};

const rev2: ReadinessResource = {
  id: "rev-2",
  name: "Реверс №2",
  kind: "revers",
  weekday: 1,
  scheduleToday: null,
};

function operatorShift(
  overrides: Partial<ReadinessStaffShift> & Pick<ReadinessStaffShift, "shiftId" | "memberId" | "memberName">,
): ReadinessStaffShift {
  return {
    role: BRANCH_OPERATOR_ROLE,
    status: "scheduled",
    plannedStart: "10:00",
    plannedEnd: "22:00",
    plannedStaffId: null,
    plannedStaffName: null,
    plannedStaffIds: [],
    plannedStaffNames: [],
    workAsAdmin: false,
    ...overrides,
  };
}

describe("buildShiftReadinessWarnings", () => {
  it("warns when operator has no reverse", () => {
    const staff = [operatorShift({ shiftId: "s1", memberId: "m1", memberName: "Иван" })];
    const warnings = buildShiftReadinessWarnings([rev1, rev2], staff);
    assert.equal(warnings.some((w) => w.code === "operator_no_reverse"), true);
  });

  it("warns when working reverse has no operator", () => {
    const warnings = buildShiftReadinessWarnings([rev1], []);
    assert.equal(warnings.some((w) => w.code === "reverse_unassigned"), true);
  });

  it("warns when reverse assigned but not working today", () => {
    const staff = [
      operatorShift({
        shiftId: "s1",
        memberId: "m1",
        memberName: "Иван",
        plannedStaffId: "rev-2",
        plannedStaffName: "Реверс №2",
        plannedStaffIds: ["rev-2"],
        plannedStaffNames: ["Реверс №2"],
      }),
    ];
    const warnings = buildShiftReadinessWarnings([rev1, rev2], staff);
    assert.equal(warnings.some((w) => w.code === "reverse_not_working"), true);
  });

  it("warns on duplicate reverse assignment overlap", () => {
    const staff = [
      operatorShift({
        shiftId: "s1",
        memberId: "m1",
        memberName: "Иван",
        plannedStart: "10:00",
        plannedEnd: "18:00",
        plannedStaffId: "rev-1",
        plannedStaffName: "Реверс №1",
        plannedStaffIds: ["rev-1"],
        plannedStaffNames: ["Реверс №1"],
      }),
      operatorShift({
        shiftId: "s2",
        memberId: "m2",
        memberName: "Пётр",
        plannedStart: "14:00",
        plannedEnd: "22:00",
        plannedStaffId: "rev-1",
        plannedStaffName: "Реверс №1",
        plannedStaffIds: ["rev-1"],
        plannedStaffNames: ["Реверс №1"],
      }),
    ];
    const warnings = buildShiftReadinessWarnings([rev1], staff);
    assert.equal(warnings.some((w) => w.code === "duplicate_reverse"), true);
  });

  it("allows one operator on multiple reverses without duplicate warning", () => {
    const staff = [
      operatorShift({
        shiftId: "s1",
        memberId: "m1",
        memberName: "Иван",
        plannedStaffId: "rev-1",
        plannedStaffName: "Реверс №1",
        plannedStaffIds: ["rev-1", "rev-2"],
        plannedStaffNames: ["Реверс №1", "Реверс №2"],
      }),
    ];
    const warnings = buildShiftReadinessWarnings([rev1, rev2], staff);
    assert.equal(warnings.some((w) => w.code === "duplicate_reverse"), false);
  });

  it("does not require reverse for branch manager on shift", () => {
    const staff: ReadinessStaffShift[] = [
      {
        shiftId: "s1",
        memberId: "m1",
        memberName: "Мария",
        role: BRANCH_MANAGER_ROLE,
        status: "scheduled",
        plannedStart: "10:00",
        plannedEnd: "22:00",
        plannedStaffId: null,
        plannedStaffName: null,
        plannedStaffIds: [],
        plannedStaffNames: [],
        workAsAdmin: false,
      },
    ];
    const warnings = buildShiftReadinessWarnings([rev1], staff);
    assert.equal(warnings.some((w) => w.code === "operator_no_reverse"), false);
  });
});
