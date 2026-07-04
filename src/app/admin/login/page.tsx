"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/admin/journal";
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[color-mix(in_oklch,var(--muted)_40%,var(--background))] px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-5">
        <header className="space-y-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            <ChevronLeft className="size-4 shrink-0" strokeWidth={2.25} />
            На главную
          </Link>
          <div className="space-y-2">
            <Badge
              variant="secondary"
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
            >
              WakeTeam
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">
              WakeTeamCRM
            </h1>
          </div>
        </header>

        <Card className="shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardHeader className="border-b border-border/60 pb-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <ShieldCheck className="size-5" strokeWidth={2} />
              </span>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-base font-semibold">
                  Вход в админ-панель
                </CardTitle>
                <CardDescription>
                  Введите логин и пароль сотрудника
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <form action={formAction} className="space-y-3.5" autoComplete="on">
              <input type="hidden" name="from" value={from} />
              <div className="space-y-1.5">
                <Label htmlFor="login" className="text-sm font-medium text-slate-700">
                  Логин
                </Label>
                <Input
                  id="login"
                  name="login"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  defaultValue="admin"
                  placeholder="Фамилия или логин"
                  className="h-11 rounded-xl border-slate-200 bg-white text-base sm:text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-700"
                >
                  Пароль
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 rounded-xl border-slate-200 bg-white text-base sm:text-sm"
                  required
                />
              </div>
              {state?.error && (
                <Alert variant="destructive" className="rounded-xl py-2.5">
                  <AlertDescription className="text-sm">
                    {state.error}
                  </AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                className="mt-1 h-11 w-full rounded-xl text-sm font-semibold"
                size="lg"
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Вход…
                  </>
                ) : (
                  "Войти"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
