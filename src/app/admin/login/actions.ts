"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyUser,
} from "@/lib/auth";

export type LoginState = { error?: string } | null;

function safeRedirectPath(from: unknown): string {
  if (
    typeof from === "string" &&
    from.startsWith("/admin") &&
    !from.startsWith("/admin/login")
  ) {
    return from;
  }
  return "/admin/journal";
}

async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }
  return false;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = safeRedirectPath(formData.get("from"));

  if (!email || !password) {
    return { error: "Введите email и пароль" };
  }

  const user = await verifyUser(email, password);
  if (!user) {
    return { error: "Неверный email или пароль" };
  }

  const token = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(await isSecureRequest()));
  redirect(from);
}
