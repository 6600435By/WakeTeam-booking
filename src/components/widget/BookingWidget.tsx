"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Branch = {
  id: string;
  name: string;
  address?: string | null;
  description?: string | null;
};

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  allowedDurations: string;
  price: number;
  staff: { id: string; name: string; kind: string }[];
};

type Slot = {
  startAt: string;
  endAt: string;
  staffId: string;
  staffName: string;
  status: "free" | "busy";
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

const STEPS = ["Филиал", "Услуга", "Реверс", "Время", "Контакты"];

export function BookingWidget({ slug = "waketeam" }: { slug?: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(10);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookableStarts, setBookableStarts] = useState<Slot[]>([]);
  const [allowedDurations, setAllowedDurations] = useState<number[]>([10, 30, 60]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ publicNumber: number } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");

  const embedRef = useEmbedHeight(true);

  const branch = useMemo(
    () => branches.find((b) => b.id === branchId),
    [branches, branchId],
  );

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId],
  );

  const staffOptions = service?.staff ?? [];

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/widget-config/${slug}`)
      .then((r) => r.json())
      .then((d) => setBranches(d.branches ?? []))
      .catch(() => setError("Не удалось загрузить конфигурацию"))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!branchId) return;
    setLoading(true);
    fetch(`/api/public/services?branchId=${branchId}`)
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    setLoading(true);
    const q = new URLSearchParams({
      serviceId,
      staffId,
      date,
    });
    fetch(`/api/public/slots?${q}`)
      .then((r) => r.json())
      .then((d) => {
        const all = (d.slots ?? []) as Slot[];
        const step = 10;
        const needed = durationMinutes / step;
        const bookable = all.filter((sl, i) => {
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
        setSlots(all);
        setBookableStarts(bookable);
        setAllowedDurations(
          (d.allowedDurations as number[]) ??
            service?.allowedDurations.split(",").map(Number) ??
            [10, 30, 60],
        );
        setSelectedSlot(null);
      })
      .finally(() => setLoading(false));
  }, [serviceId, staffId, date, durationMinutes, service?.allowedDurations]);

  useEffect(() => {
    if (service) {
      const durations = service.allowedDurations
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      if (durations.length && !durations.includes(durationMinutes)) {
        setDurationMinutes(durations[0]);
      }
    }
  }, [service, durationMinutes]);

  const submit = useCallback(async () => {
    if (!selectedSlot || !serviceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          serviceId,
          staffId: selectedSlot.staffId,
          startAt: selectedSlot.startAt,
          durationMinutes,
          firstName,
          lastName: lastName || undefined,
          phone,
          email: email || undefined,
          comment: comment || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка записи");
      setDone({ publicNumber: data.publicNumber });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [selectedSlot, serviceId, durationMinutes, firstName, lastName, phone, email, comment, slug]);

  if (done) {
    return (
      <div
        ref={embedRef}
        className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-6"
      >
        <h2 className="text-lg font-semibold text-lime-700">Запись создана</h2>
        <p className="mt-2 text-slate-600">
          Номер записи: <strong>#{done.publicNumber}</strong>
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Ждём вас на вейк-парке WakeTeam!
        </p>
      </div>
    );
  }

  return (
    <div
      ref={embedRef}
      className="rounded-xl bg-[#f4f2f2] p-4 sm:p-6"
      id="waketeam-booking-root"
    >
      <h1 className="text-lg font-bold text-slate-900 sm:text-xl">WAKETEAM.BY</h1>
      <p className="mt-1 text-sm text-slate-600">Катание на вейкборде и сапборде</p>

      <div className="mt-4 flex items-center gap-1 sm:hidden">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i === step
                  ? "bg-[#fcff00] text-slate-900"
                  : i < step
                    ? "bg-[#c0c100] text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {i + 1}
            </span>
            <span className="text-[10px] leading-tight text-slate-600">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 hidden flex-wrap gap-1 text-xs font-medium sm:flex">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`rounded px-2.5 py-1.5 ${
              i === step
                ? "bg-[#fcff00] text-slate-900"
                : i < step
                  ? "bg-[#c0c100] text-white"
                  : "bg-slate-200 text-slate-600"
            }`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {step === 0 && (
        <div className="mt-4 space-y-2">
          {loading && <p className="text-sm text-slate-500">Загрузка…</p>}
          {branches.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setBranchId(b.id);
                setServiceId("");
                setStaffId("");
                setStep(1);
              }}
              className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left hover:border-[#c0c100] hover:bg-lime-50 active:bg-lime-50"
            >
              <span className="font-semibold text-slate-800">{b.name}</span>
              {b.description && (
                <span className="mt-1 block text-sm text-slate-500">{b.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="mt-4 space-y-2">
          <BackButton onClick={() => setStep(0)} />
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setServiceId(s.id);
                setStaffId("");
                setStep(2);
              }}
              className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left hover:border-[#c0c100] active:bg-lime-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-slate-800">{s.name}</span>
              <span className="text-sm text-slate-600 sm:shrink-0">от {s.price} Br</span>
            </button>
          ))}
        </div>
      )}

      {step === 2 && service && (
        <div className="mt-4 space-y-2">
          <BackButton onClick={() => setStep(1)} />
          <p className="text-sm text-slate-600">{branch?.name}</p>
          {staffOptions.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                setStaffId(st.id);
                setStep(3);
              }}
              className="block w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left hover:border-[#c0c100] active:bg-lime-50"
            >
              {st.name}
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="mt-4">
          <BackButton onClick={() => setStep(2)} />
          <label className="mt-3 block text-sm font-medium text-slate-700">Длительность</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {allowedDurations.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurationMinutes(d)}
                className={`min-h-[44px] rounded-lg px-4 py-2.5 text-sm ${
                  durationMinutes === d
                    ? "bg-[#fcff00] font-semibold text-slate-900"
                    : "bg-white border border-slate-200"
                }`}
              >
                {d} мин
              </button>
            ))}
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">Дата</label>
          <input
            type="date"
            value={date}
            min={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
          />
          {loading && <p className="mt-2 text-sm text-slate-500">Загрузка слотов…</p>}
          <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            {slots.map((sl) => {
              const time = new Date(sl.startAt).toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Europe/Minsk",
              });
              const canBook = bookableStarts.some((b) => b.startAt === sl.startAt);
              return canBook ? (
                <button
                  key={sl.startAt}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(sl);
                    setStep(4);
                  }}
                  className="min-h-[44px] rounded-md bg-[#fcff00] px-2 py-2.5 text-sm font-medium text-slate-900 hover:bg-[#cacc00] active:bg-[#cacc00] sm:min-w-[4rem] sm:px-3"
                >
                  {time}
                </button>
              ) : (
                <span
                  key={sl.startAt}
                  className="hidden min-h-[44px] rounded-md bg-slate-200 px-2 py-2.5 text-center text-sm text-slate-400 sm:inline-block sm:min-w-[4rem] sm:px-3"
                >
                  {time}
                </span>
              );
            })}
          </div>
          {!loading && slots.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">Нет слотов на эту дату</p>
          )}
        </div>
      )}

      {step === 4 && selectedSlot && service && (
        <div className="mt-4 space-y-3">
          <BackButton onClick={() => setStep(3)} />
          <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-600">
            <span className="block sm:inline">{branch?.name}</span>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline">{service.name}</span>
            <span className="hidden sm:inline"> · </span>
            <span className="block sm:inline">{durationMinutes} мин</span>
            <span className="hidden sm:inline"> · </span>
            <span className="block font-medium sm:inline">
              {new Date(selectedSlot.startAt).toLocaleString("ru-RU", {
                timeZone: "Europe/Minsk",
              })}
            </span>
          </p>
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
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
          />
          <input
            placeholder="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            disabled={loading || !firstName || !phone}
            onClick={submit}
            className="w-full rounded-lg bg-[#c0c100] py-3.5 text-base font-semibold text-white hover:bg-[#8d8e00] active:bg-[#8d8e00] disabled:opacity-50"
          >
            {loading ? "Сохранение…" : "Записаться"}
          </button>
        </div>
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="-ml-1 rounded-lg px-2 py-2 text-sm text-slate-700 underline active:bg-slate-100"
      onClick={onClick}
    >
      ← Назад
    </button>
  );
}
