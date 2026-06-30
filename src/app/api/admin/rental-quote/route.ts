import { NextRequest, NextResponse } from "next/server";
import {
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { computeRentalAmount } from "@/lib/rental-pricing";

export async function GET(req: NextRequest) {
  try {
    await requireAdminContext();
    const p = req.nextUrl.searchParams;
    const branchId = p.get("branchId");
    const rentalItemId = p.get("rentalItemId");
    const rentalQuantity = parseInt(p.get("quantity") ?? "1", 10);
    const startAtRaw = p.get("startAt");
    const appointmentId = p.get("appointmentId") ?? undefined;
    const phone = p.get("phone") ?? undefined;
    const clientId = p.get("clientId") ?? undefined;

    if (!branchId || !startAtRaw) {
      return NextResponse.json(
        { error: "branchId and startAt required" },
        { status: 400 },
      );
    }

    const startAt = new Date(startAtRaw);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
    }

    if (!rentalItemId) {
      return NextResponse.json({
        amount: 0,
        chargedOnThisAppointment: false,
      });
    }

    let resolvedClientId = clientId ?? undefined;
    if (!resolvedClientId && phone) {
      const ctx = await requireAdminContext();
      const client = await prisma.client.findFirst({
        where: { organizationId: ctx.organizationId, phone },
      });
      resolvedClientId = client?.id;
    }

    const result = await computeRentalAmount(prisma, {
      appointmentId,
      startAt,
      clientId: resolvedClientId,
      branchId,
      rentalItemId,
      rentalQuantity: Number.isNaN(rentalQuantity) ? 1 : rentalQuantity,
    });

    return NextResponse.json(result);
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
