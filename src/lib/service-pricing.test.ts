import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  minPriceFromRules,
  resolveServicePrice,
  resolveWakeCellsPrice,
  rulePriceForDuration,
} from "./service-pricing";

const dayRule = {
  weekdays: "1,2,3,4,5",
  timeFrom: "10:00",
  timeTo: "16:00",
  price: 15,
  pricesByDuration: { 10: 15, 30: 45, 60: 75 },
};

const eveningRule = {
  weekdays: "1,2,3,4,5",
  timeFrom: "16:00",
  timeTo: "21:00",
  price: 30,
  pricesByDuration: { 10: 30, 30: 90, 60: 130 },
};

const wakeService = {
  price: 15,
  durationMinutes: 10,
  priceRules: [dayRule, eveningRule],
};

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

  it("uses explicit per-duration prices when configured", () => {
    assert.equal(
      minPriceFromRules({
        price: 30,
        durationMinutes: 60,
        allowedDurations: "30,60",
        priceRules: [
          {
            weekdays: "1,2,3,4,5,6,7",
            timeFrom: "09:00",
            timeTo: "21:00",
            price: 30,
            pricesByDuration: { 30: 20, 60: 30 },
          },
        ],
      }),
      20,
    );
  });
});

describe("resolveServicePrice", () => {
  it("returns explicit duration price from tariff rule", () => {
    const startAt = new Date("2026-07-03T10:30:00+03:00");
    assert.equal(
      resolveServicePrice(
        {
          price: 30,
          durationMinutes: 60,
          priceRules: [
            {
              weekdays: "1,2,3,4,5,6,7",
              timeFrom: "09:00",
              timeTo: "21:00",
              price: 30,
              pricesByDuration: { 30: 20, 60: 30 },
            },
          ],
        },
        startAt,
        30,
      ),
      20,
    );
  });

  it("uses 60-min package for exactly 60 minutes (not 6×10)", () => {
    const startAt = new Date("2026-08-12T10:00:00+03:00");
    assert.equal(resolveServicePrice(wakeService, startAt, 60), 75);
    assert.notEqual(resolveServicePrice(wakeService, startAt, 60), 90);
  });

  it("prices 90 minutes from 60-min per-minute rate", () => {
    const startAt = new Date("2026-08-12T10:00:00+03:00");
    assert.equal(resolveServicePrice(wakeService, startAt, 90), 112.5);
    const evening = new Date("2026-08-12T16:00:00+03:00");
    assert.equal(resolveServicePrice(wakeService, evening, 90), 195);
  });
});

describe("rulePriceForDuration", () => {
  it("keeps exact 10/30/60 packages", () => {
    assert.equal(rulePriceForDuration(dayRule, 10, 10), 15);
    assert.equal(rulePriceForDuration(dayRule, 10, 30), 45);
    assert.equal(rulePriceForDuration(dayRule, 10, 60), 75);
  });
});

describe("resolveWakeCellsPrice", () => {
  function startsFrom(iso: string, count: number, stepMin = 10): Date[] {
    const base = new Date(iso).getTime();
    return Array.from(
      { length: count },
      (_, i) => new Date(base + i * stepMin * 60_000),
    );
  }

  it("prices 6 contiguous day cells as 60-min package (75, not 90)", () => {
    const starts = startsFrom("2026-08-12T10:00:00+03:00", 6);
    const priced = resolveWakeCellsPrice(wakeService, starts, 10);
    assert.equal(priced.total, 75);
    assert.equal(
      Math.round(priced.prices.reduce((s, p) => s + p, 0) * 100) / 100,
      75,
    );
  });

  it("prices 3 contiguous cells as 30-min package", () => {
    const starts = startsFrom("2026-08-12T10:00:00+03:00", 3);
    assert.equal(resolveWakeCellsPrice(wakeService, starts, 10).total, 45);
  });

  it("prices single cell as 10-min tariff", () => {
    const starts = startsFrom("2026-08-12T10:00:00+03:00", 1);
    assert.equal(resolveWakeCellsPrice(wakeService, starts, 10).total, 15);
  });

  it("prices evening 60-min block as 130", () => {
    const starts = startsFrom("2026-08-12T16:00:00+03:00", 6);
    assert.equal(resolveWakeCellsPrice(wakeService, starts, 10).total, 130);
  });

  it("prices 90 minutes from 60-min rate", () => {
    const starts = startsFrom("2026-08-12T10:00:00+03:00", 9);
    assert.equal(resolveWakeCellsPrice(wakeService, starts, 10).total, 112.5);
  });

  it("prices non-contiguous blocks separately", () => {
    const a = startsFrom("2026-08-12T10:00:00+03:00", 3);
    const b = startsFrom("2026-08-12T12:00:00+03:00", 3);
    assert.equal(resolveWakeCellsPrice(wakeService, [...a, ...b], 10).total, 90);
  });
});
