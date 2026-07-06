import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  BRANCH_MANAGER_ROLE,
  canAssignRole,
  handleAdminError,
  isInManagementScope,
  parseAdminRole,
  requireAdminContext,
  SUPER_ADMIN_ROLE,
} from "@/lib/admin-access";
import { formatUserZodError } from "@/lib/admin/user-form-errors";
import { hashPassword } from "@/lib/auth";
import { logUserDelete, logUserUpdate } from "@/lib/audit/user-audit";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";
import { normalizeStaffLogin } from "@/lib/staff-user";

const patchSchema = z.object({
  login: z.string().min(2).optional(),
  name: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  passportNumber: z.string().nullable().optional(),
  registrationAddress: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
  role: z
    .enum([
      SUPER_ADMIN_ROLE,
      BRANCH_MANAGER_ROLE,
      "branch_admin",
      "branch_operator",
    ])
    .optional(),
  branchId: z.string().nullable().optional(),
  branchIds: z.array(z.string()).optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
});

async function assertCanEditUser(
  ctx: Awaited<ReturnType<typeof requireAdminContext>>,
  userId: string,
) {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, organizationId: ctx.organizationId },
    include: { branchScopes: { select: { branchId: true } } },
  });
  if (!membership) {
    throw new Error("NOT_FOUND");
  }
  const role = parseAdminRole(membership.role);
  if (ctx.isSuperAdmin) return membership;
  if (!ctx.isBranchManager) {
    throw new Error("FORBIDDEN");
  }
  if (role === SUPER_ADMIN_ROLE || role === BRANCH_MANAGER_ROLE) {
    throw new Error("FORBIDDEN");
  }
  const branchIds = new Set<string>();
  if (membership.branchId) branchIds.add(membership.branchId);
  for (const s of membership.branchScopes) branchIds.add(s.branchId);
  const inScope = [...branchIds].some((id) => isInManagementScope(ctx, id));
  if (!inScope) throw new Error("FORBIDDEN");
  return membership;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdminContext();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const membership = await assertCanEditUser(ctx, id);
    const beforeUser = await prisma.user.findUnique({
      where: { id },
      select: { login: true },
    });
    const beforeBranch = membership.branchId
      ? await prisma.branch.findUnique({
          where: { id: membership.branchId },
          select: { name: true },
        })
      : null;
    const nextRole = body.role ?? membership.role;
    const parsedRole = parseAdminRole(nextRole);

    if (parsedRole === BRANCH_MANAGER_ROLE && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const nextBranchId =
      body.branchId !== undefined ? body.branchId : membership.branchId;

    if (
      parsedRole !== SUPER_ADMIN_ROLE &&
      parsedRole !== BRANCH_MANAGER_ROLE &&
      !nextBranchId
    ) {
      return NextResponse.json(
        { error: "Выберите филиал для сотрудника" },
        { status: 400 },
      );
    }

    if (
      !canAssignRole(
        ctx,
        parsedRole ?? "branch_operator",
        nextBranchId,
        body.branchIds,
      )
    ) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    if (parsedRole === BRANCH_MANAGER_ROLE) {
      if (!body.branchIds?.length) {
        return NextResponse.json(
          { error: "Выберите филиалы для управляющего" },
          { status: 400 },
        );
      }
    }

    if (nextRole === SUPER_ADMIN_ROLE && nextBranchId) {
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

    const homeBranchId =
      parsedRole === BRANCH_MANAGER_ROLE
        ? body.branchIds?.[0] ?? nextBranchId
        : parsedRole === SUPER_ADMIN_ROLE
          ? null
          : nextBranchId;

    await prisma.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: id,
        },
      },
      data: {
        ...(body.role ? { role: body.role } : {}),
        branchId: homeBranchId,
      },
    });

    if (parsedRole === BRANCH_MANAGER_ROLE && body.branchIds) {
      await prisma.memberBranchScope.deleteMany({
        where: { memberId: membership.id },
      });
      await prisma.memberBranchScope.createMany({
        data: body.branchIds.map((branchId) => ({
          memberId: membership.id,
          branchId,
        })),
      });
    }

    let afterBranchName: string | null = beforeBranch?.name ?? null;
    if (homeBranchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: homeBranchId },
        select: { name: true },
      });
      afterBranchName = branch?.name ?? null;
    } else if (parsedRole === SUPER_ADMIN_ROLE) {
      afterBranchName = null;
    }

    logUserUpdate(ctx, {
      userId: id,
      login: beforeUser?.login ?? id,
      beforeRole: membership.role,
      afterRole: body.role ?? membership.role,
      beforeBranchName: beforeBranch?.name ?? null,
      afterBranchName,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: formatUserZodError(e) }, { status: 400 });
    }
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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
      include: { user: { select: { login: true, name: true, lastName: true } } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logUserDelete(ctx, {
      userId: id,
      login: membership.user.login,
      displayName: staffDisplayName(membership.user),
    });

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
