import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canEditShiftCalendar,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { getBranchPlannedWindow } from "@/lib/payroll/branch-planned-window";
import { expandScheduleDates } from "@/lib/payroll/shift-schedule-bulk";
import { validateShiftSchedule } from "@/lib/payroll/shift-schedule";
import { createBaselineTask } from "@/lib/payroll/shift-baseline-tasks";

const rowSchema = z.object({
  memberId: z.string(),
  weekdays: z.string().min(1),
  plannedStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  plannedStaffId: z.string().optional(),
  workAsAdmin: z.boolean().optional(),
});

const taskRowSchema = z.object({
  weekdays: z.string().min(1),
  description: z.string().min(1),
});

const bulkSchema = z.object({
  branchId: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  skipExisting: z.boolean().optional(),
  replaceScheduled: z.boolean().optional(),
  rows: z.array(rowSchema).default([]),
  taskRows: z.array(taskRowSchema).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canEditShiftCalendar(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const body = bulkSchema.parse(await req.json());
    const skipExisting = body.skipExisting ?? true;
    const replaceScheduled = body.replaceScheduled ?? false;

    const activeRows = body.rows.filter(
      (row) => row.memberId && row.weekdays.trim().length > 0,
    );
    const taskRows = (body.taskRows ?? []).filter(
      (row) => row.description.trim() && row.weekdays.trim(),
    );

    if (activeRows.length === 0 && taskRows.length === 0) {
      return NextResponse.json(
        { error: "Добавьте смены или общие задания" },
        { status: 400 },
      );
    }

    const validatedRows: {
      memberId: string;
      weekdays: string;
      plannedStart?: string;
      plannedEnd?: string;
      plannedStaffId?: string;
      workAsAdmin?: boolean;
      schedule: Awaited<ReturnType<typeof validateShiftSchedule>>;
      dates: string[];
    }[] = [];

    for (const row of activeRows) {
      const schedule = await validateShiftSchedule(
        body.branchId,
        row.memberId,
        row.plannedStaffId,
        row.workAsAdmin,
      );
      if ("error" in schedule) {
        return NextResponse.json({ error: schedule.error }, { status: 400 });
      }
      const dates = expandScheduleDates(
        body.month,
        row.weekdays,
        body.dateFrom,
        body.dateTo,
      );
      if (dates.length === 0) {
        return NextResponse.json(
          { error: "Выберите хотя бы один день недели в периоде" },
          { status: 400 },
        );
      }
      validatedRows.push({ ...row, schedule, dates });
    }

    let created = 0;
    let skipped = 0;
    let replaced = 0;
    const errors: { date: string; memberId: string; memberName?: string; error: string }[] =
      [];

    const memberNames = new Map<string, string>();
    for (const row of validatedRows) {
      for (const date of row.dates) {
        const existing = await prisma.workShift.findUnique({
          where: {
            memberId_date: { memberId: row.memberId, date },
          },
          include: {
            member: { include: { user: { select: { name: true, lastName: true, login: true, email: true } } } },
          },
        });

        if (existing) {
          if (existing.status === "scheduled" && replaceScheduled) {
            const planned = await getBranchPlannedWindow(body.branchId, date);
            await prisma.workShift.update({
              where: { id: existing.id },
              data: {
                plannedStart: row.plannedStart ?? planned.start ?? "10:00",
                plannedEnd: row.plannedEnd ?? planned.end ?? "22:00",
                plannedStaffId: row.schedule.plannedStaffId,
                workAsAdmin: row.schedule.workAsAdmin,
              },
            });
            replaced++;
            continue;
          }
          if (skipExisting || existing.status === "scheduled") {
            skipped++;
            continue;
          }
          const name =
            staffDisplayName(existing.member.user) ?? row.memberId;
          memberNames.set(row.memberId, name);
          errors.push({
            date,
            memberId: row.memberId,
            memberName: name,
            error: "У сотрудника уже есть смена на этот день",
          });
          continue;
        }

        const planned = await getBranchPlannedWindow(body.branchId, date);
        await prisma.workShift.create({
          data: {
            organizationId: ctx.organizationId,
            branchId: body.branchId,
            memberId: row.memberId,
            date,
            plannedStart: row.plannedStart ?? planned.start ?? "10:00",
            plannedEnd: row.plannedEnd ?? planned.end ?? "22:00",
            plannedStaffId: row.schedule.plannedStaffId,
            workAsAdmin: row.schedule.workAsAdmin,
            status: "scheduled",
          },
        });
        created++;
      }
    }

    let tasksCreated = 0;
    let tasksSkipped = 0;

    if (taskRows.length > 0) {
      for (const row of taskRows) {
        const dates = expandScheduleDates(
          body.month,
          row.weekdays,
          body.dateFrom,
          body.dateTo,
        );
        for (const date of dates) {
          const existing = await prisma.shiftBaselineTask.findFirst({
            where: {
              branchId: body.branchId,
              date,
              description: row.description.trim(),
            },
          });
          if (existing) {
            tasksSkipped++;
            continue;
          }

          await createBaselineTask({
            organizationId: ctx.organizationId,
            branchId: body.branchId,
            date,
            description: row.description.trim(),
            assignedByMemberId: ctx.memberId,
          });
          tasksCreated++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      replaced,
      errors,
      tasksCreated,
      tasksSkipped,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error("[shift-schedule/bulk]", e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
