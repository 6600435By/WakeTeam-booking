"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveServicePrice } from "@/lib/service-pricing";
import {
  isCompletePhone,
  normalizePhone,
  toWidgetPhone,
  WIDGET_DEFAULT_PHONE,
} from "@/lib/phone";
import { cn } from "@/lib/utils";
import { formatDateKey, parseTimeOnDate, TZ } from "@/lib/time";
import { sessionRangeFromSlots } from "@/lib/calendar-ics";
import { formatInTimeZone } from "date-fns-tz";
import { ru } from "date-fns/locale";
import {
  DEFAULT_WIDGET_SETTINGS,
  type WidgetSettings,
  widgetThemeVars,
} from "@/lib/widget-settings";
import { WidgetHelpBar } from "@/components/widget/WidgetHelpBar";
import { WidgetPhotoCard } from "@/components/widget/WidgetPhotoCard";
import {
  WidgetBackButton,
  WidgetCalendarLink,
  WidgetChipButton,
  WidgetChoiceButton,
  WidgetDateNavButton,
  WidgetErrorState,
  WidgetField,
  WidgetHeader,
  WidgetInlineError,
  WidgetLoadingSkeleton,
  WidgetPanel,
  WidgetPhoneInput,
  WidgetPriceBadge,
  WidgetPrimaryButton,
  WidgetShell,
  WidgetStatusText,
  WidgetStepEnter,
  WidgetStepProgress,
  WidgetSuccessScreen,
  WidgetSummaryCard,
  WidgetTextArea,
  WidgetTextInput,
} from "@/components/widget/widget-primitives";
import { Label } from "@/components/ui/label";
import { ChevronDown, Sailboat, Waves } from "lucide-react";

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

function formatSessionStart(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Minsk",
  });
}

const SUP_SLOT_MINUTES = 60;

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

const SLOT_SCROLL_HEIGHT_PX = 184;

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

