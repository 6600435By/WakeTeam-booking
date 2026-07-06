"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveServicePrice } from "@/lib/service-pricing";
import { pricingWeekdayForDate } from "@/lib/branch-hours-constants";
import {
  isCompletePhone,
  normalizePhone,
  toWidgetPhone,
  WIDGET_DEFAULT_PHONE,
} from "@/lib/phone";
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
  WidgetErrorState,
  WidgetBackButton,
  WidgetHeader,
  WidgetInlineError,
  WidgetLoadingSkeleton,
  WidgetShell,
  WidgetStepEnter,
  WidgetStepProgress,
  WidgetSuccessScreen,
} from "@/components/widget/widget-primitives";
import {
  branchHasFreeSlots,
  fetchSupSlots,
  fetchWakeSlots,
  formatSessionStart,
  formatSlotTime,
  MAX_AUTO_DATE_SCAN_DAYS,
  serviceBookingDurations,
  shiftDateStr,
  shouldShowWidgetTariffs,
  supHasFree,
  supStepToVisibleIndex,
  supVisibleIndexToStep,
  todayStr,
  toggleInList,
  useEmbedHeight,
  wakeHasFree,
  WAKE_CELL_MINUTES,
  widgetTariffRulesForService,
} from "@/components/widget/widget-booking-utils";
import {
  TariffsBlock,
  WidgetActivityCard,
  WidgetContactsStep,
  WidgetDateTimeStep,
} from "@/components/widget/widget-step-components";
import type {
  ActivityKind,
  SupSlot,
  WakeSlot,
  WidgetBranch,
  WidgetConfig,
  WidgetPrefill,
  WidgetService,
} from "@/components/widget/widget-types";
import { isStaffPickActivity } from "@/components/widget/widget-types";

export type { WidgetPrefill } from "@/components/widget/widget-types";

function widgetServiceTitle(
  service: WidgetService,
  texts: WidgetSettings["texts"],
): string {
  if (service.kind === "wake") return texts.wakeLabel;
  if (service.kind === "sup") return texts.supLabel;
  return service.resourceLabel ?? service.name;
}

