import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileLocalDeductedOnSheetChange } from "./sync";

describe("reconcileLocalDeductedOnSheetChange", () => {
  it("keeps local when sheet increases or is unchanged", () => {
    assert.equal(reconcileLocalDeductedOnSheetChange(70, 100, 50), 50);
    assert.equal(reconcileLocalDeductedOnSheetChange(80, 80, 25), 25);
  });

  it("reduces local when sheet decreases (sheet already reflects write-off)", () => {
    assert.equal(reconcileLocalDeductedOnSheetChange(100, 70, 50), 20);
    assert.equal(reconcileLocalDeductedOnSheetChange(100, 70, 20), 0);
    assert.equal(reconcileLocalDeductedOnSheetChange(100, 40, 30), 0);
  });
});
