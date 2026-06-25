"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveServicePrice } from "@/lib/service-pricing";
import { formatDateKey } from "@/lib/time";
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
  return formatDateKey(new Date());
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

const WAKE_CELL_MINUTES = 10;

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Minsk",
  });
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

const MAX_AUTO_DATE_SCAN_DAYS = 45;

function wakeHasFree(slots: WakeSlot[]) {
  return slots.some((s) => s.status === "free");
}

function supHasFree(slots: SupSlot[]) {
  return slots.some((s) => s.availableBoards > 0);
}

async function fetchWakeSlots(serviceId: string, staffId: string, date: string) {
  const q = new URLSearchParams({ serviceId, staffId, date });
  const r = await fetch(`/api/public/slots?${q}`);
  const d = await r.json();
  return (d.slots ?? []) as WakeSlot[];
}

async function fetchSupSlots(serviceId: string, date: string) {
  const q = new URLSearchParams({ serviceId, date });
  const r = await fetch(`/api/public/slots?${q}`);
  const d = await r.json();
  return (d.slots ?? []) as SupSlot[];
}

async function branchHasFreeSlots(
  config: WidgetConfig,
  targetBranchId: string,
  kind: ActivityKind,
  date: string,
): Promise<boolean> {
  const services = config.servicesByBranch[targetBranchId] ?? [];
  const svc = services.find((s) => s.kind === kind);
  if (!svc) return false;
  if (kind === "sup") {
    const slots = await fetchSupSlots(svc.id, date);
    return supHasFree(slots);
  }
  for (const st of svc.staff) {
    const slots = await fetchWakeSlots(svc.id, st.id, date);
    if (wakeHasFree(slots)) return true;
  }
  return false;
}

