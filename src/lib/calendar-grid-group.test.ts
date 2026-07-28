import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupConsecutiveClientAppointments } from "./calendar-grid";

function appt(
  id: string,
  startMin: number,
  duration: number,
  phone = "291111111",
) {
  const start = new Date(`2026-07-28T10:00:00+03:00`);
  start.setMinutes(start.getMinutes() + startMin);
  const end = new Date(start.getTime() + duration * 60_000);
  return {
    id,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    durationMinutes: duration,
    status: "booked",
    client: { phone },
  };
}

describe("groupConsecutiveClientAppointments", () => {
  it("merges short equal wake cells", () => {
    const groups = groupConsecutiveClientAppointments([
      appt("a", 0, 10),
      appt("b", 10, 10),
      appt("c", 20, 10),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].appointments.length, 3);
    assert.equal(groups[0].durationMinutes, 30);
  });

  it("keeps payment-split longer segments separate", () => {
    const groups = groupConsecutiveClientAppointments([
      appt("a", 0, 35),
      appt("b", 35, 35),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].durationMinutes, 35);
    assert.equal(groups[1].durationMinutes, 35);
  });
});
