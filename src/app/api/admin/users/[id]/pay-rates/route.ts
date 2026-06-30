import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  handleAdminError,
  requireAdminContext,
  parseAdminRole,
  BRANCH_OPERATOR_ROLE,
  BRANCH_ADMIN_ROLE,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import type { PayRateKind } from "@/lib/payroll/resolve-rates";
import { rateKindLabel } from "@/lib/payroll/resolve-rates";

function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const createSchema = z.object({
  kind: z.enum(["panel", "spot", "idle", "shift"]),
  amount: z.number().positive(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const { id: userId } = await params;

    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId,
        },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const rates = await prisma.memberPayRate.findMany({
      where: { memberId: member.id },
      orderBy: [{ kind: "asc" }, { effectiveFrom: "desc" }],
    });

    const role = parseAdminRole(member.role);
    const allowedKinds: PayRateKind[] =
      role === BRANCH_OPERATOR_ROLE
        ? ["panel", "spot", "idle"]
        : role === BRANCH_ADMIN_ROLE
          ? ["shift"]
          : [];

    return NextResponse.json({
      memberId: member.id,
      role,
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
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const { id: userId } = await params;
    const body = createSchema.parse(await req.json());

    const member = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId,
        },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
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
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
