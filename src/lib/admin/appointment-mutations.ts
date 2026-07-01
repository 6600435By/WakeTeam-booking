import { prisma } from "@/lib/db";
import {
  applyMembershipDeductionIfNeeded,
  reconcileMembershipOnStatusChange,
  setAppointmentMembership,
} from "@/lib/memberships/deduct";
import { applyAppointmentRental } from "@/lib/rental-pricing";
import { updateAppointment } from "@/lib/slots/generateSlots";

export type AdminAppointmentFinalizeInput = {
  membershipId?: string | null;
  desiredStatus?: string;
  paymentMethod?: "cash" | "card" | "corporate" | null;
  price?: number;
  rentalItemId?: string | null;
  rentalQuantity?: number;
};

async function applyAdminAppointmentSideEffects(
  appointmentId: string,
  input: AdminAppointmentFinalizeInput,
): Promise<void> {
  const hasRental =
    input.rentalItemId !== undefined || input.rentalQuantity !== undefined;
  const hasPriceOrPayment =
    input.price != null || input.paymentMethod !== undefined;

  await prisma.$transaction(async (tx) => {
    if (hasRental) {
      await applyAppointmentRental(
        tx,
        appointmentId,
        {
          rentalItemId: input.rentalItemId ?? null,
          rentalQuantity: input.rentalQuantity ?? 0,
        },
        { priceOverride: input.price ?? undefined },
      );
    } else if (hasPriceOrPayment) {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          ...(input.price != null ? { price: input.price } : {}),
          ...(input.paymentMethod !== undefined
            ? { paymentMethod: input.paymentMethod }
            : {}),
        },
      });
    }

    if (input.membershipId) {
      await setAppointmentMembership(appointmentId, input.membershipId, tx);
    }

    if (input.desiredStatus && input.desiredStatus !== "booked") {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: input.desiredStatus },
      });
      await applyMembershipDeductionIfNeeded(
        appointmentId,
        input.desiredStatus,
        tx,
      );
    }
  });
}

export async function finalizeAdminAppointmentCreate(
  appointmentId: string,
  input: AdminAppointmentFinalizeInput,
): Promise<void> {
  await applyAdminAppointmentSideEffects(appointmentId, input);
}

export type AdminAppointmentPatchInput = {
  membershipId?: string | null;
  status?: string;
  rentalItemId?: string | null;
  rentalQuantity?: number;
  price?: number;
  updateFields: Parameters<typeof updateAppointment>[1];
};

export async function patchAdminAppointment(
  appointmentId: string,
  existing: { status: string },
  input: AdminAppointmentPatchInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await updateAppointment(appointmentId, input.updateFields, {
      skipSlotCheck: true,
      db: tx,
    });

    const hasRental =
      input.rentalItemId !== undefined || input.rentalQuantity !== undefined;

    if (hasRental) {
      await applyAppointmentRental(
        tx,
        appointmentId,
        {
          rentalItemId: input.rentalItemId ?? null,
          rentalQuantity: input.rentalQuantity ?? 0,
        },
        { priceOverride: input.price },
      );
    } else if (input.price != null) {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { price: input.price },
      });
    }

    if (input.membershipId !== undefined) {
      await setAppointmentMembership(appointmentId, input.membershipId, tx);
    }

    const nextStatus = input.status ?? input.updateFields.status;
    if (nextStatus && nextStatus !== existing.status) {
      await reconcileMembershipOnStatusChange(
        appointmentId,
        existing.status,
        nextStatus,
        tx,
      );
    }
  });
}
