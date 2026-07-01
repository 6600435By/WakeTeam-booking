import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { minPriceFromRules } from "./service-pricing";

describe("minPriceFromRules", () => {
  it("uses base price when there are no tariff rules", () => {
    assert.equal(minPriceFromRules({ price: 15, priceRules: [] }), 15);
    assert.equal(minPriceFromRules({ price: 20 }), 20);
  });

  it("returns minimum tariff price, ignoring fallback base price", () => {
    assert.equal(
      minPriceFromRules({
        price: 15,
        priceRules: [
          { weekdays: "1,2,3,4,5", timeFrom: "10:00", timeTo: "16:00", price: 25 },
          { weekdays: "1,2,3,4,5", timeFrom: "16:00", timeTo: "21:00", price: 30 },
          { weekdays: "6,7", timeFrom: "09:00", timeTo: "21:00", price: 30 },
        ],
      }),
      25,
    );
  });

  it("picks the cheapest rule across weekday bands", () => {
    assert.equal(
      minPriceFromRules({
        price: 15,
        priceRules: [
          { weekdays: "1,2,3,4,5", timeFrom: "09:00", timeTo: "16:00", price: 20 },
          { weekdays: "6,7", timeFrom: "09:00", timeTo: "21:00", price: 25 },
        ],
      }),
      20,
    );
  });
});
