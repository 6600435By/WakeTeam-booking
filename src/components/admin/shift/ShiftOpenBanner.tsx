"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatBranchOpenLabel, type BranchShiftStatus } from "@/lib/payroll/branch-shift-status.shared";
import { formatTimeMinsk } from "@/lib/time";

const DISMISS_KEY = "shift-open-banner-dismiss";
const POLL_MS = 30_000;

type WorkShiftsTodayResponse = {
  today?: { shift?: { status?: string } } | null;
  branchToday?: BranchShiftStatus | null;
};

export function ShiftOpenBanner() {
  const [ownShiftOpen, setOwnShiftOpen] = useState(false);
  const [branchToday, setBranchToday] = useState<BranchShiftStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    try {
      const r = await fetch("/api/admin/work-shifts");
      const d = (await r.json()) as WorkShiftsTodayResponse;
      if (!r.ok) return;
      const st = d.today?.shift?.status;
      setOwnShiftOpen(st === "open");
      setBranchToday(d.branchToday ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void check();
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, [check]);

  if (ownShiftOpen) return null;

  if (branchToday?.isOpen) {
    const opener = formatBranchOpenLabel(branchToday);
    const startedAt = branchToday.openShifts[0]?.actualStart;
    const timeLabel = startedAt ? formatTimeMinsk(startedAt) : null;
    return (
      <div
        className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-950"
        data-onboarding="shift-branch-open-banner"
      >
        <span>
          Филиал работает
          {opener ? ` · ${opener}` : ""}
          {timeLabel ? ` с ${timeLabel}` : ""}
        </span>
        <Link
          href="/admin/shift"
          className="rounded-md bg-green-800 px-2.5 py-1 text-xs font-medium text-white touch-manipulation"
        >
          Моя смена
        </Link>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lime-200 bg-lime-50 px-3 py-2 text-sm text-lime-950" data-onboarding="shift-open-banner">
      <span>Смена сегодня не открыта</span>
      <div className="flex gap-2">
        <Link
          href="/admin/shift?check=1"
          className="rounded-md bg-lime-700 px-2.5 py-1 text-xs font-medium text-white touch-manipulation"
        >
          Открыть смену
        </Link>
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs text-lime-800 hover:bg-lime-100"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
