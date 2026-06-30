import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, SESSION_COOKIE, sessionCookieOptions, verifyUser } from "@/lib/auth";

const schema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  from: z.string().optional(),
});

function safeRedirectPath(from?: string): string {
  if (from && from.startsWith("/admin") && !from.startsWith("/admin/login")) {
    return from;
  }
  return "/admin/journal";
}

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const user = await verifyUser(body.login.trim(), body.password);
    if (!user) {
      return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    }
    const secure = req.nextUrl.protocol === "https:";
    const token = await createSession(user.id);
    const target = safeRedirectPath(body.from);
    const response = NextResponse.redirect(new URL(target, req.url));
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(secure));
    return response;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
