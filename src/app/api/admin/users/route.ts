import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  BRANCH_ADMIN_ROLE,
  BRANCH_MANAGER_ROLE,
  BRANCH_OPERATOR_ROLE,
  canAssignRole,
  canViewStaffUsers,
  handleAdminError,
  parseAdminRole,
  requireAdminContext,
  roleLabel,
  SUPER_ADMIN_ROLE,
} from "@/lib/admin-access";
import { hashPassword } from "@/lib/auth";
import { logUserCreate } from "@/lib/audit/user-audit";
import { prisma } from "@/lib/db";
import { normalizeStaffLogin } from "@/lib/staff-user";
import { formatUserZodError } from "@/lib/admin/user-form-errors";

const profileFields = {
  name: z.string().min(1),
  lastName: z.string().min(1),
  login: z.string().min(2),
  phone: z.string().optional(),
  passportNumber: z.string().optional(),
  registrationAddress: z.string().optional(),
};

const createSchema = z.object({
  ...profileFields,
  password: z.string().min(6),
  role: z.enum([
    SUPER_ADMIN_ROLE,
    BRANCH_MANAGER_ROLE,
    BRANCH_ADMIN_ROLE,
    BRANCH_OPERATOR_ROLE,
  ]),
  branchId: z.string().nullable().optional(),
  branchIds: z.array(z.string()).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

const userSelect = {
  id: true,
  login: true,
  email: true,
  name: true,
  lastName: true,
  phone: true,
  passportNumber: true,
  registrationAddress: true,
  createdAt: true,
} as const;

function mapUser(m: {
  user: {
    id: string;
    login: string;
    email: string | null;
    name: string | null;
    lastName: string | null;
    phone: string | null;
    passportNumber: string | null;
    registrationAddress: string | null;
    createdAt: Date;
  };
  role: string;
  branchId: string | null;
  branch: { name: string } | null;
  branchScopes?: { branchId: string; branch: { id: string; name: string } }[];
}) {
  const role = parseAdminRole(m.role) ?? BRANCH_OPERATOR_ROLE;
  return {
    id: m.user.id,
    login: m.user.login,
    email: m.user.email,
    name: m.user.name,
    lastName: m.user.lastName,
    phone: m.user.phone,
    passportNumber: m.user.passportNumber,
    registrationAddress: m.user.registrationAddress,
    role,
    roleLabel: roleLabel(role),
    branchId: m.branchId,
    branchName: m.branch?.name ?? null,
    managedBranchIds: m.branchScopes?.map((s) => s.branchId) ?? [],
    managedBranchNames:
      m.branchScopes?.map((s) => s.branch.name).join(", ") ?? "",
    createdAt: m.user.createdAt,
  };
}

function membersWhere(ctx: Awaited<ReturnType<typeof requireAdminContext>>) {
  if (ctx.isSuperAdmin) {
    return { organizationId: ctx.organizationId };
  }
  if (ctx.isBranchManager) {
    return {
      organizationId: ctx.organizationId,
      OR: [
        { id: ctx.memberId },
        {
          branchId: { in: ctx.managedBranchIds },
          role: { in: [BRANCH_ADMIN_ROLE, BRANCH_OPERATOR_ROLE] },
        },
        {
          branchScopes: {
            some: { branchId: { in: ctx.managedBranchIds } },
          },
          role: { in: [BRANCH_ADMIN_ROLE, BRANCH_OPERATOR_ROLE] },
        },
      ],
    };
  }
  return {
    organizationId: ctx.organizationId,
    branchId: ctx.branchId!,
    role: { not: SUPER_ADMIN_ROLE },
  };
}

export async function GET() {
  try {
    const ctx = await requireAdminContext();
    if (!canViewStaffUsers(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const members = await prisma.organizationMember.findMany({
      where: membersWhere(ctx),
      include: {
        user: { select: userSelect },
        branch: { select: { id: true, name: true } },
        branchScopes: {
          include: { branch: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ role: "asc" }, { user: { login: "asc" } }],
    });

    const branchWhere = ctx.isSuperAdmin
      ? { organizationId: ctx.organizationId, isActive: true }
      : ctx.isBranchManager
        ? {
            organizationId: ctx.organizationId,
            isActive: true,
            id: { in: ctx.managedBranchIds },
          }
        : {
            organizationId: ctx.organizationId,
            isActive: true,
            id: ctx.branchId!,
          };

    return NextResponse.json({
      users: members.map(mapUser),
      branches: await prisma.branch.findMany({
        where: branchWhere,
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      allBranches: ctx.isSuperAdmin
        ? await prisma.branch.findMany({
            where: { organizationId: ctx.organizationId, isActive: true },
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true },
          })
        : undefined,
      canManageUsers: ctx.isSuperAdmin || ctx.isBranchManager,
      canCreateManagers: ctx.isSuperAdmin,
      canSetPayRates: ctx.isSuperAdmin || ctx.isBranchAdmin || ctx.isBranchManager,
      viewerRole: ctx.role,
    });
  } catch (e) {
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdminContext();
    const body = createSchema.parse(await req.json());
    const login = normalizeStaffLogin(body.login);
    const role = body.role;

    if (role === BRANCH_MANAGER_ROLE && !ctx.isSuperAdmin) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }
    if (!ctx.isSuperAdmin && !ctx.isBranchManager) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    if (role === BRANCH_MANAGER_ROLE) {
      if (!body.branchIds?.length) {
        return NextResponse.json(
          { error: "Выберите филиалы для управляющего" },
          { status: 400 },
        );
      }
      const branches = await prisma.branch.findMany({
        where: {
          id: { in: body.branchIds },
          organizationId: ctx.organizationId,
        },
      });
      if (branches.length !== body.branchIds.length) {
        return NextResponse.json({ error: "Филиал не найден" }, { status: 404 });
      }
    } else if (role !== SUPER_ADMIN_ROLE && !body.branchId) {
      return NextResponse.json(
        { error: "Выберите филиал для сотрудника" },
        { status: 400 },
      );
    }

    if (
      !canAssignRole(
        ctx,
        role,
        body.branchId ?? null,
        body.branchIds,
      )
    ) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    if (body.role === SUPER_ADMIN_ROLE && body.branchId) {
      return NextResponse.json(
        { error: "Супер-админ не привязан к одному филиалу" },
        { status: 400 },
      );
    }

    if (body.branchId) {
      const branch = await prisma.branch.findFirst({
        where: { id: body.branchId, organizationId: ctx.organizationId },
      });
      if (!branch) {
        return NextResponse.json({ error: "Филиал не найден" }, { status: 404 });
      }
    }

    const existing = await prisma.user.findUnique({ where: { login } });
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь с таким логином уже есть" },
        { status: 409 },
      );
    }

    const email = body.email?.trim() || null;
    if (email) {
      const dupEmail = await prisma.user.findUnique({ where: { email } });
      if (dupEmail) {
        return NextResponse.json(
          { error: "Email уже занят" },
          { status: 409 },
        );
      }
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        login,
        email,
        passwordHash,
        name: body.name.trim(),
        lastName: body.lastName.trim(),
        phone: body.phone?.trim() || null,
        passportNumber: body.passportNumber?.trim() || null,
        registrationAddress: body.registrationAddress?.trim() || null,
      },
    });

    const homeBranchId =
      role === BRANCH_MANAGER_ROLE
        ? body.branchIds![0]!
        : role === SUPER_ADMIN_ROLE
          ? null
          : body.branchId!;

    const member = await prisma.organizationMember.create({
      data: {
        organizationId: ctx.organizationId,
        userId: user.id,
        role: body.role,
        branchId: homeBranchId,
      },
    });

    if (role === BRANCH_MANAGER_ROLE && body.branchIds?.length) {
      await prisma.memberBranchScope.createMany({
        data: body.branchIds.map((branchId) => ({
          memberId: member.id,
          branchId,
        })),
      });
    }

    let branchName: string | null = null;
    if (homeBranchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: homeBranchId },
        select: { name: true },
      });
      branchName = branch?.name ?? null;
    }

    logUserCreate(ctx, {
      userId: user.id,
      login: user.login,
      name: user.name ?? body.name,
      lastName: user.lastName ?? body.lastName,
      role: body.role,
      branchName,
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: formatUserZodError(e) }, { status: 400 });
    }
    const handled = handleAdminError(e);
    if (handled) {
      return NextResponse.json({ error: handled.error }, { status: handled.status });
    }
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
