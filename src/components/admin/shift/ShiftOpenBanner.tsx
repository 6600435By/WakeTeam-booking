"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSuperAdminBranchOptional } from "@/components/admin/SuperAdminBranchProvider";
import { formatBranchOpenLabel, type BranchShiftStatus } from "@/lib/payroll/branch-shift-status.shared";
import { formatTimeMinsk } from "@/lib/time";

const DISMISS_KEY = "shift-open-banner-dismiss";
const POLL_MS = 30_000;

type WorkShiftsTodayResponse = {
  today?: { shift?: { status?: string; panelOnly?: boolean } } | null;
  branchToday?: BranchShiftStatus | null;
};

export function ShiftOpenBanner() {
  const superBranch = useSuperAdminBranchOptional();
  const [ownShiftOpen, setOwnShiftOpen] = useState(false);
  const [ownPanelOnly, setOwnPanelOnly] = useState(false);
  const [branchToday, setBranchToday] = useState<BranchShiftStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    try {
      const q = new URLSearchParams();
      if (superBranch?.branchId) q.set("branchId", superBranch.branchId);
      const suffix = q.size ? `?${q}` : "";
      const r = await fetch(`/api/admin/work-shifts${suffix}`);
      const d = (await r.json()) as WorkShiftsTodayResponse;
      if (!r.ok) return;
      const st = d.today?.shift?.status;
      const panelOnly = Boolean(d.today?.shift?.panelOnly);
      // Full open shift hides the banner; panelOnly still prompts to start properly.
      setOwnShiftOpen(st === "open" && !panelOnly);
      setOwnPanelOnly(st === "open" && panelOnly);
      setBranchToday(d.branchToday ?? null);
    } catch {
      /* ignore */
    }
  }, [superBranch?.branchId]);

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
  if (dismissed && !ownPanelOnly) return null;

  const opener = branchToday?.isOpen ? formatBranchOpenLabel(branchToday) : "";
  const startedAt = branchToday?.openShifts?.[0]?.actualStart;
  const timeLabel = startedAt ? formatTimeMinsk(startedAt) : null;

  return (
    <div
      className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
        ownPanelOnly || branchToday?.isOpen
          ? "border-green-200 bg-green-50 text-green-950"
          : "border-lime-200 bg-lime-50 text-lime-950"
      }`}
      data-onboarding="shift-open-banner"
    >
      <span>
        {ownPanelOnly
          ? "Вы в смене только по пульту — откройте полную смену"
          : branchToday?.isOpen
            ? `Филиал работает${opener ? ` · ${opener}` : ""}${timeLabel ? ` с ${timeLabel}` : ""} · ваша смена ещё не открыта`
            : "Смена сегодня не открыта"}
      </span>
      <div className="flex gap-2">
        <Link
          href="/admin/shift?check=1"
          className={`rounded-md px-2.5 py-1 text-xs font-medium text-white touch-manipulation ${
            ownPanelOnly || branchToday?.isOpen ? "bg-green-800" : "bg-lime-700"
          }`}
        >
          Открыть смену
        </Link>
        {!ownPanelOnly && (
          <button
            type="button"
            className="rounded-md px-2.5 py-1 text-xs hover:bg-black/5"
            onClick={() => {
              sessionStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
            }}
          >
            Позже
          </button>
        )}
      </div>
    </div>
  );
}
