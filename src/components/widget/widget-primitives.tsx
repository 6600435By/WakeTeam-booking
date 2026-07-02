"use client";

import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Phone,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatAdminPhone, type WidgetTheme } from "@/lib/widget-settings";
import { buildBookingIcs, downloadIcsFile } from "@/lib/calendar-ics";
import { sanitizeWidgetPhoneInput } from "@/lib/phone";
import { cn } from "@/lib/utils";

export const WIDGET_TOUCH_MIN = "min-h-11";
export const WIDGET_ICON_SM = "size-4 shrink-0";
export const WIDGET_ICON_MD = "size-5 shrink-0";

export function widgetBtnStyle(theme: WidgetTheme): CSSProperties {
  return {
    background: theme.buttonBg,
    color: theme.buttonText,
  };
}

export function widgetOutlineStyle(theme: WidgetTheme): CSSProperties {
  return {
    background: theme.cardBackground,
    borderColor: "color-mix(in oklch, var(--widget-primary) 18%, #e2e8f0)",
  };
}

export function WidgetShell({
  children,
  className,
  style,
  id,
  embedRef,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  embedRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={embedRef}
      id={id}
      className={cn(
        "@container relative overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.04)] ring-1 ring-black/[0.06]",
        className,
      )}
      style={style}
    >
      <div className="px-3.5 py-3 sm:px-4 sm:py-3.5">{children}</div>
    </div>
  );
}

export function WidgetStepEnter({
  children,
  stepKey,
  className,
}: {
  children: ReactNode;
  stepKey: string | number;
  className?: string;
}) {
  return (
    <div key={stepKey} className={cn("widget-step-enter", className)}>
      {children}
    </div>
  );
}

export function WidgetHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-0.5">
      <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
        {title}
      </h1>
      {subtitle ? (
        <p className="text-sm leading-snug text-slate-500">{subtitle}</p>
      ) : null}
    </header>
  );
}

export function WidgetStepProgress({
  steps,
  activeIndex,
  theme,
  onStepClick,
  canNavigateTo,
}: {
  steps: string[];
  activeIndex: number;
  theme: WidgetTheme;
  onStepClick: (index: number) => void;
  canNavigateTo: (index: number) => boolean;
}) {
  return (
    <nav aria-label="Шаги записи" className="mt-2.5">
      <ol className="flex items-start gap-0">
        {steps.map((label, i) => {
          const isActive = i === activeIndex;
          const isDone = i < activeIndex;
          const clickable = isActive || isDone || canNavigateTo(i);

          return (
            <li
              key={`${label}-${i}`}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center",
                i < steps.length - 1 && "relative",
              )}
            >
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-[13px] left-[calc(50%+14px)] h-px w-[calc(100%-28px)]"
                  style={{
                    background: isDone
                      ? theme.stepInactiveBg
                      : "rgb(226 232 240)",
                  }}
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStepClick(i)}
                className={cn(
                  "relative z-[1] flex flex-col items-center gap-1 transition-opacity",
                  clickable
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-45",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-all duration-200 sm:size-8",
                    isActive && "scale-105 shadow-sm ring-2 ring-black/5",
                  )}
                  style={{
                    background: isActive
                      ? theme.stepActiveBg
                      : isDone
                        ? theme.stepInactiveBg
                        : "#f1f5f9",
                    color: isActive || isDone ? theme.buttonText : "#64748b",
                  }}
                >
                  {isDone && !isActive ? (
                    <CheckCircle2 className={WIDGET_ICON_SM} strokeWidth={2.25} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "hidden max-w-[5.5rem] truncate text-center text-[11px] leading-tight font-medium sm:block",
                    isActive ? "text-slate-900" : "text-slate-500",
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-center text-xs font-medium text-slate-600 sm:hidden">
        {steps[activeIndex]}
      </p>
    </nav>
  );
}

export function WidgetBackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="-ml-2 h-8 gap-1 px-2 text-slate-600 hover:text-slate-900"
    >
      <ChevronLeft className={WIDGET_ICON_SM} strokeWidth={2.25} />
      Назад
    </Button>
  );
}

export function WidgetPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  loadingLabel,
  className,
  theme,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
  theme: WidgetTheme;
  type?: "button" | "submit";
}) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        WIDGET_TOUCH_MIN,
        "w-full rounded-xl text-sm font-semibold shadow-none transition-transform active:scale-[0.99] disabled:opacity-50",
        className,
      )}
      style={widgetBtnStyle(theme)}
    >
      {loading ? (
        <>
          <Loader2 className={cn(WIDGET_ICON_SM, "animate-spin")} />
          <span>{loadingLabel ?? "…"}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function WidgetChoiceButton({
  children,
  selected,
  disabled,
  onClick,
  theme,
  className,
  "aria-pressed": ariaPressed,
}: {
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  theme: WidgetTheme;
  className?: string;
  "aria-pressed"?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={ariaPressed}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-lg border px-2.5 text-sm font-medium tabular-nums transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--widget-primary)]/35",
        disabled && "cursor-not-allowed opacity-40",
        selected && "scale-[1.02] shadow-sm ring-2 ring-[var(--widget-primary)]/25",
        className,
      )}
      style={
        selected
          ? widgetBtnStyle(theme)
          : disabled
            ? { background: "#f1f5f9", color: "#94a3b8", borderColor: "#e2e8f0" }
            : widgetOutlineStyle(theme)
      }
    >
      {children}
    </button>
  );
}

