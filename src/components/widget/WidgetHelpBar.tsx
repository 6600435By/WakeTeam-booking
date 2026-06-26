"use client";

import { useState } from "react";
import { formatAdminPhone } from "@/lib/widget-settings";

type Props = {
  label: string;
  phone: string;
  compact?: boolean;
};

export function WidgetHelpBar({ label, phone, compact }: Props) {
  const [open, setOpen] = useState(false);
  const tel = phone.replace(/\s/g, "");
  const display = formatAdminPhone(phone);

  return (
    <div
      className={`border-t border-slate-200/80 text-center ${
        compact ? "mt-2 pt-2" : "mt-6 pt-4"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`font-medium underline decoration-dotted underline-offset-2 ${
          compact ? "text-xs" : "text-sm"
        }`}
        style={{ color: "var(--widget-primary, #c0c100)" }}
      >
        {label}
      </button>
      {open && (
        <p className="mt-2">
          <a
            href={`tel:${tel}`}
            className="text-base font-semibold text-slate-800 hover:underline"
          >
            {display}
          </a>
        </p>
      )}
    </div>
  );
}
