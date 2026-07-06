import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcEfficiencyPercent,
  calcIdleSharePercent,
  buildEfficiencyMetrics,
} from "./efficiency";

describe("efficiency metrics", () => {
  it("calculates productive share", () => {
    assert.equal(calcEfficiencyPercent(480, 300, 60), 75);
  });

  it("returns null for zero shift minutes", () => {
    assert.equal(calcEfficiencyPercent(0, 10, 10), null);
  });

  it("calculates idle share", () => {
    assert.equal(calcIdleSharePercent(480, 120), 25);
  });

  it("builds combined metrics", () => {
    const m = buildEfficiencyMetrics(600, 400, 100, 100);
    assert.equal(m.efficiencyPercent, 83);
    assert.equal(m.idleSharePercent, 17);
  });
});