export function WidgetChipButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border-slate-200 bg-white px-3.5 text-sm font-medium hover:border-[var(--widget-primary)]/50 hover:bg-white",
        className,
      )}
    >
      {children}
    </Button>
  );
}

export function WidgetSummaryCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-600",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WidgetPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-slate-200/80 bg-white p-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WidgetField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

export function WidgetTextInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(
        "h-11 rounded-xl border-slate-200 bg-white text-base sm:text-sm",
        props.className,
      )}
    />
  );
}

export function WidgetPhoneInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <WidgetTextInput
      id={id}
      name="waketeam-booking-phone"
      type="tel"
      value={value}
      readOnly
      onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
      onChange={(e) => onChange(sanitizeWidgetPhoneInput(e.target.value))}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      inputMode="tel"
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
    />
  );
}

export function WidgetTextArea(props: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      {...props}
      className={cn(
        "min-h-[5.5rem] rounded-xl border-slate-200 bg-white text-base sm:text-sm",
        props.className,
      )}
    />
  );
}

export function WidgetLoadingSkeleton() {
  return (
    <WidgetShell className="bg-white">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      <div className="mt-5 flex justify-between gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="size-9 rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-6 h-28 w-full rounded-xl" />
      <Skeleton className="mt-3 h-28 w-full rounded-xl" />
    </WidgetShell>
  );
}

export function WidgetErrorState({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="rounded-xl">
      <AlertDescription>
        <p className="font-medium">Не удалось загрузить виджет</p>
        <p className="mt-1 text-sm opacity-90">{message}</p>
      </AlertDescription>
    </Alert>
  );
}

export function WidgetInlineError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="mt-2 rounded-xl py-2.5">
      <AlertDescription className="text-sm">{message}</AlertDescription>
    </Alert>
  );
}