export function BookingWidget({ slug = "waketeam" }: { slug?: string }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [activityKind, setActivityKind] = useState<ActivityKind | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [wakeSlots, setWakeSlots] = useState<WakeSlot[]>([]);
  const [supSlots, setSupSlots] = useState<SupSlot[]>([]);
  const [selectedWakeStarts, setSelectedWakeStarts] = useState<string[]>([]);
  const [selectedSupStarts, setSelectedSupStarts] = useState<string[]>([]);
  const [supQuantity, setSupQuantity] = useState(1);
  const [configLoading, setConfigLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [configError, setConfigError] = useState("");
  const [error, setError] = useState("");
  const [tariffsOpen, setTariffsOpen] = useState(false);
  const [done, setDone] = useState<{
    publicNumber: number;
    price: number;
    count?: number;
  } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");

  const userPickedDateRef = useRef(false);
  const [alternateStaff, setAlternateStaff] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [checkingAlternateStaff, setCheckingAlternateStaff] = useState(false);
  const [availableOtherBranches, setAvailableOtherBranches] = useState<Branch[]>([]);
  const [checkingOtherBranches, setCheckingOtherBranches] = useState(false);

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

  const displayPrice = useMemo(() => {
    if (!service) return null;
    if (activityKind === "wake") {
      if (selectedWakeStarts.length === 0) return null;
      return selectedWakeStarts.reduce((sum, startAt) => {
        return (
          sum +
          resolveServicePrice(
            {
              price: service.price,
              durationMinutes: service.durationMinutes,
              priceRules: service.priceRules,
            },
            new Date(startAt),
            WAKE_CELL_MINUTES,
          )
        );
      }, 0);
    }
    if (!selectedSupStarts.length) return null;
    return selectedSupStarts.reduce((sum, startAt) => {
      const unit = resolveServicePrice(
        {
          price: service.price,
          durationMinutes: service.durationMinutes,
          priceRules: service.priceRules,
        },
        new Date(startAt),
        60,
      );
      return sum + unit * supQuantity;
    }, 0);
  }, [service, activityKind, selectedWakeStarts, selectedSupStarts, supQuantity]);

  const selectedSupSlots = useMemo(
    () =>
      selectedSupStarts
        .map((startAt) => supSlots.find((s) => s.startAt === startAt))
        .filter((s): s is SupSlot => !!s),
    [selectedSupStarts, supSlots],
  );

  const maxSupQuantity = useMemo(() => {
    if (selectedSupSlots.length === 0) return 0;
    return Math.min(...selectedSupSlots.map((s) => s.availableBoards));
  }, [selectedSupSlots]);

  const otherBranches = useMemo(
    () => (config ? config.branches.filter((b) => b.id !== branchId) : []),
    [config, branchId],
  );

  const showBranchAlternatives = (config?.branches.length ?? 0) > 1;

  const goBranch = (id: string) => {
    setBranchId(id);
    setActivityKind(null);
    setServiceId("");
    setStaffId("");
    setSelectedWakeStarts([]);
    setSelectedSupStarts([]);
    userPickedDateRef.current = false;
    setStep(1);
  };

  const goToBranchSelect = useCallback(() => {
    setStep(0);
    setBranchId("");
    setActivityKind(null);
    setServiceId("");
    setStaffId("");
    setSelectedWakeStarts([]);
    setSelectedSupStarts([]);
    userPickedDateRef.current = false;
  }, []);

  const handleDateChange = useCallback((next: string) => {
    userPickedDateRef.current = true;
    setDate(next);
  }, []);

  const switchWakeStaff = useCallback((id: string) => {
    userPickedDateRef.current = true;
    setStaffId(id);
    setSelectedWakeStarts([]);
  }, []);

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
    const onTimeStep =
      (activityKind === "wake" && step === 3) ||
      (activityKind === "sup" && step === 2);
    if (onTimeStep) {
      userPickedDateRef.current = false;
      setDate((d) => (d < todayStr() ? todayStr() : d));
    }
  }, [step, activityKind]);

  useEffect(() => {
    if (activityKind !== "wake" || !serviceId || !staffId || !date) return;
    let cancelled = false;
    setSlotsLoading(true);

    void (async () => {
      const manualPick = userPickedDateRef.current;
      let tryDate = date < todayStr() ? todayStr() : date;
      const attempts = manualPick ? 1 : MAX_AUTO_DATE_SCAN_DAYS;

      for (let i = 0; i < attempts; i++) {
        if (cancelled) return;
        const slots = await fetchWakeSlots(serviceId, staffId, tryDate);
        if (cancelled) return;

        const hasGrid = slots.length > 0;
        const hasFree = wakeHasFree(slots);

        if (hasFree) {
          if (tryDate !== date) setDate(tryDate);
          setWakeSlots(slots);
          setSelectedWakeStarts([]);
          setSlotsLoading(false);
          return;
        }

        if (!manualPick && !hasGrid) {
          tryDate = shiftDateStr(tryDate, 1);
          continue;
        }

        if (tryDate !== date) setDate(tryDate);
        setWakeSlots(slots);
        setSelectedWakeStarts([]);
        setSlotsLoading(false);
        return;
      }

      setWakeSlots([]);
      setSelectedWakeStarts([]);
      setSlotsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activityKind, serviceId, staffId, date]);

  useEffect(() => {
    if (activityKind !== "sup" || !serviceId || !date) return;
    let cancelled = false;
    setSlotsLoading(true);

    void (async () => {
      const manualPick = userPickedDateRef.current;
      let tryDate = date < todayStr() ? todayStr() : date;
      const attempts = manualPick ? 1 : MAX_AUTO_DATE_SCAN_DAYS;

      for (let i = 0; i < attempts; i++) {
        if (cancelled) return;
        const slots = await fetchSupSlots(serviceId, tryDate);
        if (cancelled) return;

        const hasGrid = slots.length > 0;
        const hasFree = supHasFree(slots);

        if (hasFree) {
          if (tryDate !== date) setDate(tryDate);
          setSupSlots(slots);
          setSelectedSupStarts([]);
          setSupQuantity(1);
          setSlotsLoading(false);
          return;
        }

        if (!manualPick && !hasGrid) {
          tryDate = shiftDateStr(tryDate, 1);
          continue;
        }

        if (tryDate !== date) setDate(tryDate);
        setSupSlots(slots);
        setSelectedSupStarts([]);
        setSupQuantity(1);
        setSlotsLoading(false);
        return;
      }

      setSupSlots([]);
      setSelectedSupStarts([]);
      setSupQuantity(1);
      setSlotsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [activityKind, serviceId, date]);

  useEffect(() => {
    if (activityKind !== "wake" || !serviceId || !staffId || !date || slotsLoading) {
      return;
    }
    if (wakeSlots.length === 0 || wakeHasFree(wakeSlots)) {
      setAlternateStaff([]);
      setCheckingAlternateStaff(false);
      return;
    }

    const others = staffOptions.filter((s) => s.id !== staffId);
    if (others.length === 0) {
      setAlternateStaff([]);
      setCheckingAlternateStaff(false);
      return;
    }

    let cancelled = false;
    setCheckingAlternateStaff(true);
    void (async () => {
      const found: { id: string; name: string }[] = [];
      for (const st of others) {
        if (cancelled) return;
        const slots = await fetchWakeSlots(serviceId, st.id, date);
        if (wakeHasFree(slots)) {
          found.push({ id: st.id, name: st.name });
        }
      }
      if (!cancelled) {
        setAlternateStaff(found);
        setCheckingAlternateStaff(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityKind, serviceId, staffId, date, slotsLoading, wakeSlots, staffOptions]);

  useEffect(() => {
    if (!config || !activityKind || !date || slotsLoading) {
      setAvailableOtherBranches([]);
      setCheckingOtherBranches(false);
      return;
    }

    const onTimeStep =
      (activityKind === "wake" && step === 3) ||
      (activityKind === "sup" && step === 2);
    if (!onTimeStep) {
      setAvailableOtherBranches([]);
      setCheckingOtherBranches(false);
      return;
    }

    const currentHasFree =
      activityKind === "wake" ? wakeHasFree(wakeSlots) : supHasFree(supSlots);
    if (currentHasFree || otherBranches.length === 0) {
      setAvailableOtherBranches([]);
      setCheckingOtherBranches(false);
      return;
    }

    let cancelled = false;
    setCheckingOtherBranches(true);
    void (async () => {
      const found: Branch[] = [];
      for (const b of otherBranches) {
        if (cancelled) return;
        const ok = await branchHasFreeSlots(config, b.id, activityKind, date);
        if (ok) found.push(b);
      }
      if (!cancelled) {
        setAvailableOtherBranches(found);
        setCheckingOtherBranches(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    config,
    activityKind,
    date,
    slotsLoading,
    wakeSlots,
    supSlots,
    otherBranches,
    step,
  ]);

  useEffect(() => {
    if (maxSupQuantity > 0 && supQuantity > maxSupQuantity) {
      setSupQuantity(maxSupQuantity);
    }
  }, [maxSupQuantity, supQuantity]);

  const pickActivity = (kind: ActivityKind) => {
    const svc = kind === "wake" ? wakeService : supService;
    if (!svc) return;
    setActivityKind(kind);
    setServiceId(svc.id);
    setStaffId("");
    setSelectedWakeStarts([]);
    setSelectedSupStarts([]);
    setStep(2);
  };

  const submit = useCallback(async () => {
    if (!serviceId || activityKind === null) return;

    const slots =
      activityKind === "wake"
        ? selectedWakeStarts.map((startAt) => ({ startAt }))
        : selectedSupStarts.map((startAt) => ({ startAt, quantity: supQuantity }));

    if (slots.length === 0) return;

    setSubmitLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        slug,
        serviceId,
        slots,
        firstName,
        lastName: lastName || undefined,
        phone,
        email: email || undefined,
        comment: comment || undefined,
      };
      if (activityKind === "wake") {
        body.staffId = staffId;
      }

      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка записи");
      setDone({
        publicNumber: data.publicNumber,
        price: data.price,
        count: data.count ?? slots.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSubmitLoading(false);
    }
  }, [
    activityKind,
    selectedWakeStarts,
    selectedSupStarts,
    serviceId,
    staffId,
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
        {done.count != null && done.count > 1 && (
          <p className="mt-1 text-sm text-slate-500">
            Забронировано интервалов: {done.count}
          </p>
        )}
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
          setDate={handleDateChange}
          slotsLoading={slotsLoading}
          supSlots={supSlots}
          selectedSupStarts={selectedSupStarts}
          onToggleSupStart={(startAt) =>
            setSelectedSupStarts((prev) => toggleInList(prev, startAt))
          }
          supQuantity={supQuantity}
          setSupQuantity={setSupQuantity}
          maxSupQuantity={maxSupQuantity}
          displayPrice={displayPrice}
          emptyHint={settings.texts.emptySlotsHint}
          otherBranches={availableOtherBranches}
          showBranchAlternatives={showBranchAlternatives}
          checkingOtherBranches={checkingOtherBranches}
          onPickOtherBranch={goToBranchSelect}
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
          setDate={handleDateChange}
          slotsLoading={slotsLoading}
          wakeSlots={wakeSlots}
          selectedWakeStarts={selectedWakeStarts}
          onToggleWakeStart={(startAt) =>
            setSelectedWakeStarts((prev) => toggleInList(prev, startAt))
          }
          displayPrice={displayPrice}
          emptyHint={settings.texts.emptySlotsHint}
          otherBranches={availableOtherBranches}
          showBranchAlternatives={showBranchAlternatives}
          checkingOtherBranches={checkingOtherBranches}
          alternateStaff={alternateStaff}
          checkingAlternateStaff={checkingAlternateStaff}
          onSwitchStaff={switchWakeStaff}
          onPickOtherBranch={goToBranchSelect}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
          btnClass={btnClass}
          btnActive={btnActive}
          theme={theme}
        />
      )}

      {step === 3 && activityKind === "sup" && selectedSupStarts.length > 0 && (
        <ContactsStep
          summary={`${branch?.name} · ${settings.texts.supLabel} · ${supQuantity} шт. × ${selectedSupStarts.length} сл. · ${[...selectedSupStarts]
            .sort()
            .map(formatSlotTime)
            .join(", ")}`}
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

      {step === 4 && activityKind === "wake" && selectedWakeStarts.length > 0 && service && (
        <ContactsStep
          summary={`${branch?.name} · ${settings.texts.wakeLabel} · ${selectedWakeStarts.length * WAKE_CELL_MINUTES} мин · ${[...selectedWakeStarts]
            .sort()
            .map(formatSlotTime)
            .join(", ")}`}
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
  durationMinutes?: number;
  setDurationMinutes?: (d: number) => void;
  allowedDurations?: number[];
  showDurationPicker?: boolean;
  slotsLoading: boolean;
  wakeSlots?: WakeSlot[];
  selectedWakeStarts?: string[];
  onToggleWakeStart?: (startAt: string) => void;
  supSlots?: SupSlot[];
  selectedSupStarts?: string[];
  onToggleSupStart?: (startAt: string) => void;
  supQuantity?: number;
  setSupQuantity?: (n: number) => void;
  maxSupQuantity?: number;
  displayPrice: number | null;
  emptyHint?: string;
  otherBranches?: Branch[];
  showBranchAlternatives?: boolean;
  checkingOtherBranches?: boolean;
  onPickOtherBranch?: () => void;
  alternateStaff?: { id: string; name: string }[];
  checkingAlternateStaff?: boolean;
  onSwitchStaff?: (staffId: string) => void;
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

  const maxQty = props.maxSupQuantity ?? 0;
  const selectedWakeCount = props.selectedWakeStarts?.length ?? 0;
  const selectedSupCount = props.selectedSupStarts?.length ?? 0;
  const wakeList = props.wakeSlots ?? [];
  const wakeAllBusy = props.kind === "wake" && wakeList.length > 0 && !wakeHasFree(wakeList);
  const branchAltList = props.otherBranches ?? [];
  const showBranchFallback =
    props.showBranchAlternatives &&
    branchAltList.length > 0 &&
    !!props.onPickOtherBranch &&
    (props.kind === "sup"
      ? !props.slotsLoading && !supHasFree(props.supSlots ?? [])
      : !props.slotsLoading &&
        !props.checkingAlternateStaff &&
        !props.checkingOtherBranches &&
        (wakeList.length === 0 || wakeAllBusy) &&
        (props.alternateStaff?.length ?? 0) === 0);

  return (
    <div className="mt-4">
      <BackButton onClick={props.onBack} />

      {props.showDurationPicker && props.setDurationMinutes && props.allowedDurations && (
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

      {props.kind === "wake" && (
        <p className="mt-3 text-xs text-slate-500">
          Выберите один или несколько интервалов по 10 минут
        </p>
      )}

      {props.kind === "sup" && (
        <p className="mt-3 text-xs text-slate-500">
          Выберите один или несколько интервалов по 60 минут
        </p>
      )}

      {props.slotsLoading && (
        <p className="mt-2 text-sm text-slate-500">Загрузка слотов…</p>
      )}

      {!props.slotsLoading && props.kind === "wake" && wakeAllBusy && (
        <p className="mt-2 text-sm text-amber-700">
          На эту дату все слоты заняты
        </p>
      )}

      {props.kind === "wake" && props.checkingAlternateStaff && (
        <p className="mt-2 text-sm text-slate-500">Проверяем другие реверсы…</p>
      )}

      {props.kind === "wake" &&
        wakeAllBusy &&
        !props.checkingAlternateStaff &&
        props.alternateStaff &&
        props.alternateStaff.length > 0 &&
        props.onSwitchStaff && (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Свободное время на другом реверсе:
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {props.alternateStaff.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:border-[var(--widget-primary)]"
                  onClick={() => props.onSwitchStaff!(st.id)}
                >
                  {st.name}
                </button>
              ))}
            </div>
          </>
        )}

      {props.checkingOtherBranches && (
        <p className="mt-2 text-sm text-slate-500">Проверяем другие филиалы…</p>
      )}

      {showBranchFallback && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">
          <p>{props.emptyHint ?? "Попробуйте другой филиал"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {branchAltList.map((b) => (
              <button
                key={b.id}
                type="button"
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:border-[var(--widget-primary)]"
                onClick={props.onPickOtherBranch}
              >
                {b.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-[var(--widget-primary)] hover:underline"
            onClick={props.onPickOtherBranch}
          >
            Выбрать другой филиал
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {props.kind === "wake" &&
          (props.wakeSlots ?? []).map((sl) => {
            const time = formatSlotTime(sl.startAt);
            const free = sl.status === "free";
            const selected = props.selectedWakeStarts?.includes(sl.startAt) ?? false;
            return (
              <button
                key={sl.startAt}
                type="button"
                disabled={!free}
                aria-pressed={selected}
                onClick={() => free && props.onToggleWakeStart?.(sl.startAt)}
                className={`${props.btnClass} min-h-[44px] text-sm ${
                  !free ? "cursor-not-allowed opacity-40" : ""
                }`}
                style={
                  selected
                    ? props.btnActive
                    : free
                      ? { background: props.theme.cardBackground, border: "1px solid #e2e8f0" }
                      : { background: "#e2e8f0", color: "#94a3b8" }
                }
              >
                {time}
              </button>
            );
          })}

        {props.kind === "sup" &&
          (props.supSlots ?? [])
            .filter((s) => s.availableBoards > 0)
            .map((sl) => {
            const time = formatSlotTime(sl.startAt);
            const selected = props.selectedSupStarts?.includes(sl.startAt) ?? false;
            return (
              <button
                key={sl.startAt}
                type="button"
                aria-pressed={selected}
                onClick={() => props.onToggleSupStart?.(sl.startAt)}
                className={`${props.btnClass} min-h-[44px] text-sm sm:min-w-[4rem]`}
                style={selected ? props.btnActive : { background: props.theme.cardBackground, border: "1px solid #e2e8f0" }}
              >
                <span>{time}</span>
                <span className="mt-0.5 block text-[10px] font-normal opacity-75">
                  {sl.availableBoards} дост.
                </span>
              </button>
            );
          })}
      </div>

      {!props.slotsLoading &&
        slots.length === 0 &&
        !showBranchFallback &&
        props.kind === "wake" && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">
          <p>Нет слотов на эту дату</p>
        </div>
      )}

      {!props.slotsLoading &&
        slots.length === 0 &&
        !showBranchFallback &&
        props.kind === "sup" && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-600">
          <p>Нет слотов на эту дату</p>
        </div>
      )}

      {props.kind === "sup" && selectedSupCount > 0 && (
        <div className="mt-4 space-y-3 rounded-lg bg-white p-3">
          <p className="text-sm text-slate-700">
            Выбрано: <strong>{selectedSupCount}</strong>{" "}
            {selectedSupCount === 1 ? "слот" : "слота"}
          </p>
          <p className="text-sm font-medium text-slate-700">
            Доступно сапов: {maxQty}
            {selectedSupCount > 1 ? " (минимум по выбранным слотам)" : ""}
          </p>
          <label className="block text-sm font-medium text-slate-700">
            {selectedSupCount > 1
              ? "Количество сапов на каждый слот"
              : "Количество сапов"}
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

      {props.kind === "wake" && selectedWakeCount > 0 && (
        <div className="mt-4 space-y-3 rounded-lg bg-white p-3">
          <p className="text-sm text-slate-700">
            Выбрано: <strong>{selectedWakeCount}</strong> интервалов (
            {selectedWakeCount * WAKE_CELL_MINUTES} мин)
          </p>
          {props.displayPrice != null && (
            <p className="text-sm text-slate-700">
              Стоимость: <strong>{props.displayPrice} Br</strong>
            </p>
          )}
          {props.onNext && (
            <button
              type="button"
              onClick={props.onNext}
              className={`${props.btnClass} w-full`}
              style={props.btnActive}
            >
              Далее
            </button>
          )}
        </div>
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
