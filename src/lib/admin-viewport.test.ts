import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAdminViewport } from "./admin-viewport";

describe("getAdminViewport", () => {
  it("classifies common widths", () => {
    assert.equal(getAdminViewport(390), "mobile");
    assert.equal(getAdminViewport(844), "tablet");
    assert.equal(getAdminViewport(1280), "desktop");
  });
});
