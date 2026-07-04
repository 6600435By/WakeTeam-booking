import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RETENTION_DAYS, truncateSummary } from "@/lib/audit/admin-activity-log";
import {
  summarizeAppointmentCreate,
  summarizeAppointmentPatch,
  type AppointmentAuditRow,
} from "@/lib/audit/appointment-audit";

function row(partial: Partial<AppointmentAuditRow> & Pick<AppointmentAuditRow, "id">): AppointmentAuditRow {
  return {
    id: partial.id,
    publicNumber: partial.publicNumber ?? 8331,
    branchId: partial.branchId ?? "b1",
    startAt: partial.startAt ?? new Date("2026-07-04T12:30:00.000Z"),
    endAt: partial.endAt ?? new Date("2026-07-04T13:00:00.000Z"),
    status: partial.status ?? "booked",
    durationMinutes: partial.durationMinutes ?? 30,
    price: partial.price ?? 50,
    staffId: partial.staffId ?? "s1",
    serviceId: partial.serviceId ?? "svc1",
    operatorMemberId: partial.operatorMemberId ?? null,
    client: partial.client,
    service: partial.service,
    staff: partial.staff,
    operatorMember: partial.operatorMember,
  };
}

describe("truncateSummary", () => {
  it("leaves short text unchanged", () => {
    assert.equal(truncateSummary("Короткий текст"), "Короткий текст");
  });

  it("truncates long text to 280 chars", () => {
    const long = "а".repeat(300);
    const out = truncateSummary(long);
    assert.equal(out.length, 280);
    assert.ok(out.endsWith("…"));
  });
});

describe("RETENTION_DAYS", () => {
  it("is 90 days", () => {
    assert.equal(RETENTION_DAYS, 90);
  });
});

describe("summarizeAppointmentCreate", () => {
  it("includes number, service, client, phone, resource and price", () => {
    const summary = summarizeAppointmentCreate(
      row({
        id: "a1",
        publicNumber: 8331,
        price: 50,
        service: { name: "Вейк" },
        staff: { name: "Реверс №1" },
        client: { firstName: "Иван", lastName: "Иванов", phone: "+375291234567" },
      }),
    );
    assert.match(summary, /Создал #8331/);
    assert.match(summary, /Вейк/);
    assert.match(summary, /клиент Иванов Иван/);
    assert.match(summary, /тел \+375291234567/);
    assert.match(summary, /ресурс Реверс №1/);
    assert.match(summary, /50 BYN/);
  });
});

describe("summarizeAppointmentPatch", () => {
  it("returns null when nothing changed", () => {
    const base = row({ id: "a1" });
    assert.equal(summarizeAppointmentPatch(base, { ...base }), null);
  });

  it("ignores time-only changes", () => {
    const before = row({
      id: "a1",
      startAt: new Date("2026-07-04T12:30:00.000Z"),
    });
    const after = row({
      id: "a1",
      startAt: new Date("2026-07-04T13:00:00.000Z"),
    });
    assert.equal(summarizeAppointmentPatch(before, after), null);
  });

  it("describes operator change with appointment details", () => {
    const before = row({
      id: "a1",
      operatorMemberId: "m1",
      staff: { name: "Реверс №1" },
      client: { firstName: "Иван", lastName: "Иванов", phone: "+375291234567" },
      operatorMember: {
        user: { name: "Ирина", lastName: "Губицкая", login: "irina" },
      },
    });
    const after = row({
      id: "a1",
      operatorMemberId: "m2",
      staff: { name: "Реверс №1" },
      client: { firstName: "Иван", lastName: "Иванов", phone: "+375291234567" },
      operatorMember: {
        user: { name: "Пётр", lastName: "Петров", login: "petr" },
      },
    });
    const summary = summarizeAppointmentPatch(before, after);
    assert.ok(summary);
    assert.match(summary, /оператор .+→.+/);
    assert.match(summary, /клиент Иванов Иван/);
    assert.match(summary, /тел \+375291234567/);
    assert.match(summary, /ресурс Реверс №1/);
    assert.match(summary, /50 BYN/);
  });

  it("describes price change", () => {
    const before = row({ id: "a1", price: 50 });
    const after = row({ id: "a1", price: 60 });
    const summary = summarizeAppointmentPatch(before, after);
    assert.ok(summary);
    assert.match(summary, /цена 50→60 BYN/);
    assert.match(summary, /60 BYN/);
  });
});
