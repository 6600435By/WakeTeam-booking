import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  BRANCH_ADMIN_ROLE,
  BRANCH_OPERATOR_ROLE,
  handleAdminError,
  requireAdminContext,
  SUPER_ADMIN_ROLE,
} from "@/lib/admin-access";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeStaffLogin } from "@/lib/staff-user";

const patchSchema = z.object({
  login: z.string().min(2).optional(),
  name: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  passportNumber: z.string().nullable().optional(),
  registrationAddress: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
  role: z.enum([SUPER_ADMIN_ROLE, BRANCH_ADMIN_ROLE, BRANCH_OPERATOR_ROLE]).optional(),
  branchId: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    assertSuperAdmin(ctx);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: id, organizationId: ctx.organizationId },
      include: { user: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextRole = body.role ?? membership.role;
    const nextBranchId =
      body.branchId !== undefined ? body.branchId : membership.branchId;

    if (nextRole !== SUPER_ADMIN_ROLE && nextRole !== "admin" && !nextBranchId) {
      return NextResponse.json(
        { error: "Выберите филиал для сотрудника" },
        { status: 400 },
      );
    }
    if (
      (nextRole === SUPER_ADMIN_ROLE || nextRole === "admin") &&
      nextBranchId
    ) {
      return NextResponse.json(
        { error: "Супер-админ не привязан к одному филиалу" },
        { status: 400 },
      );
    }

    if (nextBranchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: nextBranchId, organizationId: ctx.organizationId },
      });
      if (!branch) {
        return NextResponse.json({ error: "Филиал не найден" }, { status: 404 });
      }
    }

    if (body.login) {
      const login = normalizeStaffLogin(body.login);
      const dup = await prisma.user.findFirst({
        where: { login, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Логин уже занят" },
          { status: 409 },
        );
      }
    }

    const email =
      body.email !== undefined
        ? body.email?.trim() || null
        : undefined;
    if (email) {
      const dup = await prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json({ error: "Email уже занят" }, { status: 409 });
      }
    }

    await prisma.user.update({
      where: { id },
      data: {
        ...(body.login ? { login: normalizeStaffLogin(body.login) } : {}),
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.lastName ? { lastName: body.lastName.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
        ...(body.passportNumber !== undefined
          ? { passportNumber: body.passportNumber?.trim() || null }
          : {}),
        ...(body.registrationAddress !== undefined
          ? { registrationAddress: body.registrationAddress?.trim() || null }
          : {}),
        ...(email !== undefined ? { email } : {}),
        ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
      },
    });

    await prisma.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: id,
        },
      },
      data: {
        ...(body.role ? { role: body.role } : {}),
        branchId:
          nextRole === SUPER_ADMIN_ROLE || nextRole === "admin"
            ? null
            : nextBranchId,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
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
    assertSuperAdmin(ctx);
    const { id } = await params;

    if (id === ctx.user.id) {
      return NextResponse.json(
        { error: "Нельзя удалить свой аккаунт" },
        { status: 400 },
      );
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: id, organizationId: ctx.organizationId },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.organizationMember.delete({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: id,
        },
      },
    });
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
