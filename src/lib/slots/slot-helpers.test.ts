import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWeekdays, serviceAllowedOnDate, subtractBreaks } from "./slot-helpers";
import { parseTimeOnDate } from "@/lib/time";

describe("slot-helpers", () => {
  it("parseWeekdays", () => {
    assert.deepEqual([...parseWeekdays("1,3,5")].sort(), [1, 3, 5]);
  });

  it("serviceAllowedOnDate respects weekday", () => {
    // 2026-04-13 is Monday (weekday 1 in Minsk helper)
    assert.equal(serviceAllowedOnDate({ weekdays: "1,2,3,4,5,6,7" }, "2026-04-13"), true);
    assert.equal(serviceAllowedOnDate({ weekdays: "7" }, "2026-04-13"), false);
  });

  it("subtractBreaks splits interval around break", () => {
    const date = "2026-04-12";
    const from = parseTimeOnDate(date, "09:00");
    const to = parseTimeOnDate(date, "12:00");
    const parts = subtractBreaks(from, to, [{ timeFrom: "10:00", timeTo: "10:30" }], date);
    assert.equal(parts.length, 2);
    assert.equal(parts[0].from.toISOString(), parseTimeOnDate(date, "09:00").toISOString());
    assert.equal(parts[0].to.toISOString(), parseTimeOnDate(date, "10:00").toISOString());
    assert.equal(parts[1].from.toISOString(), parseTimeOnDate(date, "10:30").toISOString());
    assert.equal(parts[1].to.toISOString(), parseTimeOnDate(date, "12:00").toISOString());
  });
});
