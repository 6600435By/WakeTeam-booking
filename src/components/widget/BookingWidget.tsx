"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveServicePrice } from "@/lib/service-pricing";
import {
  DEFAULT_WIDGET_SETTINGS,
  type WidgetSettings,
  widgetThemeVars,
} from "@/lib/widget-settings";
import { WidgetHelpBar } from "@/components/widget/WidgetHelpBar";
import { WidgetPhotoCard } from "@/components/widget/WidgetPhotoCard";

type Branch = {
  id: string;
  name: string;
  address?: string | null;
  description?: string | null;
  photoUrl?: string | null;
};

type PriceRule = {
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
};

type Service = {
  id: string;
  name: string;
  kind: string;
  durationMinutes: number;
  allowedDurations: string;
  price: number;
  priceFrom: number;
  priceRules: PriceRule[];
  maxBoards?: number;
  staff: { id: string; name: string; kind: string; photoUrl?: string | null }[];
};

type WakeSlot = {
  startAt: string;
  endAt: string;
  staffId: string;
  staffName: string;
  status: "free" | "busy";
};

type SupSlot = {
  startAt: string;
  endAt: string;
  status: "free" | "busy";
  availableBoards: number;
};

type ActivityKind = "wake" | "sup";

type WidgetConfig = {
  branches: Branch[];
  servicesByBranch: Record<string, Service[]>;
  settings: WidgetSettings;
  organization: { currency: string };
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function postHeight(height: number) {
  if (typeof window === "undefined") return;
  window.parent.postMessage(
    JSON.stringify({ height, type: "static", scroll: "no" }),
    "*",
  );
}

function useEmbedHeight(active: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const el = rootRef.current;
    if (!el) return;

    function report() {
      const height = Math.ceil(el!.getBoundingClientRect().height);
      postHeight(height);
    }

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  return rootRef;
}

function formatTariffLine(rule: PriceRule, baseDuration: number): string {
  const days =
    rule.weekdays === "6,7"
      ? "Сб–Вс"
      : rule.weekdays === "1,2,3,4,5"
        ? "Пн–Пт"
        : rule.weekdays;
  return `${days} ${rule.timeFrom}–${rule.timeTo} — ${rule.price} Br / ${baseDuration} мин`;
}

function filterBookableWakeSlots(
  all: WakeSlot[],
  durationMinutes: number,
): WakeSlot[] {
  const step = 10;
  const needed = durationMinutes / step;
  return all.filter((sl, i) => {
    if (sl.status !== "free") return false;
    for (let j = 0; j < needed; j++) {
      const idx = i + j;
      if (!all[idx] || all[idx].status !== "free") return false;
      const expected = new Date(
        new Date(sl.startAt).getTime() + j * step * 60_000,
      ).toISOString();
      if (all[idx].startAt !== expected) return false;
    }
    return true;
  });
}

export function BookingWidget({ slug = "waketeam" }: { slug?: string }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [activityKind, setActivityKind] = useState<ActivityKind | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [date, setDate] = useState(todayStr());
  const [wakeSlots, setWakeSlots] = useState<WakeSlot[]>([]);
  const [supSlots, setSupSlots] = useState<SupSlot[]>([]);
  const [allowedDurations, setAllowedDurations] = useState<number[]>([10, 30, 60]);
  const [selectedWakeSlot, setSelectedWakeSlot] = useState<WakeSlot | null>(null);
  const [selectedSupSlot, setSelectedSupSlot] = useState<SupSlot | null>(null);
  const [supQuantity, setSupQuantity] = useState(1);
  const [configLoading, setConfigLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [configError, setConfigError] = useState("");
  const [error, setError] = useState("");
  const [tariffsOpen, setTariffsOpen] = useState(false);
  const [done, setDone] = useState<{ publicNumber: number; price: number } | null>(
    null,
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");

  const embedRef = useEmbedHeight(true);
  const settings: WidgetSettings = config?.settings ?? DEFAULT_WIDGET_SETTINGS;
  const theme = settings.theme;

  const services = useMemo(
    () => (branchId && config ? (config.servicesByBranch[branchId] ?? []) : []),
    [branchId, config],
  );

  const wakeService = useMemo(
    () => services.find((s) => s.kind === "wake"),
    [services],
  );
  const supService = useMemo(
    () => services.find((s) => s.kind === "sup"),
    [services],
  );

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId],
  );

  const branch = useMemo(
    () => config?.branches.find((b) => b.id === branchId),
    [config, branchId],
  );

  const staffOptions = service?.staff ?? [];

  const bookableWakeStarts = useMemo(
    () => filterBookableWakeSlots(wakeSlots, durationMinutes),
    [wakeSlots, durationMinutes],
  );

  const displayPrice = useMemo(() => {
    if (!service) return null;
    const slot = activityKind === "wake" ? selectedWakeSlot : selectedSupSlot;
    if (!slot) return null;
    const start = new Date(slot.startAt);
    const dur = activityKind === "sup" ? 60 : durationMinutes;
    const unit = resolveServicePrice(
      {
        price: service.price,
        durationMinutes: service.durationMinutes,
        priceRules: service.priceRules,
      },
      start,
      dur,
    );
    return activityKind === "sup" ? unit * supQuantity : unit;
  }, [
    service,
    activityKind,
    selectedWakeSlot,
    selectedSupSlot,
    durationMinutes,
    supQuantity,
  ]);

  const selectedSupAvailable = selectedSupSlot?.availableBoards ?? 0;

  useEffect(() => {
    setConfigLoading(true);
    setConfigError("");
    fetch(`/api/public/widget-config/${slug}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          throw new Error(d.error ?? "Не удалось загрузить конфигурацию");
        }
        setConfig(d);
        if (d.settings?.behavior?.hideBranchStep && d.branches?.length === 1) {
          setBranchId(d.branches[0].id);
          setStep(1);
        }
      })
      .catch((e) => {
        setConfigError(
          e instanceof Error ? e.message : "Не удалось загрузить конфигурацию",
        );
      })
      .finally(() => setConfigLoading(false));
  }, [slug]);

  useEffect(() => {
    if (activityKind !== "wake" || !serviceId || !staffId || !date) return;
    setSlotsLoading(true);
    const q = new URLSearchParams({ serviceId, staffId, date });
    fetch(`/api/public/slots?${q}`)
      .then((r) => r.json())
      .then((d) => {
        setWakeSlots((d.slots ?? []) as WakeSlot[]);
        setAllowedDurations(
          (d.allowedDurations as number[]) ?? [10, 30, 60],
        );
        setSelectedWakeSlot(null);
      })
      .finally(() => setSlotsLoading(false));
  }, [activityKind, serviceId, staffId, date]);

  useEffect(() => {
    if (activityKind !== "sup" || !serviceId || !date) return;
    setSlotsLoading(true);
    const q = new URLSearchParams({ serviceId, date });
    fetch(`/api/public/slots?${q}`)
      .then((r) => r.json())
      .then((d) => {
        setSupSlots((d.slots ?? []) as SupSlot[]);
        setSelectedSupSlot(null);
        setSupQuantity(1);
      })
      .finally(() => setSlotsLoading(false));
  }, [activityKind, serviceId, date]);

  useEffect(() => {
    if (service && activityKind === "wake") {
      const durations = service.allowedDurations
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      if (durations.length && !durations.includes(durationMinutes)) {
        setDurationMinutes(durations[0]);
      }
    }
  }, [service, activityKind, durationMinutes]);

  useEffect(() => {
    if (selectedSupAvailable > 0 && supQuantity > selectedSupAvailable) {
      setSupQuantity(selectedSupAvailable);
    }
  }, [selectedSupAvailable, supQuantity]);

  const pickActivity = (kind: ActivityKind) => {
    const svc = kind === "wake" ? wakeService : supService;
    if (!svc) return;
    setActivityKind(kind);
    setServiceId(svc.id);
    setStaffId("");
    setSelectedWakeSlot(null);
    setSelectedSupSlot(null);
    setStep(2);
  };

  const goBranch = (id: string) => {
    setBranchId(id);
    setActivityKind(null);
    setServiceId("");
    setStaffId("");
    setStep(1);
  };

  const submit = useCallback(async () => {
    if (!serviceId || activityKind === null) return;
    const slot = activityKind === "wake" ? selectedWakeSlot : selectedSupSlot;
    if (!slot) return;

    setSubmitLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        slug,
        serviceId,
        startAt: slot.startAt,
        firstName,
        lastName: lastName || undefined,
        phone,
        email: email || undefined,
        comment: comment || undefined,
      };
      if (activityKind === "wake") {
        body.staffId = selectedWakeSlot!.staffId;
        body.durationMinutes = durationMinutes;
      } else {
        body.quantity = supQuantity;
      }

      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка записи");
      setDone({ publicNumber: data.publicNumber, price: data.price });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitLoading(false);
    }
  }, [
    activityKind,
    selectedWakeSlot,
    selectedSupSlot,
    serviceId,
    durationMinutes,
    supQuantity,
    firstName,
    lastName,
    phone,
    email,
    comment,
    slug,
  ]);

  const stepLabels = settings?.texts.stepLabels ?? [
    "Филиал",
    "Услуга",
    "Реверс",
    "Время",
    "Контакты",
  ];

  const visibleSteps =
    activityKind === "sup"
      ? [stepLabels[0], stepLabels[1], stepLabels[3], stepLabels[4]]
      : stepLabels;

  const stepIndicatorIndex = (() => {
    if (activityKind === "sup") {
      if (step <= 1) return step;
      if (step === 2) return 2;
      return 3;
    }
    return step;
  })();

  if (configLoading) {
    return (
      <div className="animate-pulse rounded-xl bg-slate-100 p-6">
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="mt-4 h-24 rounded bg-slate-200" />
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="rounded-xl bg-red-50 p-5 text-sm text-red-700 ring-1 ring-red-200">
        <p className="font-medium">Не удалось загрузить виджет</p>
        <p className="mt-1">{configError || "Проверьте подключение к серверу"}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div
        ref={embedRef}
        className="rounded-xl p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
        style={{ background: theme.cardBackground, ...widgetThemeVars(theme) }}
      >
        <h2 className="text-lg font-semibold" style={{ color: theme.primaryColor }}>
          {settings.texts.successTitle}
        </h2>
        <p className="mt-2 text-slate-600">
          Номер записи: <strong>#{done.publicNumber}</strong>
        </p>
        <p className="mt-1 text-slate-600">
          Стоимость: <strong>{done.price} Br</strong>
        </p>
        <p className="mt-2 text-sm text-slate-500">{settings.texts.successMessage}</p>
      </div>
    );
  }

  const btnClass =
    "min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors";
  const btnActive = { background: theme.buttonBg, color: theme.buttonText };
  const btnOutline = {
    background: theme.cardBackground,
    border: "1px solid #e2e8f0",
  };

  return (
    <div
      ref={embedRef}
      className="rounded-xl p-4 sm:p-6"
      style={{ background: theme.pageBackground, ...widgetThemeVars(theme) }}
      id="waketeam-booking-root"
    >
      <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
        {settings.texts.title}
      </h1>
      <p className="mt-1 text-sm text-slate-600">{settings.texts.subtitle}</p>

      <div className="mt-4 flex flex-wrap gap-1 text-xs font-medium">
        {visibleSteps.map((label, i) => (
          <span
            key={label}
            className="rounded px-2.5 py-1.5"
            style={{
              background:
                i === stepIndicatorIndex
                  ? theme.stepActiveBg
                  : i < stepIndicatorIndex
                    ? theme.stepInactiveBg
                    : "#e2e8f0",
              color:
                i === stepIndicatorIndex
                  ? theme.buttonText
                  : i < stepIndicatorIndex
                    ? "#fff"
                    : "#475569",
            }}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {step === 0 && (
        <div className="mt-4 space-y-3">
          {config!.branches.map((b) => (
            <WidgetPhotoCard
              key={b.id}
              kind="branch"
              title={b.name}
              subtitle={b.description ?? b.address}
              photoUrl={b.photoUrl}
              onClick={() => goBranch(b.id)}
            />
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="mt-4 space-y-3">
          <BackButton onClick={() => setStep(0)} />
          {wakeService && (
            <ActivityCard
              title={settings.texts.wakeLabel}
              priceHint={`от ${wakeService.priceFrom} Br`}
              subtitle="зависит от дня и времени"
              onClick={() => pickActivity("wake")}
              theme={theme}
            >
              {settings.behavior.showTariffsExpandable &&
                wakeService.priceRules.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs underline"
                      style={{ color: theme.primaryColor }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTariffsOpen((v) => !v);
                      }}
                    >
                      Тарифы
                    </button>
                    {tariffsOpen && (
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {wakeService.priceRules.map((r, i) => (
                          <li key={i}>{formatTariffLine(r, wakeService.durationMinutes)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
            </ActivityCard>
          )}
          {supService && (
            <ActivityCard
              title={settings.texts.supLabel}
              priceHint={`от ${supService.price} Br`}
              subtitle="60 мин, доски назначаются автоматически"
              onClick={() => pickActivity("sup")}
              theme={theme}
            />
          )}
        </div>
      )}

      {step === 2 && activityKind === "wake" && service && (
        <div className="mt-4 space-y-3">
          <BackButton onClick={() => setStep(1)} />
          <p className="text-sm text-slate-600">{branch?.name}</p>
          {staffOptions.map((st) => (
            <WidgetPhotoCard
              key={st.id}
              kind="staff"
              title={st.name}
              photoUrl={st.photoUrl}
              onClick={() => {
                setStaffId(st.id);
                setStep(3);
              }}
            />
          ))}
        </div>
      )}

      {step === 2 && activityKind === "sup" && service && (
        <DateTimeStep
          kind="sup"
          date={date}
          setDate={setDate}
          durationMinutes={60}
          allowedDurations={[60]}
          showDurationPicker={false}
          slotsLoading={slotsLoading}
          supSlots={supSlots}
          selectedSupSlot={selectedSupSlot}
          setSelectedSupSlot={setSelectedSupSlot}
          supQuantity={supQuantity}
          setSupQuantity={setSupQuantity}
          displayPrice={displayPrice}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          btnClass={btnClass}
          btnActive={btnActive}
          theme={theme}
        />
      )}

      {step === 3 && activityKind === "wake" && service && (
        <DateTimeStep
          kind="wake"
          date={date}
          setDate={setDate}
          durationMinutes={durationMinutes}
          setDurationMinutes={setDurationMinutes}
          allowedDurations={allowedDurations}
          showDurationPicker
          slotsLoading={slotsLoading}
          wakeSlots={wakeSlots}
          bookableWakeStarts={bookableWakeStarts}
          selectedWakeSlot={selectedWakeSlot}
          setSelectedWakeSlot={(sl) => {
            setSelectedWakeSlot(sl);
            if (sl) setStep(4);
          }}
          displayPrice={displayPrice}
          emptyHint={settings.texts.emptySlotsHint}
          otherBranches={config!.branches.filter((b) => b.id !== branchId)}
          onSwitchBranch={(id) => {
            goBranch(id);
            setActivityKind("wake");
            if (wakeService) setServiceId(wakeService.id);
            setStep(2);
          }}
          onBack={() => setStep(2)}
          btnClass={btnClass}
          btnActive={btnActive}
          theme={theme}
        />
      )}

      {step === 3 && activityKind === "sup" && selectedSupSlot && (
        <ContactsStep
          summary={`${branch?.name} · ${settings.texts.supLabel} · ${supQuantity} шт. · 60 мин · ${new Date(selectedSupSlot.startAt).toLocaleString("ru-RU", { timeZone: "Europe/Minsk" })}`}
          displayPrice={displayPrice}
          firstName={firstName}
          setFirstName={setFirstName}
          lastName={lastName}
          setLastName={setLastName}
          phone={phone}
          setPhone={setPhone}
          email={email}
          setEmail={setEmail}
          comment={comment}
          setComment={setComment}
          submitLabel={settings.texts.submitButton}
          loading={submitLoading}
          onBack={() => setStep(2)}
          onSubmit={submit}
          btnClass={btnClass}
          btnActive={btnActive}
        />
      )}

      {step === 4 && activityKind === "wake" && selectedWakeSlot && service && (
        <ContactsStep
          summary={`${branch?.name} · ${settings.texts.wakeLabel} · ${durationMinutes} мин · ${new Date(selectedWakeSlot.startAt).toLocaleString("ru-RU", { timeZone: "Europe/Minsk" })}`}
          displayPrice={displayPrice}
          firstName={firstName}
          setFirstName={setFirstName}
          lastName={lastName}
          setLastName={setLastName}
          phone={phone}
          setPhone={setPhone}
          email={email}
          setEmail={setEmail}
          comment={comment}
          setComment={setComment}
          submitLabel={settings.texts.submitButton}
          loading={submitLoading}
          onBack={() => setStep(3)}
          onSubmit={submit}
          btnClass={btnClass}
          btnActive={btnActive}
        />
      )}

      <WidgetHelpBar
        label={settings.texts.callAdminLabel}
        phone={settings.texts.callAdminPhone}
      />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-slate-600 hover:text-slate-900"
    >
      ← Назад
    </button>
  );
}

function ActivityCard({
  title,
  priceHint,
  subtitle,
  onClick,
  theme,
  children,
}: {
  title: string;
  priceHint: string;
  subtitle: string;
  onClick: () => void;
  theme: WidgetSettings["theme"];
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 px-4 py-3.5 text-left hover:border-[var(--widget-primary)] active:bg-lime-50 sm:flex-row sm:items-center sm:justify-between"
      style={{ background: theme.cardBackground }}
    >
      <div>
        <span className="font-medium text-slate-800">{title}</span>
        <p className="text-xs text-slate-500">{subtitle}</p>
        {children}
      </div>
      <span className="text-sm text-slate-600 sm:shrink-0">{priceHint}</span>
    </button>
  );
}

function DateTimeStep(props: {
  kind: ActivityKind;
  date: string;
  setDate: (d: string) => void;
  durationMinutes: number;
  setDurationMinutes?: (d: number) => void;
  allowedDurations: number[];
  showDurationPicker: boolean;
  slotsLoading: boolean;
  wakeSlots?: WakeSlot[];
  bookableWakeStarts?: WakeSlot[];
  selectedWakeSlot?: WakeSlot | null;
  setSelectedWakeSlot?: (s: WakeSlot | null) => void;
  supSlots?: SupSlot[];
  selectedSupSlot?: SupSlot | null;
  setSelectedSupSlot?: (s: SupSlot | null) => void;
  supQuantity?: number;
  setSupQuantity?: (n: number) => void;
  displayPrice: number | null;
  emptyHint?: string;
  otherBranches?: Branch[];
  onSwitchBranch?: (id: string) => void;
  onBack: () => void;
  onNext?: () => void;
  btnClass: string;
  btnActive: React.CSSProperties;
  theme: WidgetSettings["theme"];
}) {
  const slots =
    props.kind === "wake"
      ? (props.wakeSlots ?? [])
      : (props.supSlots ?? []).filter((s) => s.availableBoards > 0);

  const bookable =
    props.kind === "wake" ? (props.bookableWakeStarts ?? []) : slots;

  const maxQty = props.selectedSupSlot?.availableBoards ?? 1;

  return (
    <div className="mt-4">
      <BackButton onClick={props.onBack} />

      {props.showDurationPicker && props.setDurationMinutes && (
        <>
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Длительность
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {props.allowedDurations.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => props.setDurationMinutes!(d)}
                className={props.btnClass}
                style={
                  props.durationMinutes === d
                    ? props.btnActive
                    : { background: props.theme.cardBackground, border: "1px solid #e2e8f0" }
                }
              >
                {d} мин
              </button>
            ))}
          </div>
        </>
      )}

      <label className="mt-4 block text-sm font-medium text-slate-700">Дата</label>
      <input
        type="date"
        value={props.date}
        min={todayStr()}
        onChange={(e) => props.setDate(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
        style={{ background: props.theme.cardBackground }}
      />

      {props.slotsLoading && (
        <p className="mt-2 text-sm text-slate-500">Загрузка слотов…</p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {props.kind === "wake" &&
          (props.wakeSlots ?? []).map((sl) => {
            const time = new Date(sl.startAt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Minsk",
            });
            const canBook = bookable.some((b) => b.startAt === sl.startAt);
            return canBook ? (
              <button
                key={sl.startAt}
                type="button"
                onClick={() => props.setSelectedWakeSlot?.(sl)}
                className={`${props.btnClass} sm:min-w-[4rem]`}
                style={props.btnActive}
              >
                {time}
              </button>
            ) : (
              <span
                key={sl.startAt}
                className="hidden min-h-[44px] rounded-md bg-slate-200 px-2 py-2.5 text-center text-sm text-slate-400 sm:inline-block sm:min-w-[4rem]"
              >
                {time}
              </span>
            );
          })}

        {props.kind === "sup" &&
          (props.supSlots ?? [])
            .filter((s) => s.availableBoards > 0)
            .map((sl) => {
            const time = new Date(sl.startAt).toLocaleTimeString("ru-RU", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Minsk",
            });
            const selected = props.selectedSupSlot?.startAt === sl.startAt;
            return (
              <button
                key={sl.startAt}
                type="button"
                onClick={() => props.setSelectedSupSlot?.(sl)}
                className={`${props.btnClass} sm:min-w-[4rem]`}
                style={selected ? props.btnActive : { background: props.theme.cardBackground, border: "1px solid #e2e8f0" }}
              >
                {time}
              </button>
            );
          })}
      </div>

      {!props.slotsLoading && slots.length === 0 && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">
          <p>Нет слотов на эту дату</p>
          {props.kind === "wake" && props.otherBranches && props.otherBranches.length > 0 && (
            <>
              <p className="mt-2">{props.emptyHint}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {props.otherBranches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:border-[var(--widget-primary)]"
                    onClick={() => props.onSwitchBranch?.(b.id)}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {props.kind === "sup" && props.selectedSupSlot && (
        <div className="mt-4 space-y-3 rounded-lg bg-white p-3">
          <p className="text-sm font-medium text-slate-700">
            Доступно: {props.selectedSupSlot.availableBoards}
          </p>
          <label className="block text-sm font-medium text-slate-700">
            Количество сапов
          </label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => props.setSupQuantity?.(n)}
                className={props.btnClass}
                style={
                  props.supQuantity === n
                    ? props.btnActive
                    : { background: props.theme.cardBackground, border: "1px solid #e2e8f0" }
                }
              >
                {n}
              </button>
            ))}
          </div>
          {props.displayPrice != null && (
            <p className="text-sm text-slate-700">
              Стоимость: <strong>{props.displayPrice} Br</strong>
            </p>
          )}
          <button
            type="button"
            disabled={!props.supQuantity}
            onClick={props.onNext}
            className={`${props.btnClass} w-full`}
            style={props.btnActive}
          >
            Далее
          </button>
        </div>
      )}

      {props.kind === "wake" && props.displayPrice != null && props.selectedWakeSlot && (
        <p className="mt-3 text-sm text-slate-700">
          Стоимость: <strong>{props.displayPrice} Br</strong>
        </p>
      )}
    </div>
  );
}

function ContactsStep({
  summary,
  displayPrice,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  phone,
  setPhone,
  email,
  setEmail,
  comment,
  setComment,
  submitLabel,
  loading,
  onBack,
  onSubmit,
  btnClass,
  btnActive,
}: {
  summary: string;
  displayPrice: number | null;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  submitLabel: string;
  loading: boolean;
  onBack: () => void;
  onSubmit: () => void;
  btnClass: string;
  btnActive: React.CSSProperties;
}) {
  return (
    <div className="mt-4 space-y-3">
      <BackButton onClick={onBack} />
      <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-600">{summary}</p>
      {displayPrice != null && (
        <p className="text-sm text-slate-700">
          Стоимость: <strong>{displayPrice} Br</strong>
        </p>
      )}
      <input
        placeholder="Имя *"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        autoComplete="given-name"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
      />
      <input
        placeholder="Фамилия"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        autoComplete="family-name"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
      />
      <input
        placeholder="Телефон *"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoComplete="tel"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
      />
      <input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
      />
      <textarea
        placeholder="Комментарий"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
        rows={2}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !firstName || !phone}
        className={`${btnClass} w-full disabled:opacity-50`}
        style={btnActive}
      >
        {loading ? "Отправка…" : submitLabel}
      </button>
    </div>
  );
}
