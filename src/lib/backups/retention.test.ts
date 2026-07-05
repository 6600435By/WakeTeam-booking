import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRetentionPolicy } from "./retention";

describe("getRetentionPolicy", () => {
  it("keeps 5 db copies when database is small", () => {
    const policy = getRetentionPolicy(50 * 1024 * 1024);
    assert.equal(policy.dbRetentionCount, 5);
    assert.equal(policy.filesRetentionCount, 2);
    assert.equal(policy.level, null);
  });

  it("reduces retention for medium database", () => {
    const policy = getRetentionPolicy(120 * 1024 * 1024);
    assert.equal(policy.dbRetentionCount, 3);
    assert.equal(policy.filesRetentionCount, 1);
    assert.equal(policy.level, "storage_medium");
    assert.ok(policy.message);
  });

  it("reduces retention for large database", () => {
    const policy = getRetentionPolicy(250 * 1024 * 1024);
    assert.equal(policy.dbRetentionCount, 2);
    assert.equal(policy.filesRetentionCount, 1);
    assert.equal(policy.level, "storage_high");
  });
});
