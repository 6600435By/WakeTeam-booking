import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterMembershipsByServiceKind,
  membershipMatchesServiceKind,
} from "./service-categories";

describe("membershipMatchesServiceKind", () => {
  it("allows wake categories for wake service", () => {
    assert.equal(membershipMatchesServiceKind("Подарочный", "wake"), true);
    assert.equal(membershipMatchesServiceKind("Абонемент", "wake"), true);
    assert.equal(membershipMatchesServiceKind("САП Подарочный", "wake"), false);
  });

  it("allows only SAP gift category for sup service", () => {
    assert.equal(membershipMatchesServiceKind("САП Подарочный", "sup"), true);
    assert.equal(membershipMatchesServiceKind("сап подарочный", "sup"), true);
    assert.equal(membershipMatchesServiceKind("Подарочный", "sup"), false);
    assert.equal(membershipMatchesServiceKind("Абонемент", "sup"), false);
  });
});

describe("filterMembershipsByServiceKind", () => {
  it("filters list by service kind", () => {
    const rows = [
      { id: "1", category: "Абонемент" },
      { id: "2", category: "САП Подарочный" },
      { id: "3", category: "Подарочный" },
    ];
    assert.deepEqual(
      filterMembershipsByServiceKind(rows, "sup").map((r) => r.id),
      ["2"],
    );
    assert.deepEqual(
      filterMembershipsByServiceKind(rows, "wake").map((r) => r.id),
      ["1", "3"],
    );
  });
});
