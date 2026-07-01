import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "booking_session";
const SESSION_PREFIX = "session:";

export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

function sessionTtlMs(): number {
  const raw = process.env.SESSION_TTL_MS?.trim();
  if (!raw) return SESSION_TTL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : SESSION_TTL_MS;
}

function parseSessionValue(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(value) as SessionPayload;
    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function purgeExpiredSessions(): Promise<void> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: SESSION_PREFIX } },
    select: { key: true, value: true },
  });
  const now = Date.now();
  const expiredKeys = rows
    .filter((row) => {
      const payload = parseSessionValue(row.value);
      return !payload || now > payload.expiresAt;
    })
    .map((row) => row.key);
  if (expiredKeys.length === 0) return;
  await prisma.appSetting.deleteMany({ where: { key: { in: expiredKeys } } });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyUser(login: string, password: string) {
  const normalized = login.trim();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ login: normalized }, { email: normalized.toLowerCase() }],
    },
  });
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
  });
  if (!membership) return null;
  if (
    membership.role !== "super_admin" &&
    membership.role !== "admin" &&
    !membership.branchId
  ) {
    return null;
  }

  return user;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + sessionTtlMs();
  const value = JSON.stringify({ userId, expiresAt } satisfies SessionPayload);
  await prisma.appSetting.create({
    data: { key: `${SESSION_PREFIX}${token}`, value },
  });
  void purgeExpiredSessions();
  return token;
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: Math.floor(sessionTtlMs() / 1000),
  };
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;

  const row = await prisma.appSetting.findUnique({
    where: { key: `${SESSION_PREFIX}${token}` },
  });
  if (!row) return null;

  const payload = parseSessionValue(row.value);
  if (!payload) {
    await prisma.appSetting.deleteMany({ where: { key: `${SESSION_PREFIX}${token}` } });
    return null;
  }

  if (Date.now() > payload.expiresAt) {
    await prisma.appSetting.deleteMany({ where: { key: `${SESSION_PREFIX}${token}` } });
    return null;
  }

  return prisma.user.findUnique({ where: { id: payload.userId } });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (token) {
    await prisma.appSetting.deleteMany({ where: { key: `${SESSION_PREFIX}${token}` } });
    cookieStore.delete(COOKIE);
  }
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export const SESSION_COOKIE = COOKIE;
