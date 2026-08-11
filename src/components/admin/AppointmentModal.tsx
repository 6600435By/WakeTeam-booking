"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerField } from "@/components/admin/DatePickerField";
import { APPOINTMENT_STATUS_OPTIONS, CANCEL_REASON_OPTIONS, type CancelReason, serviceRequiresOperator, validateOperatorForCompletedStatus } from "@/lib/appointment-status";
import {
  addMinutes,
  fromDatetimeLocalValue,
  todayDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/time";
import { normalizeAdminDuration } from "@/lib/admin-duration";
import { isSearchablePhone } from "@/lib/phone";
import { hydratePriceRules, priceRuleDtoFromRow } from "@/lib/price-rules";
import { resolveServicePrice, type ServicePriceRuleDto } from "@/lib/service-pricing";
import { pricingWeekdayForDate } from "@/lib/branch-hours-constants";
import { serviceSupportsRental } from "@/lib/rental-pricing";
import {
  amountsMatchDue,
  roundMoney,
} from "@/lib/payment-amounts";
import {
  deleteGroupAppointments,
  saveAppointmentEdit,
  type GroupApptRef,
} from "@/lib/admin/appointment-group-client";
import { formatAdminError } from "@/lib/admin/format-admin-error";
import {
  getCachedAppointmentServices,
  setCachedAppointmentServices,
} from "@/lib/admin/appointment-services-cache";
import { AdminErrorBanner, adminErrorFromUnknown } from "@/components/admin/AdminErrorBanner";
import { adminFetch } from "@/lib/admin-fetch";
import {
  filterMembershipsByServiceKind,
  membershipMatchesServiceKind,
} from "@/lib/memberships/service-categories";
import { toast } from "sonner";
import type { WidgetPrefill } from "@/components/widget/BookingWidget";

const BookingWidget = dynamic(
  () =>
    import("@/components/widget/BookingWidget").then((m) => ({
      default: m.BookingWidget,
    })),
  {
    loading: () => (
      <p className="p-4 text-center text-sm text-slate-500">Загрузка виджета…</p>
    ),
  },
);

function unlockReadOnlyInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.readOnly = false;
}

type RentalItem = { id: string; name: string; price: number };
type Branch = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  kind: string;
  durationMinutes: number;
  allowedDurations: string;
  price: number;
  priceRules: ServicePriceRuleDto[];
  staff: { id: string; name: string }[];
};

function mapAdminServicesPayload(d: {
  services?: Array<{
    id: string;
    name: string;
    kind: string;
    durationMinutes: number;
    allowedDurations: string;
    price: number;
    priceRules: Array<{
      id: string;
      weekdays: string;
      timeFrom: string;
      timeTo: string;
      price: number;
      sortOrder: number;
      pricesByDuration?: string | null;
    }>;
    staff: { staff: { id: string; name: string } }[];
  }>;
}): Service[] {
  return (d.services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    durationMinutes: s.durationMinutes,
    allowedDurations: s.allowedDurations,
    price: s.price,
    priceRules: hydratePriceRules(s.priceRules).map((r) =>
      priceRuleDtoFromRow(r, s.durationMinutes),
    ),
    staff: s.staff.map((x) => x.staff),
  }));
}

type Staff = { id: string; name: string };
type OperatorOption = { memberId: string; name: string };
type MembershipOption = {
  id: string;
  externalCode: string;
  category: string | null;
  ownerName: string | null;
  effectiveRemainingMinutes: number;
  pricePerMinute: number | null;
};

type ClientSuggestion = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  branches: Branch[];
  appointmentId?: string;
  appointmentGroup?: GroupApptRef[];
  totalPrice?: number;
  /** Short create form from journal grid slot click */
  quick?: boolean;
  initial?: {
    branchId?: string;
    serviceId?: string;
    staffId?: string;
    staffName?: string;
    startAt?: string;
    durationMinutes?: number;
    firstName?: string;
    lastName?: string;
    phone?: string;
    status?: string;
    comment?: string;
    membershipId?: string | null;
    paymentMethod?: string | null;
    cashAmount?: number;
    cardAmount?: number;
    rentalItemId?: string | null;
    rentalQuantity?: number;
    operatorMemberId?: string | null;
    operatorMemberName?: string;
  };
};

const inputClass =
  "box-border h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900";

const labelClass = "mb-0.5 block text-[11px] text-slate-500";

const rentalSelectClass =
  "box-border h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900";

const rentalQtyClass =
  "box-border h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-center text-sm text-slate-900 disabled:bg-slate-100";

function tenderBtnClass(active: boolean) {
  return [
    "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
    active
      ? "border-lime-600 bg-lime-600 text-white"
      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  ].join(" ");
}

