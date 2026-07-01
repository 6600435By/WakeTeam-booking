import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSaleDate } from "./parse-csv";

function ymd(d: Date | null) {
  if (!d) return null;
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

describe("parseSaleDate", () => {
  it("parses DD.MM.YYYY as day-month-year", () => {
    assert.deepEqual(ymd(parseSaleDate("12.04.2026")), { y: 2026, m: 4, d: 12 });
    assert.deepEqual(ymd(parseSaleDate("04.12.2026")), { y: 2026, m: 12, d: 4 });
  });

  it("parses DD/MM/YYYY with slashes", () => {
    assert.deepEqual(ymd(parseSaleDate("12/04/2026")), { y: 2026, m: 4, d: 12 });
  });

  it("parses ISO YYYY-MM-DD", () => {
    assert.deepEqual(ymd(parseSaleDate("2026-04-12")), { y: 2026, m: 4, d: 12 });
  });

  it("rejects invalid calendar dates", () => {
    assert.equal(parseSaleDate("31.02.2026"), null);
    assert.equal(parseSaleDate("32.01.2026"), null);
  });

  it("rejects empty and garbage input", () => {
    assert.equal(parseSaleDate(""), null);
    assert.equal(parseSaleDate("  "), null);
    assert.equal(parseSaleDate("Q34"), null);
  });

  it("does not use ambiguous new Date() for dotted dates", () => {
    // Раньше `new Date("12.04.2026")` давал 4 декабря
    assert.deepEqual(ymd(parseSaleDate("12.04.2026")), { y: 2026, m: 4, d: 12 });
  });

  it("parses Google Sheets serial numbers", () => {
    // 12 Apr 2026 ≈ serial 46124 (Google epoch 1899-12-30)
    const d = parseSaleDate("46124");
    assert.ok(d);
    assert.equal(d!.getUTCFullYear(), 2026);
    assert.equal(d!.getUTCMonth(), 3);
    assert.equal(d!.getUTCDate(), 12);
  });

  it("parses full ISO datetime", () => {
    assert.deepEqual(ymd(parseSaleDate("2026-04-12T10:30:00.000Z")), { y: 2026, m: 4, d: 12 });
  });
});
