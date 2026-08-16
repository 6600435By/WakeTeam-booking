import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasSufficientMembershipMinutes,
  statusTriggersDeduction,
} from "./deduct";

describe("membership deduct helpers", () => {
  it("statusTriggersDeduction for in_service and completed", () => {
    assert.equal(statusTriggersDeduction("in_service"), true);
    assert.equal(statusTriggersDeduction("completed"), true);
    assert.equal(statusTriggersDeduction("booked"), false);
    assert.equal(statusTriggersDeduction("cancelled"), false);
  });

  it("hasSufficientMembershipMinutes uses sheet balance only", () => {
    assert.equal(hasSufficientMembershipMinutes(100, 80), true);
    assert.equal(hasSufficientMembershipMinutes(100, 101), false);
    // Local write-offs are informational and must not reduce the sheet gate.
    assert.equal(hasSufficientMembershipMinutes(50, 50), true);
    assert.equal(hasSufficientMembershipMinutes(0, 1), false);
  });
});