function activityKindForService(kind: string): ActivityKind {
  if (kind === "sup") return "sup";
  if (kind === "custom") return "custom";
  return "wake";
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
  const [supDurationMinutes, setSupDurationMinutes] = useState(30);
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
  const [availableOtherBranches, setAvailableOtherBranches] = useState<WidgetBranch[]>([]);
  const [checkingOtherBranches, setCheckingOtherBranches] = useState(false);

  const embedRef = useEmbedHeight(!copyMode);
  const prefillAppliedRef = useRef(false);
  const settings: WidgetSettings = config?.settings ?? DEFAULT_WIDGET_SETTINGS;
  const theme = settings.theme;

  const services = useMemo(
    () => (branchId && config ? (config.servicesByBranch[branchId] ?? []) : []),
    [branchId, config],
  );

  const bookableServices = useMemo(
    () => services.filter((s) => s.staff.length > 0),
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

  const staffCellMinutes = service?.durationMinutes ?? WAKE_CELL_MINUTES;

  const supBookingDurations = useMemo(() => {
    if (!service || service.kind !== "sup") return [30];
    return serviceBookingDurations(service);
  }, [service]);

  const displayPrice = useMemo(() => {
    if (!service) return null;
    const holidaySet = new Set(branch?.holidayDates ?? []);
    const pricingWeekday = (startAt: string) =>
      pricingWeekdayForDate(formatDateKey(new Date(startAt)), [...holidaySet]);
    if (isStaffPickActivity(activityKind)) {
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
            staffCellMinutes,
            { pricingWeekday: pricingWeekday(startAt) },
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
        supDurationMinutes,
        { pricingWeekday: pricingWeekday(startAt) },
      );
      return sum + unit * supQuantity;
    }, 0);
  }, [
    service,
    activityKind,
    selectedWakeStarts,
    selectedSupStarts,
    supQuantity,
    staffCellMinutes,
    supDurationMinutes,
    branch?.holidayDates,
  ]);

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
    setStep(isStaffPickActivity(prefill.activityKind) ? 3 : 2);
  }, [config, prefill]);

  useEffect(() => {
    const onTimeStep =
      (isStaffPickActivity(activityKind) && step === 3) ||
      (activityKind === "sup" && step === 2);
    if (onTimeStep) {
      userPickedDateRef.current = false;
      setDate((d) => (d < todayStr() ? todayStr() : d));
    }
  }, [step, activityKind]);

  useEffect(() => {
    if (!isStaffPickActivity(activityKind) || !serviceId || !staffId || !date) return;
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
        const slots = await fetchSupSlots(serviceId, tryDate, supDurationMinutes);
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
  }, [activityKind, serviceId, date, supDurationMinutes]);

  useEffect(() => {
    if (!isStaffPickActivity(activityKind) || !serviceId || !staffId || !date || slotsLoading) {
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
    if (!config || !activityKind || !date || slotsLoading || !service) {
      setAvailableOtherBranches([]);
      setCheckingOtherBranches(false);
      return;
    }

    const onTimeStep =
      (isStaffPickActivity(activityKind) && step === 3) ||
      (activityKind === "sup" && step === 2);
    if (!onTimeStep) {
      setAvailableOtherBranches([]);
      setCheckingOtherBranches(false);
      return;
    }

    const currentHasFree = isStaffPickActivity(activityKind)
      ? wakeHasFree(wakeSlots)
      : supHasFree(supSlots);
    if (currentHasFree || otherBranches.length === 0) {
      setAvailableOtherBranches([]);
      setCheckingOtherBranches(false);
      return;
    }

    let cancelled = false;
    setCheckingOtherBranches(true);
    void (async () => {
      const found: WidgetBranch[] = [];
      for (const b of otherBranches) {
        if (cancelled) return;
        const ok = await branchHasFreeSlots(config, b.id, service, date);
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
    service,
    step,
  ]);

  useEffect(() => {
    if (maxSupQuantity > 0 && supQuantity > maxSupQuantity) {
      setSupQuantity(maxSupQuantity);
    }
  }, [maxSupQuantity, supQuantity]);

  const pickService = (svc: WidgetService) => {
    const durations = serviceBookingDurations(svc);
    setActivityKind(activityKindForService(svc.kind));
    setServiceId(svc.id);
    setStaffId("");
    setSelectedWakeStarts([]);
    setSelectedSupStarts([]);
    setSupDurationMinutes(durations[0] ?? svc.durationMinutes);
    setStep(2);
  };

  const submit = useCallback(async () => {
    if (!serviceId || activityKind === null) return;

    const slots = isStaffPickActivity(activityKind)
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
      if (isStaffPickActivity(activityKind)) {
        body.staffId = staffId;
      } else {
        body.durationMinutes = supDurationMinutes;
      }

      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка записи");

      const slotStarts = isStaffPickActivity(activityKind)
        ? selectedWakeStarts
        : selectedSupStarts;
      const cellMinutes = isStaffPickActivity(activityKind)
        ? staffCellMinutes
        : supDurationMinutes;
      const range = sessionRangeFromSlots(slotStarts, cellMinutes);
      const earliestStart = range?.startIso;
      const bookedMinutes = isStaffPickActivity(activityKind)
        ? selectedWakeStarts.length * staffCellMinutes
        : selectedSupStarts.length * supDurationMinutes;
      const resourceLabel = service
        ? widgetServiceTitle(service, settings.texts)
        : "";

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
    service,
    staffCellMinutes,
    supDurationMinutes,
    settings.texts,
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
      if (isStaffPickActivity(activityKind)) {
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
    if (isStaffPickActivity(activityKind)) setStep(4);
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
        <WidgetStepEnter stepKey="branch" className="mt-3 space-y-2.5">
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
        <WidgetStepEnter stepKey="activity" className="mt-2.5 space-y-2.5">
          <WidgetBackButton onClick={() => setStep(0)} />
          {bookableServices.map((svc) => (
            <WidgetActivityCard
              key={svc.id}
              title={widgetServiceTitle(svc, settings.texts)}
              priceHint={`от ${svc.priceFrom} Br`}
              onClick={() => pickService(svc)}
              theme={theme}
            >
              {settings.behavior.showTariffsExpandable &&
                shouldShowWidgetTariffs(svc) && (
                  <TariffsBlock
                    open={tariffsOpen}
                    onToggle={() => setTariffsOpen((v) => !v)}
                    rules={widgetTariffRulesForService(svc)}
                    durationMinutes={svc.durationMinutes}
                    bookingDurations={serviceBookingDurations(svc)}
                    theme={theme}
                  />
                )}
            </WidgetActivityCard>
          ))}
        </WidgetStepEnter>
      )}

      {step === 2 && isStaffPickActivity(activityKind) && service && (
        <WidgetStepEnter stepKey="staff" className="mt-2 space-y-2.5">
          <WidgetBackButton onClick={() => setStep(1)} />
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
        <WidgetStepEnter stepKey="sup-time" className="mt-2">
          <WidgetBackButton onClick={() => setStep(1)} />
          <WidgetDateTimeStep
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
            onNext={handleTimeStepNext}
            nextLoading={submitLoading}
            nextLabel={copyMode ? "Записать" : "Далее"}
            hideBack
            theme={theme}
            slotMinutes={service.durationMinutes}
            bookingDurationMinutes={supDurationMinutes}
            showDurationPicker={supBookingDurations.length > 1}
            durationMinutes={supDurationMinutes}
            setDurationMinutes={(minutes) => {
              setSupDurationMinutes(minutes);
              setSelectedSupStarts([]);
            }}
            allowedDurations={supBookingDurations}
          />
        </WidgetStepEnter>
      )}

      {step === 3 && isStaffPickActivity(activityKind) && service && (
        <WidgetDateTimeStep
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
          slotMinutes={service.durationMinutes}
        />
      )}

      {step === 3 && activityKind === "sup" && !copyMode && selectedSupStarts.length > 0 && (
        <WidgetContactsStep
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

      {step === 4 && isStaffPickActivity(activityKind) && !copyMode && selectedWakeStarts.length > 0 && service && (
        <WidgetContactsStep
          summary={`${branch?.name} · ${widgetServiceTitle(service, settings.texts)} · ${selectedWakeStarts.length * staffCellMinutes} мин · ${[...selectedWakeStarts]
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
