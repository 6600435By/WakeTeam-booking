"use client";

import { useState } from "react";
import { formatAdminPhone } from "@/lib/widget-settings";
import { WidgetHelpFooter } from "@/components/widget/widget-primitives";

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
    <WidgetHelpFooter
      label={label}
      phone={tel}
      displayPhone={display}
      compact={compact}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    />
  );
}
