import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dedupeRubitimeClients,
  mapRubitimeClientName,
  parseRubitimeClientsTsv,
} from "./parse-rubitime-export";

describe("parse-rubitime-export", () => {
  it("parses tab-separated Rubitime export", () => {
    const tsv = [
      "#\tДата создания\tИмя\tФамилия\tОтчество\tТелефон\tEmail",
      "1\t01.01.2024\tИван\tИванов\t\t375291111111\tivan@test.by",
    ].join("\n");
    const rows = parseRubitimeClientsTsv(tsv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].firstName, "Иван");
    assert.equal(rows[0].lastName, "Иванов");
    assert.equal(rows[0].phone, "375291111111");
  });

  it("maps swapped name columns when Имя is empty", () => {
    const mapped = mapRubitimeClientName({
      Имя: "",
      Фамилия: "Александр",
      Отчество: "Гираевский",
    });
    assert.equal(mapped.firstName, "Александр");
    assert.equal(mapped.lastName, "Гираевский");
  });

  it("parses Mac-style \\r line endings", () => {
    const tsv = "#\tТелефон\r1\t375291111111\r2\t375292222222";
    const rows = parseRubitimeClientsTsv(tsv);
    assert.equal(rows.length, 2);
  });

  it("dedupes by normalized phone", () => {
    const rows = dedupeRubitimeClients([
      {
        externalId: "1",
        createdAt: null,
        firstName: "A",
        lastName: null,
        phone: "375291111111",
        email: null,
        blacklisted: false,
        source: null,
        appointmentCount: 1,
        totalAmount: 10,
        notes: null,
      },
      {
        externalId: "2",
        createdAt: null,
        firstName: null,
        lastName: "B",
        phone: "+375 (29) 111-11-11",
        email: "a@test.by",
        blacklisted: false,
        source: null,
        appointmentCount: 2,
        totalAmount: 20,
        notes: null,
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].canonicalPhone, "+375291111111");
    assert.equal(rows[0].email, "a@test.by");
  });
});
