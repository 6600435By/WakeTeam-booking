import { NextRequest, NextResponse } from "next/server";
import {
  AdminAccessError,
  assertPayRatesAccess,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; rateId: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id: userId, rateId } = await params;
    await assertPayRatesAccess(ctx, userId);

    const rate = await prisma.memberPayRate.findUnique({
      where: { id: rateId },
      include: { member: true },
    });
    if (!rate || rate.member.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }
    if (rate.member.userId !== userId) {
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (rate.effectiveFrom > today) {
      await prisma.memberPayRate.delete({ where: { id: rateId } });
    } else {
      await prisma.memberPayRate.update({
        where: { id: rateId },
        data: { effectiveTo: today },
      });
    }

    return NextResponse.json({ ok: true });
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
