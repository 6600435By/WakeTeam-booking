import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertAppointmentAccess,
  assertJournalEditAccess,
  canEditJournalInBranch,
  requireAdminContext,
} from "@/lib/admin-access";
import { adminCatchResponse } from "@/lib/admin/admin-api-error";
import { appointmentSaveErrorResponse } from "@/lib/admin/appointment-save-errors";
import { splitAppointmentInHalf } from "@/lib/admin/split-appointment";
import { prisma } from "@/lib/db";

const JOURNAL_HINT =
  "Проверьте длительность записи и свободные слоты. Если ошибка повторяется — обновите страницу.";

const bodySchema = z
  .object({
    groupAppointmentIds: z.array(z.string().min(1)).max(48).optional(),
  })
  .optional();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const existing = await prisma.appointment.findUniqueOrThrow({
      where: { id },
      select: { branchId: true, status: true },
    });
    assertJournalEditAccess(ctx, existing.branchId);
    if (!canEditJournalInBranch(ctx, existing.branchId)) {
      return NextResponse.json(
        {
          error: "Нет доступа",
          hint: "Проверьте роль и выбранный филиал.",
        },
        { status: 403 },
      );
    }
    await assertAppointmentAccess(ctx, id, "write");

    if (existing.status === "deleted") {
      return NextResponse.json(
        {
          error: "Запись удалена",
          hint: "Выберите активную запись в журнале.",
        },
        { status: 400 },
      );
    }

    const raw = await req.json().catch(() => ({}));
    const body = bodySchema.parse(raw) ?? {};
    const relatedIds = body.groupAppointmentIds?.length
      ? Array.from(new Set([id, ...body.groupAppointmentIds]))
      : undefined;

    const result = await splitAppointmentInHalf(id, relatedIds);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const mapped = appointmentSaveErrorResponse(e);
    if (mapped) {
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    return adminCatchResponse(e, JOURNAL_HINT);
  }
}