const slotGridScrollClass = "widget-slot-grid-scroll";
const slotGridClass = "widget-slot-grid";

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
      void Promise.resolve(input.showPicker()).catch(cleanup);
    } else {
      input.click();
    }
  };

  return (
    <div className="mt-3">
      <p className="text-center text-sm font-medium tracking-tight text-slate-800">
        {monthCapitalized}
      </p>
      <WidgetCalendarLink onClick={openCalendar} />

      <div className="mt-2 flex items-center gap-1">
        <WidgetDateNavButton
          direction="prev"
          label="Предыдущий день"
          disabled={date <= today}
          onClick={() => date > today && onChange(shiftDateStr(date, -1))}
        />

        <div className="flex min-w-0 flex-1 items-stretch justify-between gap-1 px-0.5">
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
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl py-2 transition-all duration-200",
                  selected
                    ? "bg-[var(--widget-primary)]/12 text-slate-900 shadow-sm ring-1 ring-[var(--widget-primary)]/20"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600",
                )}
              >
                <span
                  className={cn(
                    "font-semibold tabular-nums leading-none",
                    selected ? "text-lg sm:text-xl" : "text-sm",
                  )}
                >
                  {dayNum}
                </span>
                <span
                  className={cn(
                    "mt-1 leading-none font-medium",
                    selected ? "text-[10px] text-slate-700" : "text-[9px]",
                  )}
                >
                  {weekday}
                </span>
              </button>
            );
          })}
        </div>

        <WidgetDateNavButton
          direction="next"
          label="Следующий день"
          onClick={() => onChange(shiftDateStr(date, 1))}
        />
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
    branchName: string;
    resourceLabel: string;
    sessionStartAt: string;
    sessionStartIso: string;
    sessionEndIso: string;
    bookedMinutes: number;
  } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState(WIDGET_DEFAULT_PHONE);
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
    setPhone(toWidgetPhone(prefill.phone));
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
        phone: normalizePhone(phone),
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

      const slotStarts =
        activityKind === "wake" ? selectedWakeStarts : selectedSupStarts;
      const cellMinutes =
        activityKind === "wake" ? WAKE_CELL_MINUTES : SUP_SLOT_MINUTES;
      const range = sessionRangeFromSlots(slotStarts, cellMinutes);
      const earliestStart = range?.startIso;
      const bookedMinutes =
        activityKind === "wake"
          ? selectedWakeStarts.length * WAKE_CELL_MINUTES
          : selectedSupStarts.length * SUP_SLOT_MINUTES;
      const resourceLabel =
        activityKind === "wake"
          ? settings.texts.wakeLabel
          : settings.texts.supLabel;

      setDone({
        publicNumber: data.publicNumber,
        price: data.price,
        branchName: branch?.name ?? "",
        resourceLabel,
        sessionStartAt: earliestStart ? formatSessionStart(earliestStart) : "",
        sessionStartIso: range?.startIso ?? "",
        sessionEndIso: range?.endIso ?? "",
        bookedMinutes,
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
    branch,
    settings.texts.wakeLabel,
    settings.texts.supLabel,
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
    return <WidgetLoadingSkeleton />;
  }

  if (configError || !config) {
    return (
      <WidgetErrorState
        message={configError || "Проверьте подключение к серверу"}
      />
    );
  }

  if (done) {
    return (
      <WidgetSuccessScreen
        embedRef={embedRef}
        title={settings.texts.successTitle}
        publicNumber={done.publicNumber}
        price={done.price}
        branchName={done.branchName}
        resourceLabel={done.resourceLabel}
        sessionStartAt={done.sessionStartAt}
        sessionStartIso={done.sessionStartIso}
        sessionEndIso={done.sessionEndIso}
        bookedMinutes={done.bookedMinutes}
        adminPhone={settings.texts.callAdminPhone}
        theme={theme}
      />
    );
  }

  return (
    <WidgetShell
      embedRef={embedRef}
      id="waketeam-booking-root"
      style={{ background: theme.pageBackground, ...widgetThemeVars(theme) }}
    >
      {!copyMode ? (
        <>
          <WidgetHeader
            title={settings.texts.title}
            subtitle={settings.texts.subtitle}
          />
          <WidgetStepProgress
            steps={visibleSteps}
            activeIndex={stepIndicatorIndex}
            theme={theme}
            onStepClick={goToVisibleStep}
            canNavigateTo={canNavigateToVisibleIndex}
          />
        </>
      ) : (
        <p className="text-sm text-slate-600">
          {[branch?.name, service?.name, staffOptions.find((s) => s.id === staffId)?.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {error && <WidgetInlineError message={error} />}

      {step === 0 && (
        <WidgetStepEnter stepKey="branch" className="mt-5 space-y-3">
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
        </WidgetStepEnter>
      )}

      {step === 1 && (
        <WidgetStepEnter stepKey="activity" className="mt-4 space-y-3">
          <BackButton onClick={() => setStep(0)} />
          {wakeService && (
            <ActivityCard
              title={settings.texts.wakeLabel}
              priceHint={`от ${wakeService.priceFrom} Br`}
              onClick={() => pickActivity("wake")}
              theme={theme}
              icon={Waves}
            >
              {settings.behavior.showTariffsExpandable &&
                wakeService.priceRules.length > 0 && (
                  <TariffsBlock
                    open={tariffsOpen}
                    onToggle={() => setTariffsOpen((v) => !v)}
                    rules={wakeService.priceRules}
                    durationMinutes={wakeService.durationMinutes}
                    theme={theme}
                  />
                )}
            </ActivityCard>
          )}
          {supService && (
            <ActivityCard
              title={settings.texts.supLabel}
              priceHint={`от ${supService.priceFrom} Br`}
              onClick={() => pickActivity("sup")}
              theme={theme}
              icon={Sailboat}
            >
              {settings.behavior.showTariffsExpandable &&
                supService.priceRules.length > 0 && (
                  <TariffsBlock
                    open={tariffsOpen}
                    onToggle={() => setTariffsOpen((v) => !v)}
                    rules={supService.priceRules}
                    durationMinutes={supService.durationMinutes}
                    theme={theme}
                  />
                )}
            </ActivityCard>
          )}
        </WidgetStepEnter>
      )}

      {step === 2 && activityKind === "wake" && service && (
        <WidgetStepEnter stepKey="staff" className="mt-3 space-y-3">
          <BackButton onClick={() => setStep(1)} />
          <p className="text-sm text-slate-500">{branch?.name}</p>
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
        </WidgetStepEnter>
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
          theme={theme}
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
          theme={theme}
        />
      )}

      <WidgetHelpBar
        label={settings.texts.callAdminLabel}
        phone={settings.texts.callAdminPhone}
        compact={step === 3 || copyMode}
      />
    </WidgetShell>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <WidgetBackButton onClick={onClick} />;
}

function TariffsBlock({
  open,
  onToggle,
  rules,
  durationMinutes,
  theme,
}: {
  open: boolean;
  onToggle: () => void;
  rules: PriceRule[];
  durationMinutes: number;
  theme: WidgetSettings["theme"];
}) {
  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: theme.primaryColor }}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        Тарифы
        <ChevronDown
          className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
          strokeWidth={2.25}
        />
      </button>
      {open && (
        <ul className="mt-2 space-y-1 rounded-lg bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600">
          {rules.map((r, i) => (
            <li key={i}>{formatTariffLine(r, durationMinutes)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityCard({
  title,
  priceHint,
  onClick,
  theme,
  icon: Icon,
  children,
}: {
  title: string;
  priceHint: string;
  onClick: () => void;
  theme: WidgetSettings["theme"];
  icon: typeof Waves;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 text-left shadow-sm ring-1 ring-black/[0.03] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--widget-primary)]/30 hover:shadow-md active:translate-y-0 sm:items-center sm:gap-4 sm:p-4"
      style={{ background: theme.cardBackground }}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors sm:size-11"
        style={{ background: `${theme.primaryColor}18`, color: theme.primaryColor }}
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <span className="font-semibold tracking-tight text-slate-900">{title}</span>
          <WidgetPriceBadge>{priceHint}</WidgetPriceBadge>
        </div>
        <div className="mt-2">
          {children ?? (
            <span className="invisible text-xs" aria-hidden>
              Тарифы
            </span>
          )}
        </div>
      </div>
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
    <WidgetStepEnter stepKey={`time-${props.kind}`} className="mt-3">
      {!props.hideBack && <BackButton onClick={props.onBack} />}

      {props.showDurationPicker && props.setDurationMinutes && props.allowedDurations && (
        <>
          <Label className="mt-3 block text-sm font-medium text-slate-700">
            Длительность
          </Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.allowedDurations.map((d) => (
              <WidgetChoiceButton
                key={d}
                selected={props.durationMinutes === d}
                onClick={() => props.setDurationMinutes!(d)}
                theme={props.theme}
              >
                {d} мин
              </WidgetChoiceButton>
            ))}
          </div>
        </>
      )}

      <CarouselDatePicker date={props.date} onChange={props.setDate} />

      {props.slotsLoading && (
        <WidgetStatusText className="mt-3">Загрузка слотов…</WidgetStatusText>
      )}

      {!props.slotsLoading && props.kind === "wake" && wakeAllBusy && (
        <WidgetStatusText tone="warning" className="mt-3">
          На эту дату все слоты заняты
        </WidgetStatusText>
      )}

      {props.kind === "wake" && props.checkingAlternateStaff && (
        <WidgetStatusText className="mt-3">Проверяем другие реверсы…</WidgetStatusText>
      )}

      {props.kind === "wake" &&
        wakeAllBusy &&
        !props.checkingAlternateStaff &&
        props.alternateStaff &&
        props.alternateStaff.length > 0 &&
        props.onSwitchStaff && (
          <>
            <WidgetStatusText className="mt-3 text-slate-600">
              Свободное время на другом реверсе:
            </WidgetStatusText>
            <div className="mt-2 flex flex-wrap gap-2">
              {props.alternateStaff.map((st) => (
                <WidgetChipButton
                  key={st.id}
                  onClick={() => props.onSwitchStaff!(st.id)}
                >
                  {st.name}
                </WidgetChipButton>
              ))}
            </div>
          </>
        )}

      {props.checkingOtherBranches && (
        <WidgetStatusText className="mt-3">Проверяем другие филиалы…</WidgetStatusText>
      )}

      {showBranchFallback && (
        <WidgetPanel className="mt-3">
          <p className="text-sm text-slate-600">
            {props.emptyHint ?? "Попробуйте другой филиал"}
          </p>
          <div className="flex flex-wrap gap-2">
            {branchAltList.map((b) => (
              <WidgetChipButton
                key={b.id}
                onClick={props.onPickOtherBranch}
              >
                {b.name}
              </WidgetChipButton>
            ))}
          </div>
          <button
            type="button"
            className="text-sm font-medium text-[var(--widget-primary)] transition-opacity hover:opacity-80"
            onClick={props.onPickOtherBranch}
          >
            Выбрать другой филиал
          </button>
        </WidgetPanel>
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
              <WidgetChoiceButton
                key={sl.startAt}
                disabled={!free}
                selected={selected}
                aria-pressed={selected}
                onClick={() => free && props.onToggleWakeStart?.(sl.startAt)}
                theme={props.theme}
                className="min-h-10 w-full px-1.5 py-2 text-xs sm:text-sm"
              >
                {time}
              </WidgetChoiceButton>
            );
          })}

        {props.kind === "sup" &&
          (props.supSlots ?? [])
            .filter((s) => s.availableBoards > 0)
            .map((sl) => {
            const time = formatSlotTime(sl.startAt);
            const selected = props.selectedSupStarts?.includes(sl.startAt) ?? false;
            return (
              <WidgetChoiceButton
                key={sl.startAt}
                selected={selected}
                aria-pressed={selected}
                onClick={() => props.onToggleSupStart?.(sl.startAt)}
                theme={props.theme}
                className="min-h-[3.25rem] w-full flex-col gap-0.5 px-1.5 py-2 text-xs sm:min-h-11 sm:text-sm"
              >
                <span>{time}</span>
                <span className="text-[10px] font-normal opacity-75">
                  {sl.availableBoards} шт.
                </span>
              </WidgetChoiceButton>
            );
          })}
        </div>
      </div>

      {!props.slotsLoading &&
        slots.length === 0 &&
        !showBranchFallback &&
        props.kind === "wake" && (
        <WidgetSummaryCard className="mt-3">
          <p>Нет слотов на эту дату</p>
        </WidgetSummaryCard>
      )}

      {!props.slotsLoading &&
        slots.length === 0 &&
        !showBranchFallback &&
        props.kind === "sup" && (
        <WidgetSummaryCard className="mt-3">
          <p>Нет слотов на эту дату</p>
        </WidgetSummaryCard>
      )}

      {props.kind === "sup" && selectedSupCount > 0 && (
        <WidgetPanel className="mt-4">
          <p className="text-sm text-slate-700">
            Выбрано: <strong className="font-semibold">{selectedSupCount}</strong>{" "}
            {selectedSupCount === 1 ? "слот" : "слота"}
          </p>
          <p className="text-sm font-medium text-slate-700">
            Доступно сапов: {maxQty}
            {selectedSupCount > 1 ? " (минимум по выбранным слотам)" : ""}
          </p>
          <Label className="text-sm font-medium text-slate-700">
            {selectedSupCount > 1
              ? "Количество сапов на каждый слот"
              : "Количество сапов"}
          </Label>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
              <WidgetChoiceButton
                key={n}
                selected={props.supQuantity === n}
                onClick={() => props.setSupQuantity?.(n)}
                theme={props.theme}
                className="min-w-10"
              >
                {n}
              </WidgetChoiceButton>
            ))}
          </div>
          {props.displayPrice != null && (
            <p className="text-sm text-slate-700">
              Стоимость:{" "}
              <strong className="font-semibold tabular-nums">
                {props.displayPrice} Br
              </strong>
            </p>
          )}
          <WidgetPrimaryButton
            disabled={!props.supQuantity}
            loading={props.nextLoading}
            onClick={props.onNext}
            theme={props.theme}
          >
            {props.nextLabel ?? "Далее"}
          </WidgetPrimaryButton>
        </WidgetPanel>
      )}

      {props.kind === "wake" && selectedWakeCount > 0 && (
        <WidgetPanel className="mt-4">
          <p className="text-sm text-slate-700">
            Выбрано: <strong className="font-semibold">{selectedWakeCount}</strong>{" "}
            интервалов ({selectedWakeCount * WAKE_CELL_MINUTES} мин)
          </p>
          {props.displayPrice != null && (
            <p className="text-sm text-slate-700">
              Стоимость:{" "}
              <strong className="font-semibold tabular-nums">
                {props.displayPrice} Br
              </strong>
            </p>
          )}
          {props.onNext && (
            <WidgetPrimaryButton
              loading={props.nextLoading}
              onClick={props.onNext}
              theme={props.theme}
            >
              {props.nextLabel ?? "Далее"}
            </WidgetPrimaryButton>
          )}
        </WidgetPanel>
      )}
    </WidgetStepEnter>
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
  theme,
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
  theme: WidgetSettings["theme"];
}) {
  return (
    <WidgetStepEnter stepKey="contacts" className="mt-4 space-y-4">
      <WidgetBackButton onClick={onBack} />
      <WidgetSummaryCard>{summary}</WidgetSummaryCard>
      {displayPrice != null && (
        <p className="text-sm text-slate-700">
          Стоимость:{" "}
          <strong className="font-semibold tabular-nums">{displayPrice} Br</strong>
        </p>
      )}
      <div className="space-y-3">
        <WidgetField id="widget-first-name" label="Имя" required>
          <WidgetTextInput
            id="widget-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
        </WidgetField>
        <WidgetField id="widget-last-name" label="Фамилия">
          <WidgetTextInput
            id="widget-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </WidgetField>
        <WidgetField id="widget-phone" label="Телефон" required>
          <WidgetPhoneInput
            id="widget-phone"
            value={phone}
            onChange={setPhone}
          />
        </WidgetField>
        <WidgetField id="widget-email" label="Email">
          <WidgetTextInput
            id="widget-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </WidgetField>
        <WidgetField id="widget-comment" label="Комментарий">
          <WidgetTextArea
            id="widget-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
        </WidgetField>
      </div>
      <WidgetPrimaryButton
        onClick={onSubmit}
        disabled={!firstName || !isCompletePhone(phone)}
        loading={loading}
        loadingLabel="Отправка…"
        theme={theme}
      >
        {submitLabel}
      </WidgetPrimaryButton>
    </WidgetStepEnter>
  );
}
