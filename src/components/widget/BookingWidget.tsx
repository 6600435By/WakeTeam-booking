"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveServicePrice } from "@/lib/service-pricing";
import { formatDateKey, parseTimeOnDate, TZ } from "@/lib/time";
import { formatInTimeZone } from "date-fns-tz";
import { ru } from "date-fns/locale";
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
  staff: { id: string; name: string; kind: string; description?: string | null; photoUrl?: string | null }[];
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

export type WidgetPrefill = {
  branchId: string;
  serviceId: string;
  staffId: string;
  activityKind: ActivityKind;
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  comment?: string;
};

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

const WEEKDAY_ABBR = ["", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const;

const CAROUSEL_RADIUS = 2;

function weekdayAbbr(dateStr: string) {
  const isoDow = Number(
    formatInTimeZone(parseTimeOnDate(dateStr, "12:00"), TZ, "i"),
  );
  return WEEKDAY_ABBR[isoDow] ?? "";
}

const SLOT_SCROLL_HEIGHT_PX = 200;

const slotGridScrollStyle: React.CSSProperties = {
  height: SLOT_SCROLL_HEIGHT_PX,
  maxHeight: SLOT_SCROLL_HEIGHT_PX,
  overflowY: "auto",
  overflowX: "hidden",
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  touchAction: "pan-y",
  position: "relative",
};

const slotGridScrollClass = "widget-slot-grid-scroll mt-3";
const slotGridClass = "widget-slot-grid grid grid-cols-6 gap-2";

const slotBtnClass =
  "min-h-[35px] touch-pan-y rounded-lg px-3 py-1.5 text-sm font-medium transition-colors";

function buildCarouselDates(selected: string, today: string): string[] {
  const offsets = Array.from(
    { length: CAROUSEL_RADIUS * 2 + 1 },
    (_, i) => i - CAROUSEL_RADIUS,
  );
  const dates = offsets
    .map((o) => shiftDateStr(selected, o))
    .filter((d) => d >= today);
  let next = shiftDateStr(selected, CAROUSEL_RADIUS + 1);
  while (dates.length < CAROUSEL_RADIUS * 2 + 1) {
    if (!dates.includes(next)) dates.push(next);
    next = shiftDateStr(next, 1);
  }
  return dates.slice(0, CAROUSEL_RADIUS * 2 + 1);
}

function CarouselDatePicker({
  date,
  onChange,
}: {
  date: string;
  onChange: (d: string) => void;
}) {
  const today = todayStr();
  const carouselDates = useMemo(
    () => buildCarouselDates(date, today),
    [date, today],
  );
  const monthLabel = formatInTimeZone(
    parseTimeOnDate(date, "12:00"),
    TZ,
    "LLLL",
    { locale: ru },
  );
  const monthCapitalized =
    monthLabel.charAt(0).toLocaleUpperCase("ru") + monthLabel.slice(1);

  const openCalendar = () => {
    const input = document.createElement("input");
    input.type = "date";
    input.value = date;
    input.min = today;
    input.style.cssText =
      "position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", () => {
      if (input.value) onChange(input.value);
      cleanup();
    });
    input.addEventListener("blur", cleanup, { once: true });

    if (typeof input.showPicker === "function") {
      input.showPicker().catch(cleanup);
    } else {
      input.click();
    }
  };

  return (
    <div className="mt-1">
      <p className="text-center text-xs font-medium text-slate-800">
        {monthCapitalized}
      </p>
      <button
        type="button"
        onClick={openCalendar}
        className="mx-auto mt-0 block text-[10px] leading-tight text-[var(--widget-primary)] underline"
      >
        выбрать дату в календаре
      </button>

      <div className="mt-1 flex items-center gap-0">
        <button
          type="button"
          onClick={() => date > today && onChange(shiftDateStr(date, -1))}
          disabled={date <= today}
          className="shrink-0 px-0 py-0.5 text-xl leading-none text-slate-400 disabled:opacity-25"
          aria-label="Предыдущий день"
        >
          ‹
        </button>

        <div className="flex min-w-0 flex-1 items-end justify-between">
          {carouselDates.map((d) => {
            const selected = d === date;
            const dayNum = formatInTimeZone(
              parseTimeOnDate(d, "12:00"),
              TZ,
              "d",
            );
            const weekday = weekdayAbbr(d);

            return (
              <button
                key={d}
                type="button"
                onClick={() => onChange(d)}
                className={`flex min-w-0 flex-1 flex-col items-center px-0 py-0.5 transition-colors ${
                  selected
                    ? "text-slate-900"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <span
                  className={
                    selected
                      ? "text-xl font-bold leading-none"
                      : "text-xs font-medium leading-none"
                  }
                >
                  {dayNum}
                </span>
                <span
                  className={`leading-none ${
                    selected ? "text-[10px] font-bold" : "text-[9px] font-medium"
                  }`}
                >
                  {weekday}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onChange(shiftDateStr(date, 1))}
          className="shrink-0 px-0 py-0.5 text-xl leading-none text-slate-400"
          aria-label="Следующий день"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function supVisibleIndexToStep(index: number): number {
  if (index <= 1) return index;
  return index === 2 ? 2 : 3;
}

function supStepToVisibleIndex(step: number): number {
  if (step <= 1) return step;
  if (step === 2) return 2;
  return 3;
}

export function BookingWidget({
  slug = "waketeam",
  prefill,
  copyMode = false,
  onCopyBookingDone,
}: {
  slug?: string;
  prefill?: WidgetPrefill | null;
  copyMode?: boolean;
  onCopyBookingDone?: () => void;
}) {
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

  const embedRef = useEmbedHeight(!copyMode);
  const prefillAppliedRef = useRef(false);
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
    prefillAppliedRef.current = false;
  }, [prefill]);

  useEffect(() => {
    if (!config || !prefill || prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    setBranchId(prefill.branchId);
    setActivityKind(prefill.activityKind);
    setServiceId(prefill.serviceId);
    setStaffId(prefill.staffId);
    setFirstName(prefill.firstName);
    setLastName(prefill.lastName ?? "");
    setPhone(prefill.phone);
    setEmail(prefill.email ?? "");
    setComment(prefill.comment ?? "");
    setSelectedWakeStarts([]);
    setSelectedSupStarts([]);
    setSupQuantity(1);
    userPickedDateRef.current = false;
    setStep(prefill.activityKind === "wake" ? 3 : 2);
  }, [config, prefill]);

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
      if (copyMode) {
        onCopyBookingDone?.();
      }
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
    copyMode,
    onCopyBookingDone,
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

  const stepIndicatorIndex = useMemo(() => {
    if (activityKind === "sup") {
      return supStepToVisibleIndex(step);
    }
    return step;
  }, [activityKind, step]);

  const canNavigateToVisibleIndex = useCallback(
    (index: number) => {
      if (!config) return false;
      if (index === 0) return config.branches.length > 0;
      if (index === 1) return !!branchId;
      if (activityKind === "sup") {
        if (index === 2) return !!serviceId;
        if (index === 3) return selectedSupStarts.length > 0;
        return false;
      }
      if (activityKind === "wake") {
        if (index === 2) return !!serviceId;
        if (index === 3) return !!staffId;
        if (index === 4) return selectedWakeStarts.length > 0;
      }
      return false;
    },
    [
      config,
      branchId,
      activityKind,
      serviceId,
      staffId,
      selectedWakeStarts,
      selectedSupStarts,
    ],
  );

  const goToVisibleStep = useCallback(
    (index: number) => {
      if (index > stepIndicatorIndex && !canNavigateToVisibleIndex(index)) {
        return;
      }
      setError("");
      setStep(activityKind === "sup" ? supVisibleIndexToStep(index) : index);
    },
    [activityKind, canNavigateToVisibleIndex, stepIndicatorIndex],
  );

  const handleTimeStepNext = useCallback(() => {
    if (copyMode) {
      void submit();
      return;
    }
    if (activityKind === "wake") setStep(4);
    else setStep(3);
  }, [copyMode, activityKind, submit]);

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
      className="@container rounded-xl p-3 sm:p-4"
      style={{ background: theme.pageBackground, ...widgetThemeVars(theme) }}
      id="waketeam-booking-root"
    >
      {!copyMode ? (
        <>
          <h1 className="text-base font-bold text-slate-900 sm:text-lg">
            {settings.texts.title}
          </h1>
          <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
            {settings.texts.subtitle}
          </p>

          <div className="mt-2 flex flex-wrap gap-0.5 text-[10px] font-medium sm:text-xs">
            {visibleSteps.map((label, i) => {
              const isActive = i === stepIndicatorIndex;
              const isPast = i < stepIndicatorIndex;
              const clickable =
                isActive || isPast || canNavigateToVisibleIndex(i);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!clickable}
                  onClick={() => goToVisibleStep(i)}
                  className={`rounded px-2 py-1 transition-opacity ${
                    clickable
                      ? "cursor-pointer hover:opacity-90"
                      : "cursor-not-allowed opacity-55"
                  }`}
                  style={{
                    background: isActive
                      ? theme.stepActiveBg
                      : isPast
                        ? theme.stepInactiveBg
                        : "#e2e8f0",
                    color: isActive
                      ? theme.buttonText
                      : isPast
                        ? "#fff"
                        : "#475569",
                  }}
                >
                  {i + 1}. {label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-600">
          {[branch?.name, service?.name, staffOptions.find((s) => s.id === staffId)?.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {step === 0 && (
        <div className="mt-4 space-y-2">
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
              onClick={() => pickActivity("wake")}
              theme={theme}
            >
              {settings.behavior.showTariffsExpandable &&
                wakeService.priceRules.length > 0 && (
                  <div>
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
              priceHint={`от ${supService.priceFrom} Br`}
              onClick={() => pickActivity("sup")}
              theme={theme}
            >
              {settings.behavior.showTariffsExpandable &&
                supService.priceRules.length > 0 && (
                  <div>
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
                        {supService.priceRules.map((r, i) => (
                          <li key={i}>
                            {formatTariffLine(r, supService.durationMinutes)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
            </ActivityCard>
          )}
        </div>
      )}

      {step === 2 && activityKind === "wake" && service && (
        <div className="mt-2 space-y-2">
          <BackButton onClick={() => setStep(1)} />
          <p className="text-xs text-slate-600 sm:text-sm">{branch?.name}</p>
          {staffOptions.map((st) => (
            <WidgetPhotoCard
              key={st.id}
              kind="staff"
              title={st.name}
              subtitle={st.description}
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
          onNext={handleTimeStepNext}
          nextLoading={submitLoading}
          nextLabel={copyMode ? "Записать" : "Далее"}
          hideBack={copyMode}
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
          onNext={handleTimeStepNext}
          nextLoading={submitLoading}
          nextLabel={copyMode ? "Записать" : "Далее"}
          hideBack={copyMode}
          btnClass={btnClass}
          btnActive={btnActive}
          theme={theme}
        />
      )}

      {step === 3 && activityKind === "sup" && !copyMode && selectedSupStarts.length > 0 && (
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

      {step === 4 && activityKind === "wake" && !copyMode && selectedWakeStarts.length > 0 && service && (
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
        compact={step === 3 || copyMode}
      />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-slate-600 hover:text-slate-900 sm:text-sm"
    >
      ← Назад
    </button>
  );
}

function ActivityCard({
  title,
  priceHint,
  onClick,
  theme,
  children,
}: {
  title: string;
  priceHint: string;
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
      <div className="min-w-0 flex-1">
        <span className="font-medium text-slate-800">{title}</span>
        <div className="mt-2">
          {children ?? (
            <span className="invisible text-xs underline" aria-hidden>
              Тарифы
            </span>
          )}
        </div>
      </div>
      <span className="text-sm text-slate-600 sm:shrink-0 sm:self-start">{priceHint}</span>
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
  nextLoading?: boolean;
  nextLabel?: string;
  hideBack?: boolean;
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
    <div className="mt-2">
      {!props.hideBack && <BackButton onClick={props.onBack} />}

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

      <CarouselDatePicker date={props.date} onChange={props.setDate} />

      {props.slotsLoading && (
        <p className="mt-1 text-sm text-slate-500">Загрузка слотов…</p>
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

      <div
        className={slotGridScrollClass}
        style={slotGridScrollStyle}
        aria-label={
          props.kind === "wake"
            ? "Выберите один или несколько интервалов по 10 минут"
            : "Выберите один или несколько интервалов по 60 минут"
        }
      >
        <div className={slotGridClass}>
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
                className={`${slotBtnClass} ${
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
                className={`${slotBtnClass} sm:min-w-[4rem]`}
                style={selected ? props.btnActive : { background: props.theme.cardBackground, border: "1px solid #e2e8f0" }}
              >
                <span>{time}</span>
                <span className="mt-0.5 block text-[10px] font-normal opacity-75">
                  доступно {sl.availableBoards}
                </span>
              </button>
            );
          })}
        </div>
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
            disabled={!props.supQuantity || props.nextLoading}
            onClick={props.onNext}
            className={`${props.btnClass} w-full`}
            style={props.btnActive}
          >
            {props.nextLoading ? "…" : (props.nextLabel ?? "Далее")}
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
              disabled={props.nextLoading}
              onClick={props.onNext}
              className={`${props.btnClass} w-full`}
              style={props.btnActive}
            >
              {props.nextLoading ? "…" : (props.nextLabel ?? "Далее")}
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