export function AppointmentModal({
  open,
  onClose,
  onSaved,
  branches,
  appointmentId,
  appointmentGroup,
  totalPrice,
  quick = false,
  initial,
}: Props) {
  const [branchId, setBranchId] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [staffName, setStaffName] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [durationInput, setDurationInput] = useState("30");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("booked");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<CancelReason | "">("");
  const [membershipId, setMembershipId] = useState<string>("");
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [amountsTouched, setAmountsTouched] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [membershipOptions, setMembershipOptions] = useState<MembershipOption[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [manualMembershipCode, setManualMembershipCode] = useState("");
  const [manualMembershipError, setManualMembershipError] = useState("");
  const [manualMembershipLoading, setManualMembershipLoading] = useState(false);
  const [clientLookupStatus, setClientLookupStatus] = useState<
    "idle" | "loading" | "found" | "new" | "ambiguous"
  >("idle");
  const [clientSuggestions, setClientSuggestions] = useState<ClientSuggestion[]>([]);
  const [price, setPrice] = useState(0);
  const [priceInput, setPriceInput] = useState("0");
  const priceTouchedRef = useRef(false);
  const preserveStoredPriceRef = useRef(false);
  const pricingSnapshotRef = useRef("");
  const [rentalItems, setRentalItems] = useState<RentalItem[]>([]);
  const [holidayDates, setHolidayDates] = useState<string[]>([]);
  const [rentalItemId, setRentalItemId] = useState("");
  const [rentalQuantity, setRentalQuantity] = useState(1);
  const [rentalHint, setRentalHint] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const [widgetSlug, setWidgetSlug] = useState("waketeam");
  const [operatorMemberId, setOperatorMemberId] = useState("");
  const [operatorOptions, setOperatorOptions] = useState<OperatorOption[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);
  const operatorTouchedRef = useRef(false);
  const [formMode, setFormMode] = useState<"quick" | "full">(quick ? "quick" : "full");
  const firstNameInputRef = useRef<HTMLInputElement>(null);
  const isQuick = formMode === "quick" && !appointmentId;
  const needsFullData = !isQuick;

  function setQuotedPrice(value: number) {
    if (!Number.isFinite(value)) return;
    const rounded = Math.round(value * 100) / 100;
    setPrice(rounded);
    setPriceInput(String(rounded));
  }

  useEffect(() => {
    if (!open) return;
    setFormMode(quick && !appointmentId ? "quick" : "full");
  }, [open, quick, appointmentId]);

  useEffect(() => {
    if (!open || !needsFullData) return;
    adminFetch("/api/admin/widget-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.slug) setWidgetSlug(d.slug);
      })
      .catch(() => {});
  }, [open, needsFullData]);

  useEffect(() => {
    if (!open) return;
    setCopyOpen(false);
    priceTouchedRef.current = false;
    operatorTouchedRef.current = Boolean(initial?.operatorMemberId);
    preserveStoredPriceRef.current = Boolean(appointmentId && (totalPrice ?? 0) > 0);
    pricingSnapshotRef.current = [
      initial?.serviceId ?? "",
      initial?.startAt ? toDatetimeLocalValue(initial.startAt).split("T")[0] : "",
      initial?.startAt ? toDatetimeLocalValue(initial.startAt).split("T")[1] : "",
      String(initial?.durationMinutes ?? 30),
      initial?.membershipId ?? "",
      initial?.rentalItemId ?? "",
      String(initial?.rentalQuantity && initial.rentalQuantity > 0 ? initial.rentalQuantity : 1),
    ].join("|");
    const initialPrice = totalPrice ?? 0;
    if (initialPrice > 0) {
      setQuotedPrice(initialPrice);
    } else {
      setPrice(0);
      setPriceInput("0");
    }
    setBranchId(initial?.branchId ?? branches[0]?.id ?? "");
    setServiceId(initial?.serviceId ?? "");
    setStaffId(initial?.staffId ?? "");
    setStaffName(initial?.staffName ?? "");
    if (initial?.startAt) {
      const local = toDatetimeLocalValue(initial.startAt);
      const [d, t] = local.split("T");
      setDate(d);
      setTime(t);
    } else {
      const now = todayDatetimeLocalValue();
      const [d, t] = now.split("T");
      setDate(d);
      setTime(t);
    }
    setDurationMinutes(initial?.durationMinutes ?? 30);
    setDurationInput(String(initial?.durationMinutes ?? 30));
    setFirstName(initial?.firstName ?? "");
    setLastName(initial?.lastName ?? "");
    setPhone(initial?.phone ?? "");
    setStatus(initial?.status ?? "booked");
    setComment(initial?.comment ?? "");
    setError("");
    setDeleteOpen(false);
    setCancelReason("");
    setMembershipId(initial?.membershipId ?? "");
    const initialCash = initial?.cashAmount ?? 0;
    const initialCard = initial?.cardAmount ?? 0;
    if (initialCash > 0 || initialCard > 0) {
      setCashAmount(initialCash);
      setCardAmount(initialCard);
      setAmountsTouched(true);
    } else if (initial?.paymentMethod === "cash" && (totalPrice ?? 0) > 0) {
      setCashAmount(totalPrice ?? 0);
      setCardAmount(0);
      setAmountsTouched(true);
    } else if (
      (initial?.paymentMethod === "card" ||
        initial?.paymentMethod === "corporate" ||
        initial?.paymentMethod === "split") &&
      (totalPrice ?? 0) > 0
    ) {
      setCashAmount(0);
      setCardAmount(totalPrice ?? 0);
      setAmountsTouched(true);
    } else {
      setCashAmount(0);
      setCardAmount(0);
      setAmountsTouched(false);
    }
    setSplitting(false);
    setRentalItemId(initial?.rentalItemId ?? "");
    setRentalQuantity(initial?.rentalQuantity && initial.rentalQuantity > 0 ? initial.rentalQuantity : 1);
    setRentalHint("");
    setMembershipOptions([]);
    setOperatorMemberId(initial?.operatorMemberId ?? "");
    setOperatorOptions(
      initial?.operatorMemberId && initial?.operatorMemberName
        ? [{ memberId: initial.operatorMemberId, name: initial.operatorMemberName }]
        : [],
    );
    setManualMembershipCode("");
    setManualMembershipError("");
    setClientLookupStatus("idle");
    setClientSuggestions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when modal opens or record changes
  }, [
    open,
    appointmentId,
    initial?.branchId,
    initial?.serviceId,
    initial?.staffId,
    initial?.staffName,
    initial?.startAt,
    initial?.durationMinutes,
    initial?.firstName,
    initial?.lastName,
    initial?.phone,
    initial?.status,
    initial?.comment,
    initial?.membershipId,
    initial?.paymentMethod,
    initial?.cashAmount,
    initial?.cardAmount,
    initial?.rentalItemId,
    initial?.rentalQuantity,
    initial?.operatorMemberId,
    initial?.operatorMemberName,
    totalPrice,
    branches[0]?.id,
  ]);

  useEffect(() => {
    if (!open || !needsFullData || priceTouchedRef.current) return;
    if (!serviceId || !date || !time) return;
    const pricingKey = [
      serviceId,
      date,
      time,
      durationInput,
      membershipId,
      rentalItemId,
      String(rentalQuantity),
    ].join("|");
    if (preserveStoredPriceRef.current) {
      if (pricingKey === pricingSnapshotRef.current) return;
      preserveStoredPriceRef.current = false;
    }
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    const parsedDuration = parseInt(durationInput, 10);
    const duration = Number.isNaN(parsedDuration)
      ? durationMinutes
      : parsedDuration;
    const iso = fromDatetimeLocalValue(`${date}T${time}`);
    if (!iso) return;
    // Membership covers service minutes — money due is rental only (regular tariff for paid minutes is on a separate segment).
    const servicePrice = membershipId
      ? 0
      : resolveServicePrice(service, new Date(iso), duration, {
          pricingWeekday: pricingWeekdayForDate(date, holidayDates),
        });

    if (!serviceSupportsRental(service.kind) || !rentalItemId) {
      setRentalHint("");
      setQuotedPrice(servicePrice);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      branchId,
      startAt: iso,
      rentalItemId,
      quantity: String(rentalQuantity),
    });
    if (appointmentId) params.set("appointmentId", appointmentId);
    if (phone.trim()) params.set("phone", phone.trim());

    adminFetch(`/api/admin/rental-quote?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRentalHint(data.hint ?? "");
        setQuotedPrice(servicePrice + (data.amount ?? 0));
      })
      .catch(() => {
        if (!cancelled) setQuotedPrice(servicePrice);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    serviceId,
    staffId,
    date,
    time,
    durationInput,
    durationMinutes,
    services,
    membershipId,
    branchId,
    rentalItemId,
    rentalQuantity,
    phone,
    appointmentId,
    holidayDates,
    needsFullData,
  ]);

  // Keep cash+card in sync with quoted due unless operator edited amounts manually
  useEffect(() => {
    if (!open || !needsFullData || amountsTouched) return;
    const due = roundMoney(price);
    setCashAmount(0);
    setCardAmount(due);
  }, [open, price, amountsTouched, needsFullData]);

  useEffect(() => {
    if (!branchId || !open || !needsFullData) {
      if (!needsFullData) setHolidayDates([]);
      return;
    }
    adminFetch(`/api/admin/branches/${branchId}/hours`)
      .then((r) => r.json())
      .then((d) => {
        setHolidayDates((d.holidays ?? []).map((h: { date: string }) => h.date));
      })
      .catch(() => setHolidayDates([]));
  }, [branchId, open, needsFullData]);

  useEffect(() => {
    if (!open || !needsFullData) return;
    adminFetch("/api/admin/memberships/sync?ifStale=1", { method: "POST" }).catch(() => {});
  }, [open, needsFullData]);

  useEffect(() => {
    if (!branchId || !open || !needsFullData) return;
    const cached = getCachedAppointmentServices(branchId);
    if (cached) {
      setServices(cached);
      setServicesLoading(false);
    } else {
      setServicesLoading(true);
    }
    let cancelled = false;
    adminFetch(`/api/admin/services?branchId=${branchId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const mapped = mapAdminServicesPayload(d);
        setCachedAppointmentServices(branchId, mapped);
        setServices(mapped);
      })
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, open, needsFullData]);

  useEffect(() => {
    if (!branchId || !open || !needsFullData) return;
    setOperatorsLoading(true);
    const q = new URLSearchParams({ branchId });
    if (date) q.set("date", date);
    adminFetch(`/api/admin/shift-resources?${q}`)
      .then((r) => r.json())
      .then((d) => {
        const onShift: OperatorOption[] = (d.onShift ?? []).map(
          (m: { memberId: string; name: string }) => ({
            memberId: m.memberId,
            name: m.name,
          }),
        );
        const allOperators: OperatorOption[] = (d.members ?? [])
          .filter((m: { role: string }) => m.role === "branch_operator")
          .map((m: { memberId: string; name: string }) => ({
            memberId: m.memberId,
            name: m.name,
          }));
        // Any operator can be selected; missing shift is auto-created as panelOnly.
        const list = allOperators.length > 0 ? allOperators : onShift;
        setOperatorOptions((prev) => {
          const merged = new Map<string, OperatorOption>();
          for (const item of [...prev, ...onShift, ...list]) {
            merged.set(item.memberId, item);
          }
          return [...merged.values()];
        });
      })
      .catch(() => {})
      .finally(() => setOperatorsLoading(false));
  }, [branchId, open, date, needsFullData]);

  useEffect(() => {
    if (!open || !needsFullData || operatorTouchedRef.current) return;
    if (!branchId || !staffId || !date || !time) return;
    const svc = services.find((s) => s.id === serviceId);
    if (!serviceRequiresOperator(svc?.kind)) {
      setOperatorMemberId("");
      return;
    }
    const iso = fromDatetimeLocalValue(`${date}T${time}`);
    if (!iso) return;

    let cancelled = false;
    adminFetch(
      `/api/admin/appointments/operator-at?branchId=${encodeURIComponent(branchId)}&staffId=${encodeURIComponent(staffId)}&startAt=${encodeURIComponent(iso)}&serviceId=${encodeURIComponent(serviceId)}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setOperatorMemberId((d.operatorMemberId as string | null) ?? "");
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open, branchId, staffId, date, time, serviceId, services, needsFullData]);

  useEffect(() => {
    if (!branchId || !open || !needsFullData) return;
    adminFetch(`/api/admin/branches/${branchId}/rental-items`)
      .then((r) => r.json())
      .then((d) => {
        setRentalItems(
          (d.items ?? [])
            .filter((i: { isActive: boolean }) => i.isActive)
            .map((i: { id: string; name: string; price: number }) => ({
              id: i.id,
              name: i.name,
              price: i.price,
            })),
        );
      })
      .catch(() => setRentalItems([]));
  }, [branchId, open, needsFullData]);

  useEffect(() => {
    if (!open) return;
    if (!isSearchablePhone(phone)) {
      setClientLookupStatus("idle");
      setClientSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      setClientLookupStatus("loading");
      adminFetch(`/api/admin/clients/lookup?phone=${encodeURIComponent(phone)}`)
        .then((r) => r.json())
        .then((data) => {
          const list: ClientSuggestion[] = data.clients ?? [];
          if (data.client) {
            setFirstName(data.client.firstName ?? "");
            setLastName(data.client.lastName ?? "");
            setClientLookupStatus("found");
            setClientSuggestions(data.multiple ? list : []);
          } else if (list.length > 1) {
            setClientLookupStatus("ambiguous");
            setClientSuggestions(list);
          } else {
            setClientLookupStatus("new");
            setClientSuggestions([]);
          }
        })
        .catch(() => {
          setClientLookupStatus("idle");
          setClientSuggestions([]);
        });
    }, 400);
    return () => clearTimeout(t);
  }, [open, phone]);

  function applyClientSuggestion(c: ClientSuggestion) {
    setPhone(c.phone);
    setFirstName(c.firstName ?? "");
    setLastName(c.lastName ?? "");
    setClientLookupStatus("found");
    setClientSuggestions([]);
  }

  useEffect(() => {
    if (!open || servicesLoading || services.length === 0) return;
    if (!initial?.staffId || staffId !== initial.staffId) return;
    if (serviceId) return;

    const candidates = services.filter((s) =>
      s.staff.some((st) => st.id === initial.staffId),
    );
    if (candidates.length === 0) return;

    const preferred = initial.durationMinutes;
    const match =
      (preferred != null
        ? candidates.find((s) => s.durationMinutes === preferred) ??
          candidates.find((s) =>
            s.allowedDurations
              .split(",")
              .map((x) => parseInt(x.trim(), 10))
              .filter((n) => !Number.isNaN(n))
              .includes(preferred),
          )
        : undefined) ?? candidates[0];

    setServiceId(match.id);
  }, [
    open,
    services,
    servicesLoading,
    initial?.staffId,
    initial?.durationMinutes,
    staffId,
    serviceId,
  ]);

  useEffect(() => {
    if (!open || !needsFullData) return;
    const trimmed = phone.replace(/\s/g, "");
    if (!isSearchablePhone(trimmed)) {
      setMembershipOptions([]);
      return;
    }
    const serviceKind = services.find((s) => s.id === serviceId)?.kind ?? "wake";
    const t = setTimeout(() => {
      setMembershipsLoading(true);
      const include =
        initial?.membershipId != null && initial.membershipId !== ""
          ? `&includeId=${encodeURIComponent(initial.membershipId)}`
          : "";
      Promise.all([
        adminFetch(
          `/api/admin/memberships?phone=${encodeURIComponent(phone)}${include}`,
        ).then((r) => r.json()),
        adminFetch(`/api/admin/memberships/suggest?phone=${encodeURIComponent(phone)}`).then(
          (r) => r.json(),
        ),
      ])
        .then(([listData, suggestData]) => {
          const list: MembershipOption[] = (listData.memberships ?? []).map(
            (m: MembershipOption & { id: string }) => ({
              id: m.id,
              externalCode: m.externalCode,
              category: m.category,
              ownerName: m.ownerName,
              effectiveRemainingMinutes: m.effectiveRemainingMinutes,
              pricePerMinute: m.pricePerMinute ?? null,
            }),
          );
          const filtered = filterMembershipsByServiceKind(list, serviceKind);
          setMembershipOptions(filtered);
          const suggestion = suggestData.suggestion as MembershipOption | null;
          if (
            !membershipId &&
            suggestion &&
            membershipMatchesServiceKind(suggestion.category, serviceKind) &&
            suggestion.effectiveRemainingMinutes > 0
          ) {
            setMembershipId(suggestion.id);
          }
        })
        .finally(() => setMembershipsLoading(false));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phone and service drive lookup
  }, [open, phone, initial?.membershipId, serviceId, services, needsFullData]);

  useEffect(() => {
    const serviceKind = services.find((s) => s.id === serviceId)?.kind ?? "wake";
    setMembershipOptions((prev) => {
      const filtered = filterMembershipsByServiceKind(prev, serviceKind);
      return filtered.length === prev.length ? prev : filtered;
    });
    if (!membershipId) return;
    const selected = membershipOptions.find((m) => m.id === membershipId);
    if (!selected || !membershipMatchesServiceKind(selected.category, serviceKind)) {
      setMembershipId("");
      setManualMembershipCode("");
    }
  }, [serviceId, services, membershipId, membershipOptions]);

  useEffect(() => {
    const selected = membershipOptions.find((m) => m.id === membershipId);
    if (selected) setManualMembershipCode(selected.externalCode);
  }, [membershipId, membershipOptions]);

  const staffOptions: Staff[] = useMemo(() => {
    const fromService =
      services.find((s) => s.id === serviceId)?.staff ?? [];
    if (staffId && !fromService.some((s) => s.id === staffId) && staffName) {
      return [{ id: staffId, name: staffName }, ...fromService];
    }
    return fromService;
  }, [services, serviceId, staffId, staffName]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const isSupService = selectedService?.kind === "sup";

  const showRental = selectedService
    ? serviceSupportsRental(selectedService.kind)
    : false;

  const selectedMembership = membershipOptions.find((m) => m.id === membershipId);

  async function applyManualMembershipCode() {
    const code = manualMembershipCode.trim();
    if (!code) {
      setManualMembershipError("Введите номер абонемента");
      return;
    }
    setManualMembershipLoading(true);
    setManualMembershipError("");
    try {
      const res = await adminFetch(
        `/api/admin/memberships?code=${encodeURIComponent(code)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatAdminError(data, "Абонемент не найден"));
      }
      const found: MembershipOption = {
        id: data.membership.id,
        externalCode: data.membership.externalCode,
        category: data.membership.category,
        ownerName: data.membership.ownerName,
        effectiveRemainingMinutes: data.membership.effectiveRemainingMinutes,
        pricePerMinute: data.membership.pricePerMinute ?? null,
      };
      const serviceKind = selectedService?.kind ?? "wake";
      if (!membershipMatchesServiceKind(found.category, serviceKind)) {
        throw new Error(
          serviceKind === "sup"
            ? "Для сапборда подходит только абонемент категории «САП Подарочный»"
            : "Для вейка подходят только абонементы «Подарочный» и «Абонемент»",
        );
      }
      setMembershipOptions((prev) => {
        if (prev.some((m) => m.id === found.id)) return prev;
        return [found, ...prev];
      });
      setMembershipId(found.id);
      setManualMembershipCode(found.externalCode);
    } catch (err) {
      setManualMembershipError(
        err instanceof Error ? err.message : "Абонемент не найден",
      );
    } finally {
      setManualMembershipLoading(false);
    }
  }

  // Mobile only: pin quick sheet inside the visual viewport (above keyboard).
  // Desktop keeps the default centered dialog — applying top/maxHeight there
  // clips the form and hides duration/phone fields.
  useEffect(() => {
    if (!open || !isQuick) return;

    let popup: HTMLElement | null = null;
    let raf = 0;
    let cleaned = false;
    const vv = window.visualViewport;
    const mobileMq = window.matchMedia("(max-width: 639px)");

    const clearInline = () => {
      if (!popup) return;
      popup.style.maxHeight = "";
      popup.style.top = "";
      popup.style.bottom = "";
    };

    const apply = () => {
      if (!popup) return;
      if (!mobileMq.matches || !vv) {
        clearInline();
        return;
      }
      const top = Math.max(0, Math.round(vv.offsetTop));
      const height = Math.max(280, Math.floor(vv.height - 8));
      popup.style.top = `${top}px`;
      popup.style.maxHeight = `${height}px`;
      popup.style.bottom = "auto";
    };

    const bind = () => {
      if (cleaned) return;
      popup = document.querySelector(
        "[data-quick-appointment-dialog]",
      ) as HTMLElement | null;
      if (!popup) {
        raf = window.requestAnimationFrame(bind);
        return;
      }
      apply();
      vv?.addEventListener("resize", apply);
      vv?.addEventListener("scroll", apply);
      mobileMq.addEventListener("change", apply);
    };

    bind();
    return () => {
      cleaned = true;
      window.cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      mobileMq.removeEventListener("change", apply);
      clearInline();
    };
  }, [open, isQuick]);

  useEffect(() => {
    if (!open || !isQuick) return;
    // Autofocus phone only on mobile — desktop focus+scroll was jumping the modal.
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const t = window.setTimeout(() => {
      const phoneInput = document.getElementById(
        "quick-client-phone",
      ) as HTMLInputElement | null;
      phoneInput?.focus({ preventScroll: true });
      phoneInput?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [open, isQuick]);

  if (!open) return null;

  function buildCopyPrefill(): WidgetPrefill | null {
    const svc = services.find((s) => s.id === serviceId);
    if (!branchId || !serviceId || !staffId || !phone.trim() || !firstName.trim()) {
      return null;
    }
    return {
      branchId,
      serviceId,
      staffId,
      activityKind: svc?.kind === "sup" ? "sup" : "wake",
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      phone: phone.trim(),
      comment: comment.trim() || undefined,
    };
  }

  const copyPrefill = buildCopyPrefill();

  function normalizeDurationInput(value: number): number {
    return normalizeAdminDuration(value);
  }

  function commitDurationInput(raw = durationInput): number {
    const parsed = parseInt(raw, 10);
    const normalized = normalizeDurationInput(
      Number.isNaN(parsed) ? durationMinutes : parsed,
    );
    setDurationMinutes(normalized);
    setDurationInput(String(normalized));
    return normalized;
  }

  async function handleSubmit(e?: React.FormEvent, opts?: { andNext?: boolean }) {
    e?.preventDefault();
    if (!date || !time) {
      setError("Укажите дату и время");
      return;
    }
    if (!serviceId || !staffId) {
      setError("Не выбран ресурс или услуга");
      return;
    }
    if (!firstName.trim() || !phone.trim()) {
      setError("Укажите имя и телефон");
      return;
    }
    // Payment / operator / membership minutes are required only when completing.
    const requiresSettlement = status === "completed";
    if (requiresSettlement) {
      const operatorError = validateOperatorForCompletedStatus(
        status,
        operatorMemberId || null,
        selectedService?.kind,
      );
      if (operatorError) {
        setError(operatorError);
        return;
      }
    }
    const due = isQuick ? 0 : roundMoney(parseFloat(priceInput) || price);
    const cash = requiresSettlement && !isQuick ? roundMoney(cashAmount) : 0;
    const card = requiresSettlement && !isQuick ? roundMoney(cardAmount) : 0;
    if (requiresSettlement && !isQuick && !amountsMatchDue(cash, card, due)) {
      setError(
        `Сумма наличных и карты (${(cash + card).toFixed(2)}) не равна сумме к оплате (${due.toFixed(2)}). Исправьте поля оплаты.`,
      );
      return;
    }
    if (
      requiresSettlement &&
      !isQuick &&
      membershipId &&
      selectedMembership &&
      selectedMembership.effectiveRemainingMinutes < durationMinutes
    ) {
      setError(
        `Недостаточно минут на абонементе (остаток ${selectedMembership.effectiveRemainingMinutes} мин, нужно ${durationMinutes}). Разделите запись или уменьшите длительность / выберите другой абонемент.`,
      );
      return;
    }
    setLoading(true);
    setError("");
    const isoStart = fromDatetimeLocalValue(`${date}T${time}`);
    const duration = commitDurationInput();
    const priceValue = due;
    const savePayload = {
      serviceId,
      staffId,
      startAt: isoStart,
      durationMinutes: duration,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      status: isQuick ? status || "booked" : status,
      comment: isQuick ? "" : comment,
      membershipId: isQuick ? null : membershipId || null,
      // Omit tender amounts unless completing — server rejects 0+0 when price > 0
      ...(requiresSettlement ? { cashAmount: cash, cardAmount: card } : {}),
      rentalItemId: isQuick ? null : showRental && rentalItemId ? rentalItemId : null,
      rentalQuantity: isQuick ? 0 : showRental && rentalItemId ? rentalQuantity : 0,
      price: priceValue,
      priceManual: isQuick ? false : priceTouchedRef.current,
      operatorMemberId: isQuick || isSupService ? null : operatorMemberId || null,
    };
    try {
      if (appointmentId && appointmentGroup && appointmentGroup.length > 1) {
        await saveAppointmentEdit({
          group: appointmentGroup,
          isoStart,
          newStaffId: staffId,
          newServiceId: serviceId,
          newDuration: duration,
          totalPrice: priceValue,
          firstName,
          lastName,
          phone,
          status,
          comment,
          membershipId: membershipId || null,
          ...(requiresSettlement ? { cashAmount: cash, cardAmount: card } : {}),
          rentalItemId: showRental && rentalItemId ? rentalItemId : null,
          rentalQuantity: showRental && rentalItemId ? rentalQuantity : 0,
          operatorMemberId: isSupService ? null : operatorMemberId || null,
        });
        setLoading(false);
        onClose();
        void Promise.resolve(onSaved());
        return;
      }

      const url = appointmentId
        ? `/api/admin/appointments/${appointmentId}`
        : "/api/admin/appointments";
      const method = appointmentId ? "PATCH" : "POST";
      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(savePayload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw Object.assign(new Error(formatAdminError(data, "Не удалось сохранить запись")), {
          api: data,
        });
      }

      // Close immediately — journal refresh is fire-and-forget.
      if (opts?.andNext && isQuick) {
        const nextStart = addMinutes(new Date(isoStart), duration);
        const local = toDatetimeLocalValue(nextStart.toISOString());
        const [d, t] = local.split("T");
        setDate(d);
        setTime(t);
        setFirstName("");
        setLastName("");
        setPhone("");
        setStatus("booked");
        setClientLookupStatus("idle");
        setClientSuggestions([]);
        setError("");
        setLoading(false);
        void Promise.resolve(onSaved());
        requestAnimationFrame(() => firstNameInputRef.current?.focus());
        return;
      }

      setLoading(false);
      onClose();
      void Promise.resolve(onSaved());
    } catch (err) {
      const parts = adminErrorFromUnknown(
        err && typeof err === "object" && "api" in err
          ? (err as { api: unknown }).api
          : err,
        "Не удалось сохранить запись",
      );
      const message = parts.hint ? `${parts.error}. ${parts.hint}` : parts.error;
      setError(message);
      toast.error(parts.error, {
        description: parts.hint ?? "Исправьте данные в форме и сохраните снова.",
        duration: 8000,
      });
      setLoading(false);
    }
  }

  async function handleSplit() {
    if (!appointmentId) return;
    setSplitting(true);
    setError("");
    try {
      const groupIds =
        appointmentGroup && appointmentGroup.length > 0
          ? appointmentGroup.map((a) => a.id)
          : [appointmentId];
      const res = await adminFetch(`/api/admin/appointments/${appointmentId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupAppointmentIds: groupIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(formatAdminError(data, "Не удалось разделить запись")), {
          api: data,
        });
      }
      toast.success("Запись разделена на две части", {
        description: `${data.firstDuration}+${data.secondDuration} мин — в журнале два блока. На каждом настройте абонемент или оплату.`,
      });
      onClose();
      void Promise.resolve(onSaved());
    } catch (err) {
      const parts = adminErrorFromUnknown(
        err && typeof err === "object" && "api" in err
          ? (err as { api: unknown }).api
          : err,
        "Не удалось разделить запись",
      );
      setError(parts.hint ? `${parts.error}. ${parts.hint}` : parts.error);
    } finally {
      setSplitting(false);
    }
  }

  async function handleDelete() {
    if (!appointmentId || !cancelReason) {
      setError("Выберите причину удаления");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (appointmentGroup && appointmentGroup.length > 1) {
        await deleteGroupAppointments(appointmentGroup);
        onSaved();
        onClose();
        return;
      }

      const res = await adminFetch(`/api/admin/appointments/${appointmentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(formatAdminError(data, "Ошибка удаления"));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const slotSummaryMinutes = (() => {
    const parsed = parseInt(durationInput, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? durationMinutes : parsed;
  })();
  const slotSummary = [
    staffName || "Ресурс",
    date && time ? `${date} ${time}` : null,
    `${slotSummaryMinutes} мин`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (isQuick) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          showCloseButton
          data-quick-appointment-dialog
          className="w-full max-w-md gap-3 p-4 font-sans sm:max-h-[min(90vh,720px)] sm:max-w-md sm:overflow-y-auto max-sm:top-0 max-sm:right-0 max-sm:bottom-auto max-sm:left-0 max-sm:mt-0 max-sm:flex max-sm:max-h-[min(92dvh,100svh)] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:flex-col max-sm:overflow-hidden max-sm:rounded-t-none max-sm:rounded-b-2xl"
        >
          <DialogHeader className="shrink-0 pr-8 text-left">
            <DialogTitle className="text-base font-bold text-slate-900">
              Быстрая запись
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="flex min-h-0 flex-1 flex-col gap-2 max-sm:overflow-hidden"
            autoComplete="off"
          >
            <div className="min-h-0 flex-1 space-y-2 max-sm:overflow-y-auto max-sm:overscroll-contain">
              <p className="rounded-md bg-slate-50 px-2.5 py-2 text-sm text-slate-700">
                {slotSummary}
              </p>
              <div>
                <label className={labelClass} htmlFor="quick-booking-duration">
                  Длительность, мин
                </label>
                <input
                  id="quick-booking-duration"
                  name="quick-booking-duration"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore
                  value={durationInput}
                  readOnly
                  onFocus={unlockReadOnlyInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "" || /^\d+$/.test(raw)) {
                      setDurationInput(raw);
                    }
                  }}
                  onBlur={() => {
                    if (durationInput === "") {
                      commitDurationInput(String(durationMinutes));
                    } else {
                      commitDurationInput();
                    }
                  }}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="quick-client-phone">
                  Телефон
                </label>
                <input
                  id="quick-client-phone"
                  placeholder="+375 …"
                  name="quick-client-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  required
                />
                {clientLookupStatus === "loading" && (
                  <p className="mt-0.5 text-[10px] text-slate-400">Поиск…</p>
                )}
                {clientLookupStatus === "found" && (
                  <p className="mt-0.5 text-[10px] text-lime-700">Клиент найден</p>
                )}
                {clientLookupStatus === "new" && (
                  <p className="mt-0.5 text-[10px] text-slate-500">Новый клиент</p>
                )}
                {clientSuggestions.length > 1 && (
                  <ul className="mt-1 max-h-28 overflow-y-auto rounded border border-slate-200 bg-white text-xs">
                    {clientSuggestions.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-2 py-1.5 text-left hover:bg-slate-50"
                          onClick={() => applyClientSuggestion(c)}
                        >
                          {[c.firstName, c.lastName].filter(Boolean).join(" ") ||
                            "Без имени"}{" "}
                          <span className="text-slate-400">{c.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className={labelClass} htmlFor="quick-client-first-name">
                  Имя
                </label>
                <input
                  ref={firstNameInputRef}
                  id="quick-client-first-name"
                  name="quick-client-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onFocus={(e) => {
                    if (!window.matchMedia("(max-width: 639px)").matches) return;
                    e.currentTarget.scrollIntoView({
                      block: "center",
                      behavior: "smooth",
                    });
                  }}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="quick-status">
                  Статус
                </label>
                <select
                  id="quick-status"
                  value={status}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStatus(next);
                    if (next === "completed") setFormMode("full");
                  }}
                  className={inputClass}
                >
                  {APPOINTMENT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {error && (
                <AdminErrorBanner title="Не удалось сохранить" error={error} />
              )}
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 pt-2 max-sm:pb-[max(0.25rem,env(safe-area-inset-bottom))]">
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-lime-600 py-2.5 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
              >
                {loading ? "…" : "Сохранить"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleSubmit(undefined, { andNext: true })}
                className="rounded-md border border-lime-600 py-2.5 text-sm font-medium text-lime-700 hover:bg-lime-50 disabled:opacity-50"
              >
                {loading ? "…" : "Сохранить и ещё"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent
          showCloseButton
          className="max-h-[min(92dvh,92svh)] w-full max-w-md overflow-y-auto overscroll-contain p-4 font-sans sm:max-w-md"
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="text-base font-bold text-slate-900">
              {appointmentId ? "Редактировать запись" : "Новая запись"}
            </DialogTitle>
          </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2" autoComplete="off">
          <div>
            <label className={labelClass}>Филиал</label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setServiceId("");
                setStaffId("");
                setStaffName("");
              }}
              className={inputClass}
              required
            >
              <option value="">Филиал</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Услуга</label>
              <select
                value={serviceId}
                onChange={(e) => {
                  const nextServiceId = e.target.value;
                  setServiceId(nextServiceId);
                  setStaffId("");
                  setStaffName("");
                  const svc = services.find((s) => s.id === nextServiceId);
                  if (!serviceRequiresOperator(svc?.kind)) {
                    setOperatorMemberId("");
                    operatorTouchedRef.current = true;
                  } else {
                    operatorTouchedRef.current = false;
                  }
                }}
                className={inputClass}
                required
                disabled={servicesLoading}
              >
                <option value="">{servicesLoading ? "…" : "Услуга"}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Реверс / сап</label>
              <select
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  const picked = staffOptions.find((s) => s.id === e.target.value);
                  setStaffName(picked?.name ?? "");
                  operatorTouchedRef.current = false;
                }}
                className={inputClass}
                required
                disabled={!serviceId || servicesLoading}
              >
                <option value="">Выберите</option>
                {staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Оператор</label>
            <select
              value={operatorMemberId}
              onChange={(e) => {
                operatorTouchedRef.current = true;
                setOperatorMemberId(e.target.value);
              }}
              className={inputClass}
              disabled={!branchId || operatorsLoading || isSupService}
              required={status === "completed" && !isSupService}
            >
              <option value="">
                {isSupService
                  ? "Не требуется"
                  : operatorsLoading
                    ? "…"
                    : "Не назначен"}
              </option>
              {operatorOptions.map((o) => (
                <option key={o.memberId} value={o.memberId}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <div>
              <DatePickerField
                id="wt-booking-date"
                label="Дата"
                value={date}
                onChange={setDate}
                className={inputClass}
                labelClassName={labelClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wt-booking-time">
                Время
              </label>
              <input
                id="wt-booking-time"
                name="wt-booking-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={inputClass}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass} htmlFor="wt-booking-duration">
                Мин
              </label>
              <input
                id="wt-booking-duration"
                name="wt-booking-duration"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore
                value={durationInput}
                readOnly
                onFocus={unlockReadOnlyInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "" || /^\d+$/.test(raw)) {
                    setDurationInput(raw);
                  }
                }}
                onBlur={() => {
                  if (durationInput === "") {
                    commitDurationInput(String(durationMinutes));
                  } else {
                    commitDurationInput();
                  }
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="wt-booking-price">
                Стоимость, Br
              </label>
              <input
                id="wt-booking-price"
                name="wt-booking-price"
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(e) => {
                  const raw = e.target.value.replace(",", ".");
                  if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) {
                    priceTouchedRef.current = true;
                    setPriceInput(raw);
                    const parsed = parseFloat(raw);
                    if (!Number.isNaN(parsed)) setPrice(parsed);
                  }
                }}
                onBlur={() => {
                  const parsed = parseFloat(priceInput);
                  if (!Number.isNaN(parsed)) {
                    setQuotedPrice(parsed);
                  } else {
                    setPriceInput(String(price));
                  }
                }}
                className={inputClass}
                required={status === "completed"}
              />
            </div>
          </div>
          {showRental && (
            <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2">
              <p className="mb-1.5 text-[11px] font-medium text-slate-600">
                Прокат инвентаря
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] gap-2">
                <div className="min-w-0">
                  <label className={labelClass}>Инвентарь</label>
                  <select
                    value={rentalItemId}
                    onChange={(e) => setRentalItemId(e.target.value)}
                    className={rentalSelectClass}
                  >
                    <option value="">Без инвентаря</option>
                    {rentalItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {item.price} Br
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Комплектов</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    inputMode="numeric"
                    value={rentalQuantity}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setRentalQuantity(Number.isNaN(n) || n < 1 ? 1 : n);
                    }}
                    disabled={!rentalItemId}
                    className={rentalQtyClass}
                  />
                </div>
              </div>
              {rentalHint && (
                <p className="mt-1 text-[10px] text-amber-700">{rentalHint}</p>
              )}
              {rentalItemId && !rentalHint && (
                <p className="mt-1 text-[10px] text-slate-500">
                  Стоимость проката не зависит от длительности и взимается один
                  раз в день.
                </p>
              )}
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="client-phone">
              Телефон
            </label>
            <input
              id="client-phone"
              placeholder="+375 …"
              name="client-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              required
            />
            {clientLookupStatus === "loading" && (
              <p className="mt-0.5 text-[10px] text-slate-400">Поиск…</p>
            )}
            {clientLookupStatus === "found" && (
              <p className="mt-0.5 text-[10px] text-lime-700">Клиент найден</p>
            )}
            {clientLookupStatus === "new" && (
              <p className="mt-0.5 text-[10px] text-slate-500">Новый клиент</p>
            )}
          </div>
          <div>
            <label className={labelClass}>Клиент</label>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Имя"
                name="client-given-name"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                required
              />
              <input
                placeholder="Фамилия"
                name="client-family-name"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {clientLookupStatus === "ambiguous" && clientSuggestions.length > 0 && (
            <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-1.5">
              <p className="text-[10px] text-slate-500">Выберите клиента:</p>
              {clientSuggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => applyClientSuggestion(c)}
                  className="block w-full rounded px-2 py-1 text-left text-xs text-slate-800 hover:bg-white"
                >
                  <span className="font-medium">{c.phone}</span>
                  {[c.firstName, c.lastName].filter(Boolean).length > 0 && (
                    <span className="text-slate-600">
                      {" "}
                      — {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className={labelClass}>Абонемент</label>
            <select
              value={membershipId}
              onChange={(e) => setMembershipId(e.target.value)}
              className={inputClass}
              disabled={membershipsLoading}
            >
              <option value="">
                {membershipsLoading ? "Абонементы…" : "Без абонемента"}
              </option>
              {membershipOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {[m.externalCode, m.category, m.ownerName]
                    .filter(Boolean)
                    .join(" · ")}{" "}
                  — {m.effectiveRemainingMinutes} мин
                </option>
              ))}
            </select>
            <div className="mt-1 flex gap-1.5">
              <input
                type="text"
                placeholder="Номер вручную"
                value={manualMembershipCode}
                onChange={(e) => {
                  setManualMembershipCode(e.target.value);
                  setManualMembershipError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyManualMembershipCode();
                  }
                }}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => void applyManualMembershipCode()}
                disabled={manualMembershipLoading || !manualMembershipCode.trim()}
                className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {manualMembershipLoading ? "…" : "Найти"}
              </button>
            </div>
            {manualMembershipError && (
              <p className="mt-0.5 text-[10px] text-red-600">{manualMembershipError}</p>
            )}
            {selectedMembership && (
              <p
                className={`mt-0.5 text-[10px] ${
                  selectedMembership.effectiveRemainingMinutes < durationMinutes
                    ? "font-medium text-amber-700"
                    : "text-slate-600"
                }`}
              >
                Остаток: {selectedMembership.effectiveRemainingMinutes} мин
                {selectedMembership.effectiveRemainingMinutes < durationMinutes && (
                  <> — не хватает для {durationMinutes} мин. Разделите запись или оплатите остаток.</>
                )}
              </p>
            )}
          </div>
          {appointmentId && (
            <button
              type="button"
              disabled={splitting || loading}
              onClick={() => void handleSplit()}
              className="w-full rounded-md border border-slate-300 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {splitting ? "Делим…" : "Разделить запись"}
            </button>
          )}
          <div>
            <label className={labelClass}>
              Оплата · к оплате {roundMoney(parseFloat(priceInput) || price).toFixed(2)} Br
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={labelClass}>Наличные</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={cashAmount}
                  onChange={(e) => {
                    setAmountsTouched(true);
                    const due = roundMoney(parseFloat(priceInput) || price);
                    const raw = parseFloat(e.target.value);
                    const nextCash = Number.isFinite(raw)
                      ? roundMoney(Math.min(Math.max(0, raw), due))
                      : 0;
                    setCashAmount(nextCash);
                    setCardAmount(roundMoney(due - nextCash));
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Карта</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  value={cardAmount}
                  onChange={(e) => {
                    setAmountsTouched(true);
                    const due = roundMoney(parseFloat(priceInput) || price);
                    const raw = parseFloat(e.target.value);
                    const nextCard = Number.isFinite(raw)
                      ? roundMoney(Math.min(Math.max(0, raw), due))
                      : 0;
                    setCardAmount(nextCard);
                    setCashAmount(roundMoney(due - nextCard));
                  }}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={tenderBtnClass(cashAmount > 0 && cardAmount === 0)}
                onClick={() => {
                  setAmountsTouched(true);
                  const due = roundMoney(parseFloat(priceInput) || price);
                  setCashAmount(due);
                  setCardAmount(0);
                }}
              >
                Всё наличными
              </button>
              <button
                type="button"
                className={tenderBtnClass(cardAmount > 0 && cashAmount === 0)}
                onClick={() => {
                  setAmountsTouched(true);
                  const due = roundMoney(parseFloat(priceInput) || price);
                  setCashAmount(0);
                  setCardAmount(due);
                }}
              >
                Всё картой
              </button>
            </div>
            {status === "completed" &&
              !amountsMatchDue(
                cashAmount,
                cardAmount,
                roundMoney(parseFloat(priceInput) || price),
              ) && (
              <p className="mt-1 text-[10px] text-amber-700">
                Сумма наличных и карты должна равняться сумме к оплате.
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Статус</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              {APPOINTMENT_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            placeholder="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="box-border w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900"
            rows={1}
          />
          {error && (
            <AdminErrorBanner title="Не удалось сохранить" error={error} />
          )}
          <div className={`grid gap-2 ${appointmentId ? "grid-cols-2" : "grid-cols-1"}`}>
            {appointmentId && (
              <button
                type="button"
                disabled={!copyPrefill || loading}
                onClick={() => copyPrefill && setCopyOpen(true)}
                className="rounded-md border border-slate-300 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Копировать запись
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-lime-600 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50"
            >
              {loading ? "…" : "Сохранить"}
            </button>
          </div>
          {appointmentId && (
            <div className="border-t border-slate-200 pt-2">
              {!deleteOpen ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="w-full rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  Удалить запись
                </button>
              ) : (
                <div className="space-y-1.5 rounded-md border border-red-200 bg-red-50/50 p-2">
                  <p className="text-xs font-medium text-red-800">
                    Удалить запись из журнала?
                  </p>
                  <select
                    value={cancelReason}
                    onChange={(e) =>
                      setCancelReason(e.target.value as CancelReason | "")
                    }
                    className={inputClass}
                    required
                  >
                    <option value="">Причина…</option>
                    {CANCEL_REASON_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading || !cancelReason}
                      onClick={handleDelete}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {loading ? "…" : "Удалить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteOpen(false);
                        setCancelReason("");
                      }}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                    >
                      Назад
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
        </DialogContent>
      </Dialog>
      <Dialog open={copyOpen && !!copyPrefill} onOpenChange={setCopyOpen}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(92dvh,92svh)] w-full max-w-md flex-col overflow-hidden p-0 sm:max-w-md"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Копировать запись</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {copyPrefill && (
              <BookingWidget
                key={`copy-${appointmentId}`}
                slug={widgetSlug}
                prefill={copyPrefill}
                copyMode
                onCopyBookingDone={() => {
                  setCopyOpen(false);
                  onSaved();
                  onClose();
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
