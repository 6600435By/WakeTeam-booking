import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAdminContext,
  handleAdminError,
  requireAdminContext,
} from "@/lib/admin-access";
import { prisma } from "@/lib/db";

const bodySchema = z.object({
  action: z.enum(["complete", "reset"]),
  memberId: z.string().optional(),
});

export async function PATCH(req: Request) {
  try {
    const ctx = await requireAdminContext();
    const body = bodySchema.parse(await req.json());

    let targetMemberId = ctx.memberId;
    if (body.memberId && body.memberId !== ctx.memberId) {
      if (!ctx.isSuperAdmin) {
        return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
      }
      const member = await prisma.organizationMember.findFirst({
        where: { id: body.memberId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!member) {
        return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
      }
      targetMemberId = member.id;
    }

    const onboardingCompletedAt =
      body.action === "complete" ? new Date() : null;

    const updated = await prisma.organizationMember.update({
      where: { id: targetMemberId },
      data: { onboardingCompletedAt },
      select: { onboardingCompletedAt: true },
    });

    return NextResponse.json({
      onboardingCompletedAt: updated.onboardingCompletedAt?.toISOString() ?? null,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ctx = await getAdminContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const member = await prisma.organizationMember.findUnique({
      where: { id: ctx.memberId },
      select: { onboardingCompletedAt: true },
    });
    return NextResponse.json({
      onboardingCompletedAt: member?.onboardingCompletedAt?.toISOString() ?? null,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
