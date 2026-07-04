import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AdminAccessError,
  assertPayRatesAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import {
  allowedPayRateKindsForMemberRole,
  rateKindLabel,
  type PayRateKind,
} from "@/lib/payroll/resolve-rates";

function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const createSchema = z.object({
  kind: z.enum(["panel", "spot", "idle", "shift", "monthly", "other"]),
  amount: z.number().positive(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: userId } = await params;
    const member = await assertPayRatesAccess(ctx, userId);

    const rates = await prisma.memberPayRate.findMany({
      where: { memberId: member.id },
      orderBy: [{ kind: "asc" }, { effectiveFrom: "desc" }],
    });

    const allowedKinds = allowedPayRateKindsForMemberRole(member.role);

    return NextResponse.json({
      memberId: member.id,
      role: member.role,
      allowedKinds,
      rates: rates.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindLabel: rateKindLabel(r.kind as PayRateKind),
        amount: r.amount,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        isCurrent: !r.effectiveTo,
      })),
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    if (e instanceof AdminAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: userId } = await params;
    const body = createSchema.parse(await req.json());
    const member = await assertPayRatesAccess(ctx, userId);

    const allowedKinds = allowedPayRateKindsForMemberRole(member.role);
    if (!allowedKinds.includes(body.kind)) {
      return NextResponse.json(
        { error: "Тариф этого типа недоступен для роли сотрудника" },
        { status: 400 },
      );
    }

    const current = await prisma.memberPayRate.findFirst({
      where: {
        memberId: member.id,
        kind: body.kind,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (current && body.effectiveFrom > current.effectiveFrom) {
      await prisma.memberPayRate.update({
        where: { id: current.id },
        data: { effectiveTo: dayBefore(body.effectiveFrom) },
      });
    }

    const rate = await prisma.memberPayRate.create({
      data: {
        memberId: member.id,
        kind: body.kind,
        amount: body.amount,
        effectiveFrom: body.effectiveFrom,
        createdByMemberId: ctx.memberId,
      },
    });

    return NextResponse.json({ rate });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    if (e instanceof AdminAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
