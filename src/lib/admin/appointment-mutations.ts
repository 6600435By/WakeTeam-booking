import { prisma } from "@/lib/db";
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
  paymentMethod?: "cash" | "card" | "corporate" | null;
  price?: number;
  rentalItemId?: string | null;
  rentalQuantity?: number;
};

async function applyAdminAppointmentSideEffects(
  appointmentId: string,
  input: AdminAppointmentFinalizeInput,
): Promise<void> {
  const hasRental = Boolean(input.rentalItemId);
  const hasPayment = input.paymentMethod != null;
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
    } else if (hasPayment) {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          paymentMethod: input.paymentMethod,
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
  });
}
