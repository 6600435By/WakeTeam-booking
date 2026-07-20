import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcPanelMinutes, calcInServicePanelMinutes } from "./panel-time";

const shiftMemberId = "op-1";
const shiftStart = new Date("2026-07-03T07:00:00.000Z");
const shiftEnd = new Date("2026-07-03T18:00:00.000Z");
const assignment = {
  id: "a1",
  shiftId: "s1",
  staffId: "rev-1",
  startedAt: shiftStart,
  endedAt: null,
};
const allDayAssignments = [
  {
    ...assignment,
    shift: { memberId: shiftMemberId },
  },
];

describe("calcPanelMinutes", () => {
  it("counts only completed appointments for shift operator", () => {
    const minutes = calcPanelMinutes(
      shiftMemberId,
      [assignment],
      [
        {
          staffId: "rev-1",
          startAt: new Date("2026-07-03T09:00:00.000Z"),
          endAt: new Date("2026-07-03T10:00:00.000Z"),
          status: "completed",
          operatorMemberId: null,
        },
        {
          staffId: "rev-1",
          startAt: new Date("2026-07-03T10:00:00.000Z"),
          endAt: new Date("2026-07-03T11:00:00.000Z"),
          status: "in_service",
          operatorMemberId: null,
        },
        {
          staffId: "rev-1",
          startAt: new Date("2026-07-03T11:00:00.000Z"),
          endAt: new Date("2026-07-03T12:00:00.000Z"),
          status: "booked",
          operatorMemberId: null,
        },
      ],
      allDayAssignments,
      shiftStart,
      shiftEnd,
    );
    assert.equal(minutes, 60);
  });

  it("credits explicit operator override to pinned member", () => {
    const minutes = calcPanelMinutes(
      "op-2",
      [],
      [
        {
          staffId: "rev-1",
          startAt: new Date("2026-07-03T09:00:00.000Z"),
          endAt: new Date("2026-07-03T10:00:00.000Z"),
          status: "completed",
          operatorMemberId: "op-2",
        },
      ],
      [
        {
          id: "a2",
          shiftId: "s2",
          staffId: "rev-1",
          startedAt: shiftStart,
          endedAt: null,
          shift: { memberId: "op-1" },
        },
      ],
      shiftStart,
      shiftEnd,
    );
    assert.equal(minutes, 60);
  });

  it("credits pinned operator with no reverse assignments on their shift", () => {
    const minutes = calcPanelMinutes(
      "op-2",
      [],
      [
        {
          staffId: "rev-9",
          startAt: new Date("2026-07-03T09:00:00.000Z"),
          endAt: new Date("2026-07-03T10:30:00.000Z"),
          status: "completed",
          operatorMemberId: "op-2",
        },
      ],
      [],
      shiftStart,
      shiftEnd,
    );
    assert.equal(minutes, 90);
  });

  it("counts appointments on all active reverse assignments of the shift", () => {
    const multi = [
      {
        id: "a1",
        shiftId: "s1",
        staffId: "rev-1",
        startedAt: shiftStart,
        endedAt: null,
      },
      {
        id: "a2",
        shiftId: "s1",
        staffId: "rev-2",
        startedAt: shiftStart,
        endedAt: null,
      },
    ];
    const minutes = calcPanelMinutes(
      shiftMemberId,
      multi,
      [
        {
          staffId: "rev-1",
          startAt: new Date("2026-07-03T09:00:00.000Z"),
          endAt: new Date("2026-07-03T09:30:00.000Z"),
          status: "completed",
          operatorMemberId: null,
        },
        {
          staffId: "rev-2",
          startAt: new Date("2026-07-03T10:00:00.000Z"),
          endAt: new Date("2026-07-03T10:45:00.000Z"),
          status: "completed",
          operatorMemberId: null,
        },
      ],
      multi.map((a) => ({ ...a, shift: { memberId: shiftMemberId } })),
      shiftStart,
      shiftEnd,
    );
    assert.equal(minutes, 75);
  });

  it("does not credit appointment to wrong operator after swap", () => {
    const swapAssignments = [
      {
        id: "a1",
        shiftId: "s1",
        staffId: "rev-1",
        startedAt: new Date("2026-07-03T07:00:00.000Z"),
        endedAt: new Date("2026-07-03T12:00:00.000Z"),
        shift: { memberId: "op-1" },
      },
      {
        id: "a2",
        shiftId: "s2",
        staffId: "rev-1",
        startedAt: new Date("2026-07-03T12:00:00.000Z"),
        endedAt: null,
        shift: { memberId: "op-2" },
      },
    ];
    const appt = {
      staffId: "rev-1",
      startAt: new Date("2026-07-03T13:00:00.000Z"),
      endAt: new Date("2026-07-03T14:00:00.000Z"),
      status: "completed",
      operatorMemberId: null,
    };

    const op1 = calcPanelMinutes(
      "op-1",
      [swapAssignments[0]],
      [appt],
      swapAssignments,
      shiftStart,
      shiftEnd,
    );
    const op2 = calcPanelMinutes(
      "op-2",
      [swapAssignments[1]],
      [appt],
      swapAssignments,
      shiftStart,
      shiftEnd,
    );
    assert.equal(op1, 0);
    assert.equal(op2, 60);
  });
});

describe("calcInServicePanelMinutes", () => {
  it("counts in_service for preview only", () => {
    const minutes = calcInServicePanelMinutes(
      shiftMemberId,
      [assignment],
      [
        {
          staffId: "rev-1",
          startAt: new Date("2026-07-03T09:00:00.000Z"),
          endAt: new Date("2026-07-03T10:00:00.000Z"),
          status: "in_service",
          operatorMemberId: null,
        },
      ],
      allDayAssignments,
      new Date("2026-07-03T07:00:00.000Z"),
      new Date("2026-07-03T18:00:00.000Z"),
    );
    assert.equal(minutes, 60);
  });
});
