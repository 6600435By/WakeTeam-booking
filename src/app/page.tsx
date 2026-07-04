import Link from "next/link";
import { ArrowRight, CalendarClock, LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const links = [
  {
    href: "/book/waketeam",
    title: "Публичный виджет записи",
    description: "Онлайн-бронирование для клиентов",
    icon: CalendarClock,
  },
  {
    href: "/admin/login",
    title: "Вход в админ-панель",
    description: "Журнал, расписание и настройки",
    icon: LayoutDashboard,
  },
] as const;

export default function HomePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[color-mix(in_oklch,var(--muted)_40%,var(--background))] px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md space-y-5">
        <header className="space-y-2">
          <Badge
            variant="secondary"
            className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          >
            WakeTeam
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">
            WakeTeamCRM
          </h1>
        </header>

        <Card className="gap-0 py-0 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)]">
          <CardContent className="grid gap-2 p-4">
            {links.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-muted/30 hover:shadow-sm active:translate-y-0"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-slate-600">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {item.description}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600"
                    strokeWidth={2.25}
                  />
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
