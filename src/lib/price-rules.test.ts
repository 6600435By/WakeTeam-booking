import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";
import {
  hydratePriceRules,
  mapPriceRuleToApi,
  type PriceRuleRow,
} from "@/lib/price-rules";

function sampleRule(
  pricesByDuration: PriceRuleRow["pricesByDuration"],
): PriceRuleRow {
  return {
    id: "rule-1",
    weekdays: "1,2,3,4,5",
    timeFrom: "10:00",
    timeTo: "16:00",
    price: 15,
    sortOrder: 1,
    pricesByDuration,
  };
}

describe("hydratePriceRules", () => {
  it("parses JSON string pricesByDuration from API (save response)", () => {
    const hydrated = hydratePriceRules([
      {
        id: "r1",
        weekdays: "1,2,3,4,5",
        timeFrom: "10:00",
        timeTo: "16:00",
        price: 15,
        sortOrder: 1,
        pricesByDuration: JSON.stringify({ 10: 15, 30: 45, 60: 75 }),
      },
    ]);

    assert.deepEqual(hydrated[0]?.pricesByDuration, {
      10: 15,
      30: 45,
      60: 75,
    });
    assert.equal(hydrated[0]?.pricesByDuration?.[10], 15);
    assert.equal(hydrated[0]?.pricesByDuration?.[30], 45);
    assert.equal(hydrated[0]?.pricesByDuration?.[60], 75);
  });

  it("does not treat string as indexed chars (regression for post-save UI)", () => {
    const json = JSON.stringify({ 10: 15, 30: 45, 60: 75 });
    // Bug symptom: string[10] is a single character, not tariff 15
    assert.notEqual((json as unknown as Record<number, string>)[10], 15);

    const hydrated = hydratePriceRules([
      {
        id: "r1",
        weekdays: "1,2,3,4,5",
        timeFrom: "10:00",
        timeTo: "16:00",
        price: 15,
        sortOrder: 1,
        pricesByDuration: json,
      },
    ]);
    assert.equal(hydrated[0]?.pricesByDuration?.[10], 15);
    assert.notEqual(String(hydrated[0]?.pricesByDuration?.[10]).length, 1);
  });

  it("keeps object pricesByDuration and normalizes string keys", () => {
    const hydrated = hydratePriceRules([
      {
        id: "r1",
        weekdays: "6,7,8",
        timeFrom: "09:00",
        timeTo: "21:00",
        price: 30,
        sortOrder: 1,
        pricesByDuration: { "10": 30, "30": 90, "60": 130 } as unknown as Record<
          number,
          number
        >,
      },
    ]);

    assert.deepEqual(hydrated[0]?.pricesByDuration, {
      10: 30,
      30: 90,
      60: 130,
    });
  });

  it("round-trips through mapPriceRuleToApi without changing tariffs", () => {
    const original = sampleRule({ 10: 15, 30: 45, 60: 75 });
    const api = mapPriceRuleToApi(original, 10);
    const hydrated = hydratePriceRules([
      {
        id: original.id,
        weekdays: api.weekdays,
        timeFrom: api.timeFrom,
        timeTo: api.timeTo,
        price: api.price,
        sortOrder: api.sortOrder,
        pricesByDuration: api.pricesByDuration,
      },
    ]);

    assert.deepEqual(hydrated[0]?.pricesByDuration, original.pricesByDuration);
    assert.equal(hydrated[0]?.price, 15);
  });

  it("handles empty / missing pricesByDuration", () => {
    assert.deepEqual(
      hydratePriceRules([
        {
          id: "r1",
          weekdays: "1",
          timeFrom: "10:00",
          timeTo: "12:00",
          price: 20,
          sortOrder: 1,
          pricesByDuration: null,
        },
      ])[0]?.pricesByDuration,
      undefined,
    );
    assert.deepEqual(hydratePriceRules(undefined), []);
  });
});

describe("hydratePriceRules performance", () => {
  it("hydrates a large admin payload in well under 5ms", () => {
    const rules = Array.from({ length: 50 }, (_, i) => ({
      id: `r${i}`,
      weekdays: "1,2,3,4,5",
      timeFrom: "10:00",
      timeTo: "21:00",
      price: 15 + i,
      sortOrder: i + 1,
      pricesByDuration: JSON.stringify({
        10: 15 + i,
        30: 45 + i,
        60: 75 + i,
      }),
    }));

    // warm-up
    hydratePriceRules(rules);

    const start = performance.now();
    for (let i = 0; i < 200; i++) hydratePriceRules(rules);
    const elapsed = performance.now() - start;
    const perCall = elapsed / 200;

    assert.ok(
      perCall < 5,
      `hydratePriceRules averaged ${perCall.toFixed(3)}ms (>5ms)`,
    );
  });
});
