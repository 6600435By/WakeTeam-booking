"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { APPOINTMENT_STATUS_OPTIONS, CANCEL_REASON_OPTIONS, type CancelReason } from "@/lib/appointment-status";
import {
  fromDatetimeLocalValue,
  todayDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/time";
import { normalizeAdminDuration } from "@/lib/admin-duration";
import { isSearchablePhone } from "@/lib/phone";
import { resolveAppointmentPrice, type ServicePriceRuleDto } from "@/lib/service-pricing";
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from "@/lib/payment-method";
import {
  deleteGroupAppointments,
  saveAppointmentEdit,
  type GroupApptRef,
} from "@/lib/admin/appointment-group-client";
import { adminFetch } from "@/lib/admin-fetch";
import {
  BookingWidget,
  type WidgetPrefill,
} from "@/components/widget/BookingWidget";

function unlockReadOnlyInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.readOnly = false;
}

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
type Staff = { id: string; name: string };
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
  onSaved: () => void;
  branches: Branch[];
  appointmentId?: string;
  appointmentGroup?: GroupApptRef[];
  totalPrice?: number;
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
  };
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900";

const labelClass = "mb-0.5 block text-[11px] text-slate-500";

function paymentMethodBtnClass(active: boolean) {
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
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
  const skipAutoPriceRef = useRef(true);
  const [copyOpen, setCopyOpen] = useState(false);
  const [widgetSlug, setWidgetSlug] = useState("waketeam");

  function setQuotedPrice(value: number) {
    const rounded = Math.round(value * 100) / 100;
    setPrice(rounded);
    setPriceInput(String(rounded));
  }

  useEffect(() => {
    if (!open) return;
    adminFetch("/api/admin/widget-settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.slug) setWidgetSlug(d.slug);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCopyOpen(false);
    priceTouchedRef.current = false;
    skipAutoPriceRef.current = Boolean(appointmentId && (totalPrice ?? 0) > 0);
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
    setPaymentMethod((initial?.paymentMethod as PaymentMethod | undefined) ?? "");
    setMembershipOptions([]);
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
    totalPrice,
    branches[0]?.id,
  ]);

  useEffect(() => {
    if (!open || priceTouchedRef.current) return;
    if (!serviceId || !date || !time) return;
    if (skipAutoPriceRef.current) {
      skipAutoPriceRef.current = false;
      return;
    }
    const service = services.find((s) => s.id === serviceId);
    if (!service) return;
    const parsedDuration = parseInt(durationInput, 10);
    const duration = Number.isNaN(parsedDuration)
      ? durationMinutes
      : parsedDuration;
    const iso = fromDatetimeLocalValue(`${date}T${time}`);
    if (!iso) return;
    const membershipRate = membershipId
      ? membershipOptions.find((m) => m.id === membershipId)?.pricePerMinute
      : null;
    setQuotedPrice(
      resolveAppointmentPrice(
        service,
        new Date(iso),
        duration,
        membershipRate,
      ),
    );
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
    membershipOptions,
  ]);

  useEffect(() => {
    if (!open) return;
    adminFetch("/api/admin/memberships/sync?ifStale=1", { method: "POST" }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!branchId || !open) return;
    setServicesLoading(true);
    adminFetch(`/api/admin/services?branchId=${branchId}`)
      .then((r) => r.json())
      .then((d) => {
        const mapped: Service[] = (d.services ?? []).map(
          (s: {
            id: string;
            name: string;
            kind: string;
            durationMinutes: number;
            allowedDurations: string;
            price: number;
            priceRules: ServicePriceRuleDto[];
            staff: { staff: { id: string; name: string } }[];
          }) => ({
            id: s.id,
            name: s.name,
            kind: s.kind,
            durationMinutes: s.durationMinutes,
            allowedDurations: s.allowedDurations,
            price: s.price,
            priceRules: s.priceRules ?? [],
            staff: s.staff.map((x) => x.staff),
          }),
        );
        setServices(mapped);
      })
      .finally(() => setServicesLoading(false));
  }, [branchId, open]);

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
    if (!open) return;
    const trimmed = phone.replace(/\s/g, "");
    if (!isSearchablePhone(trimmed)) {
      setMembershipOptions([]);
      return;
    }
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
          setMembershipOptions(list);
          if (!membershipId && suggestData.suggestion?.effectiveRemainingMinutes > 0) {
            setMembershipId(suggestData.suggestion.id);
          }
        })
        .finally(() => setMembershipsLoading(false));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- phone drives lookup
  }, [open, phone, initial?.membershipId]);

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
        throw new Error(data.error ?? "Абонемент не найден");
      }
      const found: MembershipOption = {
        id: data.membership.id,
        externalCode: data.membership.externalCode,
        category: data.membership.category,
        ownerName: data.membership.ownerName,
        effectiveRemainingMinutes: data.membership.effectiveRemainingMinutes,
        pricePerMinute: data.membership.pricePerMinute ?? null,
      };
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time) {
      setError("Укажите дату и время");
      return;
    }
    setLoading(true);
    setError("");
    const isoStart = fromDatetimeLocalValue(`${date}T${time}`);
    const duration = commitDurationInput();
    const priceValue = Math.round((parseFloat(priceInput) || price) * 100) / 100;
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
          paymentMethod: paymentMethod || null,
        });
        onSaved();
        onClose();
        return;
      }

      const url = appointmentId
        ? `/api/admin/appointments/${appointmentId}`
        : "/api/admin/appointments";
      const method = appointmentId ? "PATCH" : "POST";
      const res = await adminFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          staffId,
          startAt: isoStart,
          durationMinutes: duration,
          firstName,
          lastName,
          phone,
          status,
          comment,
          membershipId: membershipId || null,
          paymentMethod: paymentMethod || null,
          price: priceValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
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
      if (!res.ok) throw new Error(data.error ?? "Ошибка удаления");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 font-sans sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-xl">
        <div className="relative pr-8">
          <h2 className="text-base font-bold text-slate-900">
            {appointmentId ? "Редактировать запись" : "Новая запись"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-md text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-3 space-y-2" autoComplete="off">
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
                  setServiceId(e.target.value);
                  setStaffId("");
                  setStaffName("");
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="wt-booking-date">
                Дата
              </label>
              <input
                id="wt-booking-date"
                name="wt-booking-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
                autoComplete="off"
                readOnly
                onFocus={unlockReadOnlyInput}
                required
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
                step={300}
                autoComplete="off"
                readOnly
                onFocus={unlockReadOnlyInput}
                required
              />
            </div>
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
                required
              />
            </div>
          </div>
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
              <p className="mt-0.5 text-[10px] text-slate-600">
                Остаток: {selectedMembership.effectiveRemainingMinutes} мин
                {selectedMembership.pricePerMinute != null &&
                  selectedMembership.pricePerMinute > 0 && (
                    <>
                      {" "}
                      · {selectedMembership.pricePerMinute} Br/мин
                    </>
                  )}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Оплата</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() =>
                    setPaymentMethod((prev) => (prev === o.value ? "" : o.value))
                  }
                  className={paymentMethodBtnClass(paymentMethod === o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
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
            className={inputClass}
            rows={1}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
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
      </div>
    </div>
    {copyOpen && copyPrefill && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-4">
        <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
          <button
            type="button"
            onClick={() => setCopyOpen(false)}
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-slate-500 hover:bg-slate-100"
            aria-label="Закрыть"
          >
            ×
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
          </div>
        </div>
      </div>
    )}
    </>
  );
}
