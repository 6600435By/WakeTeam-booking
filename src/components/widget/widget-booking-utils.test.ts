import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatTariffLine,
  formatTariffWeekdaysLabel,
  shouldShowWidgetTariffs,
  widgetTariffRulesForService,
} from "./widget-booking-utils";

describe("formatTariffWeekdaysLabel", () => {
  it("returns null for all weekdays", () => {
    assert.equal(formatTariffWeekdaysLabel("1,2,3,4,5,6,7"), null);
  });

  it("formats weekdays and weekend bands", () => {
    assert.equal(formatTariffWeekdaysLabel("1,2,3,4,5"), "Пн–Пт");
    assert.equal(formatTariffWeekdaysLabel("6,7"), "Сб–Вс");
  });
});

describe("formatTariffLine", () => {
  it("omits day prefix when tariff applies every day", () => {
    assert.equal(
      formatTariffLine(
        { weekdays: "1,2,3,4,5,6,7", timeFrom: "09:00", timeTo: "21:00", price: 30 },
        60,
      ),
      "09:00–21:00: 60 мин — 30 Br",
    );
  });

  it("shows explicit prices per booking duration", () => {
    assert.equal(
      formatTariffLine(
        {
          weekdays: "1,2,3,4,5,6,7",
          timeFrom: "09:00",
          timeTo: "21:00",
          price: 30,
          pricesByDuration: { 30: 20, 60: 30 },
        },
        60,
        [30, 60],
      ),
      "09:00–21:00: 30 мин — 20 Br, 60 мин — 30 Br",
    );
  });

  it("keeps readable prefixes for weekday bands", () => {
    assert.equal(
      formatTariffLine(
        { weekdays: "1,2,3,4,5", timeFrom: "10:00", timeTo: "16:00", price: 25 },
        60,
      ),
      "Пн–Пт 10:00–16:00: 60 мин — 25 Br",
    );
  });
});

describe("widget tariffs visibility", () => {
  it("shows tariffs when multiple booking durations are enabled", () => {
    assert.equal(
      shouldShowWidgetTariffs({
        allowedDurations: "30,60",
        durationMinutes: 30,
        priceRules: [],
      }),
      true,
    );
  });

  it("builds fallback tariff lines from base price", () => {
    const rules = widgetTariffRulesForService({
      price: 30,
      durationMinutes: 30,
      allowedDurations: "30,60",
      priceRules: [],
      bookableFrom: "09:00",
      bookableTo: "21:00",
    });
    assert.equal(rules.length, 1);
    assert.equal(rules[0]?.pricesByDuration?.[30], 30);
    assert.equal(rules[0]?.pricesByDuration?.[60], 60);
  });
});
