"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Card>
        <CardHeader>
          <CardTitle>Вход в админку</CardTitle>
          <CardDescription>WakeTeam Booking CRM</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4" autoComplete="on">
            <input type="hidden" name="from" value={from} />
            <div className="space-y-2">
              <Label htmlFor="login">Логин</Label>
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
                className="min-h-[44px] text-base"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="min-h-[44px] text-base"
                required
              />
            </div>
            {state?.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              className="min-h-[44px] w-full"
              size="lg"
              disabled={isPending}
            >
              {isPending ? "Вход…" : "Войти"}
            </Button>
          </form>
        </CardContent>
      </Card>
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
