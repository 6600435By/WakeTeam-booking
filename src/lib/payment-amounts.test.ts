import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  amountsMatchDue,
  derivePaymentMethod,
  resolveMonetaryDue,
  roundMoney,
} from "./payment-amounts";

describe("payment-amounts", () => {
  it("derivePaymentMethod", () => {
    assert.equal(derivePaymentMethod(10, 0), "cash");
    assert.equal(derivePaymentMethod(0, 10), "card");
    assert.equal(derivePaymentMethod(5, 5), "split");
    assert.equal(derivePaymentMethod(0, 0), null);
  });

  it("amountsMatchDue", () => {
    assert.equal(amountsMatchDue(10, 5, 15), true);
    assert.equal(amountsMatchDue(10, 5, 14.5), false);
  });

  it("resolveMonetaryDue with membership is rental only", () => {
    const due = resolveMonetaryDue({
      service: { price: 60, durationMinutes: 30 },
      startAt: new Date("2026-07-28T10:00:00+03:00"),
      durationMinutes: 30,
      membershipId: "m1",
      rentalAmount: 15,
    });
    assert.equal(due, 15);
  });

  it("resolveMonetaryDue without membership uses service price", () => {
    const due = resolveMonetaryDue({
      service: { price: 60, durationMinutes: 30 },
      startAt: new Date("2026-07-28T10:00:00+03:00"),
      durationMinutes: 30,
      membershipId: null,
      rentalAmount: 0,
    });
    assert.equal(roundMoney(due), 60);
  });
});
