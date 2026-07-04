import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  canViewAdminActivityLog,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  branchId: z.string().optional(),
  action: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
});

const PAGE_SIZE = 50;

const APPOINTMENT_ACTIONS = ["appt.create", "appt.cancel", "appt.create.online"] as const;

const ACTION_LABELS: Record<string, string> = {
  login: "Вход",
  logout: "Выход",
  "appt.create": "Создал запись",
  "appt.update": "Изменил запись",
  "appt.cancel": "Удалил запись",
  "appt.create.online": "Онлайн-запись",
  "shift.open": "Открытие смены",
  "shift.close": "Закрытие смены",
  "shift.assign": "Назначение на смену",
  "schedule.branch": "График филиала",
  "schedule.resource": "График ресурса",
  "schedule.service": "Услуга",
  "user.change": "Сотрудник",
  "payroll.confirm": "Зарплата",
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    if (!canViewAdminActivityLog(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const parsed = querySchema.parse({
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
      branchId: req.nextUrl.searchParams.get("branchId") ?? undefined,
      action: req.nextUrl.searchParams.get("action") ?? undefined,
      q: req.nextUrl.searchParams.get("q") ?? undefined,
      cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
    });

    const where: {
      organizationId: string;
      createdAt?: { gte?: Date; lte?: Date };
      branchId?: string;
      action?: { startsWith?: string; equals?: string; in?: string[] };
      OR?: Array<{ summary?: { contains: string; mode: "insensitive" }; actorName?: { contains: string; mode: "insensitive" } }>;
    } = {
      organizationId: ctx.organizationId,
    };

    if (parsed.from || parsed.to) {
      where.createdAt = {};
      if (parsed.from) {
        where.createdAt.gte = new Date(`${parsed.from}T00:00:00.000Z`);
      }
      if (parsed.to) {
        const end = new Date(`${parsed.to}T23:59:59.999Z`);
        where.createdAt.lte = end;
      }
    }

    if (parsed.branchId) {
      where.branchId = parsed.branchId;
    }

    if (parsed.action === "appointments") {
      where.action = { in: [...APPOINTMENT_ACTIONS] };
    } else if (parsed.action) {
      where.action = { equals: parsed.action };
    }

    if (parsed.q?.trim()) {
      const q = parsed.q.trim();
      where.OR = [
        { summary: { contains: q, mode: "insensitive" } },
        { actorName: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.adminActivityLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(parsed.cursor
        ? {
            cursor: { id: parsed.cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    const branchIds = [...new Set(items.map((i) => i.branchId).filter(Boolean))] as string[];
    const branches =
      branchIds.length > 0
        ? await prisma.branch.findMany({
            where: { id: { in: branchIds } },
            select: { id: true, name: true },
          })
        : [];
    const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

    return NextResponse.json({
      items: items.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        actionLabel: ACTION_LABELS[row.action] ?? row.action,
        actorMemberId: row.actorMemberId,
        actorName: row.actorName,
        branchId: row.branchId,
        branchName: row.branchId ? branchNameById.get(row.branchId) ?? null : null,
        entityType: row.entityType,
        entityId: row.entityId,
        summary: row.summary,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      actionLabels: ACTION_LABELS,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
