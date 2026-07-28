import { prisma } from "@/lib/db";
import {
  applyAppointmentPaymentAmounts,
  legacyAmountsFromPaymentMethod,
} from "@/lib/admin/appointment-payment";
import {
  applyMembershipDeductionIfNeeded,
  reconcileMembershipOnStatusChange,
  setAppointmentMembership,
} from "@/lib/memberships/deduct";
import {
  applyAppointmentRental,
  reconcileDailyRentalCharges,
} from "@/lib/rental-pricing";
import { updateAppointment } from "@/lib/slots/generateSlots";
import { formatDateKey } from "@/lib/time";

export type AdminAppointmentFinalizeInput = {
  membershipId?: string | null;
  desiredStatus?: string;
  paymentMethod?: "cash" | "card" | "corporate" | "split" | null;
  cashAmount?: number;
  cardAmount?: number;
  price?: number;
  rentalItemId?: string | null;
  rentalQuantity?: number;
};

async function applyAdminAppointmentSideEffects(
  appointmentId: string,
  input: AdminAppointmentFinalizeInput,
): Promise<void> {
  const hasRental = Boolean(input.rentalItemId);
  const hasAmounts =
    input.cashAmount !== undefined || input.cardAmount !== undefined;
  const hasPayment = input.paymentMethod != null || hasAmounts;
  const hasMembership = Boolean(input.membershipId);
  const hasStatusChange =
    Boolean(input.desiredStatus) && input.desiredStatus !== "booked";

  if (!hasRental && !hasPayment && !hasMembership && !hasStatusChange) {
    return;
  }

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
    }

    if (input.membershipId) {
      await setAppointmentMembership(appointmentId, input.membershipId, tx);
    }

    if (hasPayment) {
      const amounts = hasAmounts
        ? {
            cashAmount: input.cashAmount ?? 0,
            cardAmount: input.cardAmount ?? 0,
          }
        : legacyAmountsFromPaymentMethod(
            input.paymentMethod,
            input.price ?? 0,
          );
      const appt = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: {
          membershipId: true,
          rentalAmount: true,
          durationMinutes: true,
          startAt: true,
          serviceId: true,
        },
      });
      await applyAppointmentPaymentAmounts(tx, appointmentId, amounts, {
        membershipId: appt.membershipId,
        rentalAmount: appt.rentalAmount,
        durationMinutes: appt.durationMinutes,
        startAt: appt.startAt,
        serviceId: appt.serviceId,
        dueOverride: input.price,
        validate: hasAmounts,
      });
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
  cashAmount?: number;
  cardAmount?: number;
  updateFields: Parameters<typeof updateAppointment>[1];
};

export type PatchExistingAppointment = {
  status: string;
  membershipId: string | null;
  rentalItemId: string | null;
  rentalQuantity: number;
  startAt: Date;
  clientId: string;
  branchId: string;
  organizationId: string;
  staffId: string;
  serviceId: string;
  durationMinutes: number;
  client: {
    phone: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
};

export async function patchAdminAppointment(
  appointmentId: string,
  existing: PatchExistingAppointment,
  input: AdminAppointmentPatchInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await updateAppointment(appointmentId, input.updateFields, {
      skipSlotCheck: true,
      allowOverlap: true,
      db: tx,
      existing,
    });

    const nextRentalId =
      input.rentalItemId !== undefined ? input.rentalItemId : existing.rentalItemId;
    const nextRentalQty =
      input.rentalQuantity !== undefined ? input.rentalQuantity : existing.rentalQuantity;
    const rentalChanged =
      input.rentalItemId !== undefined &&
      (nextRentalId !== existing.rentalItemId ||
        nextRentalQty !== existing.rentalQuantity);
    const nextStartAt = input.updateFields.startAt
      ? new Date(input.updateFields.startAt)
      : existing.startAt;
    const startAtChanged = nextStartAt.getTime() !== existing.startAt.getTime();

    if (rentalChanged) {
      await applyAppointmentRental(
        tx,
        appointmentId,
        {
          rentalItemId: nextRentalId,
          rentalQuantity: nextRentalQty,
        },
        { priceOverride: input.price },
      );
    } else if (startAtChanged && (existing.rentalItemId || nextRentalId)) {
      await reconcileDailyRentalCharges(tx, {
        clientId: existing.clientId,
        branchId: existing.branchId,
        dateKey: formatDateKey(nextStartAt),
      });
    }

    if (
      input.membershipId !== undefined &&
      input.membershipId !== existing.membershipId
    ) {
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

    if (input.cashAmount !== undefined || input.cardAmount !== undefined) {
      const appt = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        select: {
          membershipId: true,
          rentalAmount: true,
          durationMinutes: true,
          startAt: true,
          serviceId: true,
        },
      });
      await applyAppointmentPaymentAmounts(
        tx,
        appointmentId,
        {
          cashAmount: input.cashAmount ?? 0,
          cardAmount: input.cardAmount ?? 0,
        },
        {
          membershipId: appt.membershipId,
          rentalAmount: appt.rentalAmount,
          durationMinutes: appt.durationMinutes,
          startAt: appt.startAt,
          serviceId: appt.serviceId,
          dueOverride: input.price,
          validate: true,
        },
      );
    } else if (input.updateFields.paymentMethod !== undefined) {
      const price =
        input.price ??
        input.updateFields.price ??
        (
          await tx.appointment.findUniqueOrThrow({
            where: { id: appointmentId },
            select: { price: true },
          })
        ).price;
      const amounts = legacyAmountsFromPaymentMethod(
        input.updateFields.paymentMethod,
        price,
      );
      await applyAppointmentPaymentAmounts(tx, appointmentId, amounts, {
        validate: false,
      });
    }
  });
}
