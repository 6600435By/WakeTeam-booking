import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCompletePhone,
  isBelarusPhoneDigits,
  normalizePhone,
  phonesMatch,
  phoneStoredVariants,
  phoneMatchesSearch,
} from "./phone";

describe("normalizePhone", () => {
  it("canonicalizes Belarus numbers to +375XXXXXXXXX", () => {
    assert.equal(normalizePhone("291234567"), "+375291234567");
    assert.equal(normalizePhone("80291234567"), "+375291234567");
    assert.equal(normalizePhone("+375291234567"), "+375291234567");
    assert.equal(normalizePhone("375291234567"), "+375291234567");
    assert.equal(normalizePhone("+375 29 123-45-67"), "+375291234567");
  });

  it("keeps foreign E.164 without forcing +375", () => {
    assert.equal(normalizePhone("+79001234567"), "+79001234567");
    assert.equal(normalizePhone("79001234567"), "+79001234567");
    assert.equal(normalizePhone("+48 512 345 678"), "+48512345678");
    assert.equal(normalizePhone("+37061234567"), "+37061234567");
  });
});

describe("isCompletePhone", () => {
  it("accepts complete BY and foreign numbers", () => {
    assert.equal(isCompletePhone("291234567"), true);
    assert.equal(isCompletePhone("+375291234567"), true);
    assert.equal(isCompletePhone("+79001234567"), true);
    assert.equal(isCompletePhone("+48512345678"), true);
  });

  it("rejects incomplete numbers", () => {
    assert.equal(isCompletePhone("+375"), false);
    assert.equal(isCompletePhone("29123"), false);
    assert.equal(isCompletePhone("+7"), false);
    assert.equal(isCompletePhone(""), false);
  });
});

describe("isBelarusPhoneDigits", () => {
  it("detects BY heuristics", () => {
    assert.equal(isBelarusPhoneDigits("291234567"), true);
    assert.equal(isBelarusPhoneDigits("80291234567"), true);
    assert.equal(isBelarusPhoneDigits("375291234567"), true);
    assert.equal(isBelarusPhoneDigits("79001234567"), false);
  });
});

describe("phonesMatch", () => {
  it("matches BY formats", () => {
    assert.equal(phonesMatch("291234567", "+375291234567"), true);
    assert.equal(phonesMatch("80291234567", "375291234567"), true);
  });

  it("matches foreign by full digits", () => {
    assert.equal(phonesMatch("+79001234567", "79001234567"), true);
    assert.equal(phonesMatch("+79001234567", "+375900123456"), false);
  });

  it("does not match BY national suffix against foreign", () => {
    // last 9 of +79001234567 would be 001234567 — must not equal a BY number
    assert.equal(phonesMatch("+79001234567", "+375001234567"), false);
  });
});

describe("phoneStoredVariants", () => {
  it("includes BY legacy forms", () => {
    const v = phoneStoredVariants("291234567");
    assert.ok(v.includes("+375291234567"));
    assert.ok(v.includes("80291234567"));
  });

  it("includes foreign canonical only (no fake +375)", () => {
    const v = phoneStoredVariants("+79001234567");
    assert.ok(v.includes("+79001234567"));
    assert.ok(v.includes("79001234567"));
    assert.ok(!v.some((x) => x.includes("3757900") || x.startsWith("+3759")));
  });
});

describe("phoneMatchesSearch", () => {
  it("matches BY by suffix", () => {
    assert.equal(phoneMatchesSearch("1234567", "+375291234567"), true);
  });

  it("matches foreign full number", () => {
    assert.equal(phoneMatchesSearch("+79001234567", "+79001234567"), true);
  });
});