export function WidgetSuccessScreen({
  title,
  publicNumber,
  price,
  branchName,
  resourceLabel,
  sessionStartAt,
  sessionStartIso,
  sessionEndIso,
  bookedMinutes,
  adminPhone,
  theme,
  embedRef,
}: {
  title: string;
  publicNumber: number;
  price: number;
  branchName: string;
  resourceLabel: string;
  sessionStartAt: string;
  sessionStartIso: string;
  sessionEndIso: string;
  bookedMinutes: number;
  adminPhone: string;
  theme: WidgetTheme;
  embedRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const canAddToCalendar = Boolean(sessionStartIso && sessionEndIso);
  const adminPhoneDisplay = formatAdminPhone(adminPhone);

  function handleAddToCalendar() {
    if (!sessionStartIso || !sessionEndIso) return;
    const ics = buildBookingIcs({
      uid: `waketeam-booking-${publicNumber}@waketeam.by`,
      startIso: sessionStartIso,
      endIso: sessionEndIso,
      summary: `${resourceLabel} · ${branchName}`,
      description: [
        `Запись #${publicNumber}`,
        branchName,
        resourceLabel,
        `${bookedMinutes} мин`,
        `${price} Br`,
        adminPhone ? `Тел. администратора: ${adminPhoneDisplay}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      location: branchName || undefined,
    });
    downloadIcsFile(ics, `waketeam-${publicNumber}.ics`);
  }

  const details: { label: string; value: string; strong?: boolean }[] = [
    { label: "Номер записи", value: `#${publicNumber}`, strong: true },
    ...(branchName ? [{ label: "Филиал", value: branchName, strong: true }] : []),
    ...(resourceLabel
      ? [{ label: "Вид ресурса", value: resourceLabel, strong: true }]
      : []),
    ...(sessionStartAt
      ? [{ label: "Начало сеанса", value: sessionStartAt, strong: true }]
      : []),
    {
      label: "Забронировано",
      value: `${bookedMinutes} мин`,
      strong: true,
    },
    { label: "Стоимость", value: `${price} Br`, strong: true },
  ];

  return (
    <WidgetShell
      embedRef={embedRef}
      style={{ background: theme.cardBackground }}
      className="widget-step-enter bg-white text-center sm:text-left"
    >
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div
          className="flex size-12 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${theme.primaryColor}22` }}
        >
          <CheckCircle2
            className="size-6"
            strokeWidth={2}
            style={{ color: theme.primaryColor }}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: theme.primaryColor }}
          >
            {title}
          </h2>
          <dl className="space-y-2 text-sm">
            {details.map((row) => (
              <div
                key={row.label}
                className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <dt className="text-slate-500">{row.label}</dt>
                <dd
                  className={cn(
                    "text-slate-900 sm:text-right",
                    row.strong && "font-semibold",
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          {canAddToCalendar && (
            <Button
              type="button"
              variant="outline"
              onClick={handleAddToCalendar}
              className={cn(
                WIDGET_TOUCH_MIN,
                "w-full gap-2 rounded-xl border-slate-200 text-sm font-medium text-slate-800 hover:bg-slate-50",
              )}
            >
              <CalendarPlus className={WIDGET_ICON_SM} strokeWidth={2.25} />
              Добавить в календарь
            </Button>
          )}
        </div>
      </div>
    </WidgetShell>
  );
}

export function WidgetStatusText({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "warning";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-sm",
        tone === "warning" ? "text-amber-700" : "text-slate-500",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function WidgetPriceBadge({ children }: { children: ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums sm:text-sm"
    >
      {children}
    </Badge>
  );
}

export function WidgetCalendarLink({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-0.5 flex items-center gap-1.5 text-xs font-medium text-[var(--widget-primary)] transition-opacity hover:opacity-80"
    >
      <CalendarDays className="size-3.5 shrink-0" strokeWidth={2.25} />
      Выбрать дату в календаре
    </button>
  );
}

export function WidgetDateNavButton({
  direction,
  disabled,
  onClick,
  label,
}: {
  direction: "prev" | "next";
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <Icon className={WIDGET_ICON_MD} strokeWidth={2} />
    </button>
  );
}

export function WidgetHelpFooter({
  label,
  phone,
  displayPhone,
  compact,
  open,
  onToggle,
}: {
  label: string;
  phone: string;
  displayPhone: string;
  compact?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cn(compact ? "mt-3" : "mt-4")}>
      <Separator className="mb-2 bg-slate-200/80" />
      <div className="text-center">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "inline-flex items-center gap-1.5 font-medium text-[var(--widget-primary)] transition-opacity hover:opacity-80",
            compact ? "text-xs" : "text-sm",
          )}
        >
          <Phone className="size-3.5 shrink-0" strokeWidth={2.25} />
          {label}
        </button>
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out",
            open ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center justify-center gap-1.5 text-base font-semibold tracking-tight text-slate-800 hover:underline"
            >
              {displayPhone}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
