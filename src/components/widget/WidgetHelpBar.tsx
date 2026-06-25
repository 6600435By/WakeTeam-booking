"use client";

import { useState } from "react";
import { formatAdminPhone } from "@/lib/widget-settings";

type Props = {
  label: string;
  phone: string;
};

export function WidgetHelpBar({ label, phone }: Props) {
  const [open, setOpen] = useState(false);
  const tel = phone.replace(/\s/g, "");
  const display = formatAdminPhone(phone);

  return (
    <div className="mt-6 border-t border-slate-200/80 pt-4 text-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium underline decoration-dotted underline-offset-2"
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
