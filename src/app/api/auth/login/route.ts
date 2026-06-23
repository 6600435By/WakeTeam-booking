import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyUser } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const user = await verifyUser(body.email, body.password);
    if (!user) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
    }
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
