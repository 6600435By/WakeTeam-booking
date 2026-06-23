import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";

const COOKIE = "booking_session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
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

export async function createSession(userId: string) {
  const token = Buffer.from(`${userId}:${Date.now()}`).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  await prisma.appSetting.upsert({
    where: { key: `session:${token}` },
    create: { key: `session:${token}`, value: userId },
    update: { value: userId },
  });
  return token;
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  const row = await prisma.appSetting.findUnique({
    where: { key: `session:${token}` },
  });
  if (!row) return null;
  return prisma.user.findUnique({ where: { id: row.value } });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (token) {
    await prisma.appSetting.deleteMany({ where: { key: `session:${token}` } });
    cookieStore.delete(COOKIE);
  }
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export const SESSION_COOKIE = COOKIE;
