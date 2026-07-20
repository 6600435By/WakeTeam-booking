import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  appointmentSaveErrorResponse,
  formatAppointmentSaveError,
} from "./appointment-save-errors";

describe("appointmentSaveErrorResponse", () => {
  it("maps known booking codes to Russian hints", () => {
    const mapped = appointmentSaveErrorResponse(new Error("SLOT_UNAVAILABLE"));
    assert.ok(mapped);
    assert.equal(mapped.body.error, "Слот занят");
    assert.match(mapped.body.hint ?? "", /другое время/i);
    assert.equal(mapped.status, 409);
  });

  it("formats Zod field errors", () => {
    const schema = z.object({
      phone: z.string().min(6),
      firstName: z.string().min(1),
    });
    let err: unknown;
    try {
      schema.parse({ phone: "1", firstName: "" });
    } catch (e) {
      err = e;
    }
    const mapped = appointmentSaveErrorResponse(err);
    assert.ok(mapped);
    assert.equal(mapped.status, 400);
    assert.match(mapped.body.error, /телефон|имя/i);
  });
});

describe("formatAppointmentSaveError", () => {
  it("joins error and hint", () => {
    assert.equal(
      formatAppointmentSaveError({
        error: "Слот занят",
        hint: "Выберите другое время.",
      }),
      "Слот занят. Выберите другое время.",
    );
  });

  it("handles legacy Zod flatten objects", () => {
    const msg = formatAppointmentSaveError({
      error: {
        formErrors: [],
        fieldErrors: { phone: ["String must contain at least 6 character(s)"] },
      },
    });
    assert.match(msg, /телефон/i);
  });
});
