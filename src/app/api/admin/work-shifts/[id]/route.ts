import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canReviewShifts,
  canApproveShift,
  canEditApprovedShift,
  canDeleteShift,
  handleAdminError,
  requireAdminContext,
  assertShiftSelfOrAdmin,
  canViewBranchShiftSummary,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { approveShiftInternal } from "@/lib/payroll/approve-shift";
import {
  enrichShiftResponse,
  SHIFT_INCLUDE,
  snapshotRatesOnClose,
  resolveEffectiveShiftEnd,
} from "@/lib/payroll/work-shift-service";
import { saveBaselineCompletions } from "@/lib/payroll/shift-baseline-tasks";
import { saveChecklistCompletions } from "@/lib/payroll/shift-checklist";
import { logShiftClose } from "@/lib/audit/shift-audit";

const patchSchema = z.object({
  action: z.enum(["close", "assign_reverse", "employee_submit"]).optional(),
  staffId: z.string().optional(),
  panelMinutesOverride: z.number().int().min(0).nullable().optional(),
  idleMinutesOverride: z.number().int().min(0).nullable().optional(),
  actualStart: z.string().datetime().optional(),
  actualEnd: z.string().datetime().optional(),
  comment: z.string().optional(),
  baselineCompletedTaskIds: z.array(z.string()).optional(),
  checklistCompletedItemIds: z.array(z.string()).optional(),
  employeeSubmitComment: z.string().optional(),
  reviewNoteForManager: z.string().optional(),
  reviewNoteForSuperAdmin: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const shift = await prisma.workShift.findUnique({
      where: { id },
      include: SHIFT_INCLUDE,
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    assertShiftSelfOrAdmin(ctx, shift.memberId, shift.branchId);

    if (body.action === "close") {
      if (shift.status !== "open") {
        return NextResponse.json({ error: "Смена уже закрыта" }, { status: 400 });
      }
      const effectiveEnd = resolveEffectiveShiftEnd(shift, new Date()) ?? new Date();
      const activeSpot = shift.spotEntries.find((e) => e.isActive);
      if (activeSpot) {
        if (canReviewShifts(ctx)) {
          await prisma.spotWorkEntry.update({
            where: { id: activeSpot.id },
            data: { isActive: false, endedAt: effectiveEnd },
          });
        } else {
          return NextResponse.json(
            { error: "Завершите активную работу на споте" },
            { status: 400 },
          );
        }
      }
      const openAssign = shift.reverseAssignments.find((a) => !a.endedAt);
      if (openAssign) {
        await prisma.reverseAssignment.update({
          where: { id: openAssign.id },
          data: { endedAt: effectiveEnd },
        });
      }
      const ratesSnapshot = await snapshotRatesOnClose(shift.memberId, shift.date);
      if (body.baselineCompletedTaskIds) {
        await saveBaselineCompletions(
          shift.id,
          shift.memberId,
          body.baselineCompletedTaskIds,
        );
      }
      try {
        await saveChecklistCompletions(
          shift.id,
          shift.memberId,
          body.checklistCompletedItemIds ?? [],
        );
      } catch (err) {
        if (err instanceof Error && err.message === "CHECKLIST_INCOMPLETE") {
          return NextResponse.json(
            { error: "Отметьте все пункты чеклиста филиала" },
            { status: 400 },
          );
        }
        throw err;
      }
      const updated = await prisma.workShift.update({
        where: { id },
        data: {
          status: "closed",
          actualEnd: effectiveEnd,
          ratesSnapshot,
        },
        include: SHIFT_INCLUDE,
      });

      const branchName =
        updated.member.branch?.name ??
        (
          await prisma.branch.findUnique({
            where: { id: updated.branchId },
            select: { name: true },
          })
        )?.name ??
        "филиал";
      logShiftClose(ctx, {
        shiftId: updated.id,
        branchId: updated.branchId,
        memberUser: updated.member.user,
        branchName,
        actualEnd: updated.actualEnd ?? new Date(),
      });

      if (
        ctx.isBranchManager &&
        shift.memberId === ctx.memberId
      ) {
        const approved = await approveShiftInternal(
          id,
          ctx.memberId,
          "Автоутверждение при закрытии смены управляющим",
        );
        if (approved) {
          return NextResponse.json(await enrichShiftResponse(approved));
        }
      }

      return NextResponse.json(await enrichShiftResponse(updated));
    }

    if (body.action === "assign_reverse") {
      if (!body.staffId) {
        return NextResponse.json({ error: "Выберите реверс" }, { status: 400 });
      }
      if (shift.status !== "open") {
        return NextResponse.json({ error: "Смена не открыта" }, { status: 400 });
      }
      const staff = await prisma.staff.findFirst({
        where: { id: body.staffId, branchId: shift.branchId, kind: "revers" },
      });
      if (!staff) {
        return NextResponse.json({ error: "Реверс не найден" }, { status: 404 });
      }
      const now = new Date();
      const openAssign = shift.reverseAssignments.find((a) => !a.endedAt);
      if (openAssign) {
        await prisma.reverseAssignment.update({
          where: { id: openAssign.id },
          data: { endedAt: now },
        });
      }
      await prisma.reverseAssignment.create({
        data: { shiftId: id, staffId: body.staffId, startedAt: now },
      });
      const updated = await prisma.workShift.findUnique({
        where: { id },
        include: SHIFT_INCLUDE,
      });
      return NextResponse.json(await enrichShiftResponse(updated!));
    }

    if (body.action === "employee_submit") {
      if (shift.memberId !== ctx.memberId) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      if (shift.status !== "closed") {
        return NextResponse.json(
          { error: "Подтвердить можно только закрытую смену" },
          { status: 400 },
        );
      }
      const updated = await prisma.workShift.update({
        where: { id },
        data: {
          employeeSubmittedAt: new Date(),
          employeeSubmitComment: body.employeeSubmitComment?.trim() || null,
        },
        include: SHIFT_INCLUDE,
      });
      return NextResponse.json(await enrichShiftResponse(updated));
    }

    const canAdjust =
      ctx.isSuperAdmin ||
      canApproveShift(ctx, shift.member.role, shift.branchId);

    if (
      body.panelMinutesOverride !== undefined ||
      body.idleMinutesOverride !== undefined ||
      body.actualStart ||
      body.actualEnd
    ) {
      if (!canAdjust) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      if (shift.status === "approved" && !canEditApprovedShift(ctx, shift.member.role, shift.branchId)) {
        return NextResponse.json({ error: "Смена утверждена" }, { status: 400 });
      }
      if (!body.comment?.trim()) {
        return NextResponse.json({ error: "Укажите комментарий" }, { status: 400 });
      }
      const data: Record<string, unknown> = {};
      const adjustments: {
        field: string;
        oldValue: string;
        newValue: string;
      }[] = [];

      if (body.panelMinutesOverride !== undefined) {
        adjustments.push({
          field: "panel_minutes",
          oldValue: String(shift.panelMinutesOverride ?? ""),
          newValue: String(body.panelMinutesOverride ?? ""),
        });
        data.panelMinutesOverride = body.panelMinutesOverride;
      }
      if (body.idleMinutesOverride !== undefined) {
        adjustments.push({
          field: "idle_minutes",
          oldValue: String(shift.idleMinutesOverride ?? ""),
          newValue: String(body.idleMinutesOverride ?? ""),
        });
        data.idleMinutesOverride = body.idleMinutesOverride;
      }
      if (body.actualStart) {
        adjustments.push({
          field: "actual_start",
          oldValue: shift.actualStart?.toISOString() ?? "",
          newValue: body.actualStart,
        });
        data.actualStart = new Date(body.actualStart);
      }
      if (body.actualEnd) {
        adjustments.push({
          field: "actual_end",
          oldValue: shift.actualEnd?.toISOString() ?? "",
          newValue: body.actualEnd,
        });
        data.actualEnd = new Date(body.actualEnd);
      }

      await prisma.$transaction(
        adjustments.map((adj) =>
          prisma.shiftAdjustment.create({
            data: {
              shiftId: id,
              field: adj.field,
              oldValue: adj.oldValue,
              newValue: adj.newValue,
              comment: body.comment!.trim(),
              createdByMemberId: ctx.memberId,
            },
          }),
        ),
      );

      const updated = await prisma.workShift.update({
        where: { id },
        data,
        include: SHIFT_INCLUDE,
      });
      return NextResponse.json(
        await enrichShiftResponse(updated, new Date(), {
          includeBranchDaySummary: canViewBranchShiftSummary(ctx),
        }),
      );
    }

    if (body.reviewNoteForManager !== undefined) {
      if (!ctx.isBranchAdmin && !ctx.isSuperAdmin) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      if (!body.reviewNoteForManager.trim()) {
        return NextResponse.json({ error: "Укажите текст замечания" }, { status: 400 });
      }
      await prisma.shiftAdjustment.create({
        data: {
          shiftId: id,
          field: "review_note_manager",
          oldValue: "",
          newValue: body.reviewNoteForManager.trim(),
          comment: body.reviewNoteForManager.trim(),
          createdByMemberId: ctx.memberId,
        },
      });
      const updated = await prisma.workShift.findUnique({
        where: { id },
        include: SHIFT_INCLUDE,
      });
      return NextResponse.json(
        await enrichShiftResponse(updated!, new Date(), {
          includeBranchDaySummary: canViewBranchShiftSummary(ctx),
        }),
      );
    }

    if (body.reviewNoteForSuperAdmin !== undefined) {
      if (!ctx.isBranchManager && !ctx.isSuperAdmin) {
        return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
      }
      if (!body.reviewNoteForSuperAdmin.trim()) {
        return NextResponse.json({ error: "Укажите текст замечания" }, { status: 400 });
      }
      await prisma.shiftAdjustment.create({
        data: {
          shiftId: id,
          field: "review_note_super_admin",
          oldValue: "",
          newValue: body.reviewNoteForSuperAdmin.trim(),
          comment: body.reviewNoteForSuperAdmin.trim(),
          createdByMemberId: ctx.memberId,
        },
      });
      const updated = await prisma.workShift.findUnique({
        where: { id },
        include: SHIFT_INCLUDE,
      });
      return NextResponse.json(
        await enrichShiftResponse(updated!, new Date(), {
          includeBranchDaySummary: canViewBranchShiftSummary(ctx),
        }),
      );
    }

    return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const shift = await prisma.workShift.findUnique({
      where: { id },
      include: SHIFT_INCLUDE,
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    assertShiftSelfOrAdmin(ctx, shift.memberId, shift.branchId);
    return NextResponse.json(
      await enrichShiftResponse(shift, new Date(), {
        includeBranchDaySummary: canViewBranchShiftSummary(ctx),
      }),
    );
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    if (!canReviewShifts(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    const { id } = await params;
    const shift = await prisma.workShift.findUnique({
      where: { id },
      include: SHIFT_INCLUDE,
    });
    if (!shift || shift.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (!canDeleteShift(ctx, shift.member.role, shift.branchId)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    if (shift.status === "open") {
      const effectiveEnd = resolveEffectiveShiftEnd(shift, new Date()) ?? new Date();
      const activeSpot = shift.spotEntries.find((e) => e.isActive);
      if (activeSpot) {
        await prisma.spotWorkEntry.update({
          where: { id: activeSpot.id },
          data: { isActive: false, endedAt: effectiveEnd },
        });
      }
      for (const assign of shift.reverseAssignments.filter((a) => !a.endedAt)) {
        await prisma.reverseAssignment.update({
          where: { id: assign.id },
          data: { endedAt: effectiveEnd },
        });
      }
      const ratesSnapshot = await snapshotRatesOnClose(shift.memberId, shift.date);
      await prisma.workShift.update({
        where: { id },
        data: {
          status: "closed",
          actualEnd: effectiveEnd,
          ratesSnapshot,
        },
      });
    }

    await prisma.workShift.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
