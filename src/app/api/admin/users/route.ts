import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertSuperAdmin,
  BRANCH_ADMIN_ROLE,
  BRANCH_OPERATOR_ROLE,
  canViewStaffUsers,
  handleAdminError,
  parseAdminRole,
  requireAdminContext,
  roleLabel,
  SUPER_ADMIN_ROLE,
} from "@/lib/admin-access";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeStaffLogin } from "@/lib/staff-user";

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
  role: z.enum([SUPER_ADMIN_ROLE, BRANCH_ADMIN_ROLE, BRANCH_OPERATOR_ROLE]),
  branchId: z.string().nullable().optional(),
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
    createdAt: m.user.createdAt,
  };
}

export async function GET() {
  try {
    const ctx = await requireAdminContext();
    if (!canViewStaffUsers(ctx)) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    const members = await prisma.organizationMember.findMany({
      where: ctx.isBranchAdmin
        ? {
            organizationId: ctx.organizationId,
            branchId: ctx.branchId!,
            role: { not: SUPER_ADMIN_ROLE },
          }
        : { organizationId: ctx.organizationId },
      include: {
        user: { select: userSelect },
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { user: { login: "asc" } }],
    });

    return NextResponse.json({
      users: members.map(mapUser),
      branches: await prisma.branch.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
      canManageUsers: ctx.isSuperAdmin,
      canSetPayRates: ctx.isSuperAdmin || ctx.isBranchAdmin,
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
    assertSuperAdmin(ctx);
    const body = createSchema.parse(await req.json());
    const login = normalizeStaffLogin(body.login);

    if (body.role !== SUPER_ADMIN_ROLE && !body.branchId) {
      return NextResponse.json(
        { error: "Выберите филиал для сотрудника" },
        { status: 400 },
      );
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

    await prisma.organizationMember.create({
      data: {
        organizationId: ctx.organizationId,
        userId: user.id,
        role: body.role,
        branchId: body.role === SUPER_ADMIN_ROLE ? null : body.branchId!,
      },
    });

    return NextResponse.json({ ok: true, userId: user.id });
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
