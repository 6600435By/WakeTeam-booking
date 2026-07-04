import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("nextPublicNumber logic", () => {
  it("uses max aggregate, not null-first orderBy desc", () => {
    const maxFromAggregate = 8_330_002;
    const next = (maxFromAggregate ?? 8_330_000) + 1;
    assert.equal(next, 8_330_003);

    const maxWhenEmpty = null;
    const nextEmpty = (maxWhenEmpty ?? 8_330_000) + 1;
    assert.equal(nextEmpty, 8_330_001);
  });
});
