"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "./StatusBadge";
import { cancelReasonLabel, JOURNAL_HIDDEN_STATUSES } from "@/lib/appointment-status";
import { isSearchablePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type ClientLookupAppointment = {
  id: string;
  publicNumber: number;
  startAt: string;
  endAt: string;
  status: string;
  price: number;
  durationMinutes: number;
  comment: string | null;
  membershipId?: string | null;
  cancelReason?: string | null;
  branchId: string;
  client: { firstName: string | null; lastName: string | null; phone: string };
  service: { id: string; name: string };
  staff: { id: string; name: string };
};

type ClientInfo = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  email: string | null;
};

type LookupResult = {
  client: ClientInfo | null;
  clients: ClientInfo[];
  multiple?: boolean;
  upcoming: ClientLookupAppointment[];
  history: ClientLookupAppointment[];
};

type Props = {
  branchId?: string;
  onOpenAppointment: (appt: ClientLookupAppointment) => void;
  compact?: boolean;
};

function clientName(client: ClientInfo | ClientLookupAppointment["client"]) {
  return (
    [client.firstName, client.lastName].filter(Boolean).join(" ") || client.phone
  );
}

function formatApptDate(startAt: string) {
  return new Date(startAt).toLocaleString("ru-RU", {
    timeZone: "Europe/Minsk",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ClientPhoneSearch({ branchId, onOpenAppointment, compact = false }: Props) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [open, setOpen] = useState(false);
  const [pickedClientId, setPickedClientId] = useState<string | null>(null);

  const runSearch = useCallback(
    async (raw: string, clientId?: string) => {
      const trimmed = raw.trim();
      if (!isSearchablePhone(trimmed)) {
        setResult(null);
        return;
      }
      setLoading(true);
      try {
        const q = new URLSearchParams({ phone: trimmed });
        if (branchId) q.set("branchId", branchId);
        if (clientId) q.set("clientId", clientId);
        const res = await fetch(`/api/admin/clients/lookup?${q}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ошибка поиска");
        setResult({
          client: data.client ?? null,
          clients: data.clients ?? [],
          multiple: data.multiple,
          upcoming: data.upcoming ?? [],
          history: data.history ?? [],
        });
        setOpen(true);
      } catch {
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    const trimmed = phone.trim();
    if (!isSearchablePhone(trimmed)) {
      setResult(null);
      setOpen(false);
      setPickedClientId(null);
      return;
    }
    const t = setTimeout(() => {
      void runSearch(trimmed, pickedClientId ?? undefined);
    }, 450);
    return () => clearTimeout(t);
  }, [phone, pickedClientId, runSearch]);

  function pickClient(client: ClientInfo) {
    setPickedClientId(client.id);
    setPhone(client.phone);
    void runSearch(client.phone, client.id);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPickedClientId(null);
    void runSearch(phone);
  }

  const hasClient = result?.client != null;
  const clientOptions = result?.clients ?? [];
  const showClientPicker = !hasClient && clientOptions.length > 0;
  const hasResults =
    hasClient &&
    (result!.upcoming.length > 0 || result!.history.length > 0);

  const controlClass = compact
    ? "h-8 rounded-md border border-slate-300 px-2 text-xs"
    : "min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm";

  const inputId = compact ? "client-phone-search-compact" : "client-phone-search";

  return (
    <div className={cn("relative", compact ? "w-[200px] shrink-0" : "w-full sm:w-auto sm:min-w-[220px]")}>
      <form onSubmit={handleSubmit} className="flex gap-1.5">
        <Label htmlFor={inputId} className="sr-only">
          Поиск клиента по телефону
        </Label>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="Поиск по телефону"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setPickedClientId(null);
          }}
          onFocus={() => {
            if (result?.client) setOpen(true);
          }}
          className={cn(
            controlClass,
            "w-full bg-white",
            compact ? "sm:min-w-0" : "sm:min-w-[200px]",
          )}
        />
        <button
          type="submit"
          disabled={loading || !isSearchablePhone(phone)}
          className={cn(
            controlClass,
            "shrink-0 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50",
            compact ? "px-2.5" : "",
          )}
        >
          {loading ? "…" : "Найти"}
        </button>
      </form>

      <Dialog open={open && isSearchablePhone(phone) && !!result} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] w-[min(100vw-2rem,28rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Результаты поиска</DialogTitle>
          </DialogHeader>
          {showClientPicker ? (
            <>
              <p className="text-sm text-slate-600">Найдено несколько клиентов:</p>
              <ul className="mt-2 space-y-1">
                {clientOptions.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pickClient(c)}
                      className="flex w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">{c.phone}</span>
                      <span className="ml-2 text-slate-600">{clientName(c)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : !hasClient ? (
            <p className="text-sm text-slate-500">
              Клиент с таким номером не найден
            </p>
          ) : (
            <>
              <div className="border-b border-slate-100 pb-3">
                <p className="font-semibold text-slate-900">
                  {clientName(result!.client!)}
                </p>
                <p className="text-sm text-slate-600">{result!.client!.phone}</p>
                {result!.client!.email && (
                  <p className="text-sm text-slate-500">{result!.client!.email}</p>
                )}
              </div>

              {result!.upcoming.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Актуальные записи
                  </p>
                  <ul className="mt-2 space-y-1">
                    {result!.upcoming.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenAppointment(a);
                            setOpen(false);
                          }}
                          className="flex w-full items-start justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span>
                            <span className="font-medium text-slate-800">
                              {formatApptDate(a.startAt)}
                            </span>
                            <span className="mt-0.5 block text-slate-600">
                              {a.service.name} · {a.staff.name}
                            </span>
                          </span>
                          <StatusBadge status={a.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result!.history.length > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    История
                  </p>
                  <ul className="mt-2 space-y-1">
                    {result!.history.map((a) => {
                      const hidden = (
                        JOURNAL_HIDDEN_STATUSES as readonly string[]
                      ).includes(a.status);
                      return (
                        <li key={a.id}>
                          {hidden ? (
                            <div className="rounded-lg px-2 py-2 text-sm text-slate-500">
                              <span className="font-medium">
                                {formatApptDate(a.startAt)}
                              </span>
                              <span className="mt-0.5 block">
                                {a.service.name} ·{" "}
                                {cancelReasonLabel(a.cancelReason) ||
                                  a.status}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenAppointment(a);
                                setOpen(false);
                              }}
                              className="flex w-full items-start justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <span>
                                <span className="font-medium text-slate-800">
                                  {formatApptDate(a.startAt)}
                                </span>
                                <span className="mt-0.5 block text-slate-600">
                                  {a.service.name} · {a.staff.name}
                                </span>
                              </span>
                              <StatusBadge status={a.status} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {!hasResults && (
                <p className="mt-3 text-sm text-slate-400">Записей пока нет</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
