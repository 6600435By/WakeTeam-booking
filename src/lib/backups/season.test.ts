import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBackupId, isBackupSeason, parseBackupId } from "./season";

describe("backup season helpers", () => {
  it("detects season months", () => {
    assert.equal(isBackupSeason(new Date("2026-07-15T00:00:00Z")), true);
    assert.equal(isBackupSeason(new Date("2026-12-01T00:00:00Z")), false);
  });

  it("formats and parses backup ids", () => {
    const id = formatBackupId(new Date("2026-07-05T03:00:00.000Z"));
    assert.equal(id, "2026-07-05T03-00-00-000Z");
    const parsed = parseBackupId(id);
    assert.ok(parsed);
    assert.equal(parsed?.getUTCFullYear(), 2026);
  });
});
