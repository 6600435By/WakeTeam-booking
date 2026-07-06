"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "shift-open-banner-dismiss";

export function ShiftOpenBanner() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    try {
      const r = await fetch("/api/admin/work-shifts");
      const d = await r.json();
      if (!r.ok) return;
      const st = d.today?.shift?.status as string | undefined;
      setVisible(!d.today || st === "scheduled");
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
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [check]);

  if (!visible || dismissed) return null;

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
