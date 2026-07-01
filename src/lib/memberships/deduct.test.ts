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

  it("hasSufficientMembershipMinutes uses effective balance", () => {
    assert.equal(hasSufficientMembershipMinutes(100, 20, 80), true);
    assert.equal(hasSufficientMembershipMinutes(100, 20, 81), false);
    assert.equal(hasSufficientMembershipMinutes(50, 60, 1), false);
  });
});
