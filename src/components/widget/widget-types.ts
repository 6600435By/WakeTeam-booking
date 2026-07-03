import type { WidgetSettings } from "@/lib/widget-settings";

export type WidgetBranch = {
  id: string;
  name: string;
  address?: string | null;
  description?: string | null;
  photoUrl?: string | null;
};

export type WidgetPriceRule = {
  weekdays: string;
  timeFrom: string;
  timeTo: string;
  price: number;
  pricesByDuration?: Record<number, number>;
};

export type WidgetService = {
  id: string;
  name: string;
  kind: string;
  resourceLabel?: string;
  durationMinutes: number;
  allowedDurations: string;
  price: number;
  priceFrom: number;
  priceRules: WidgetPriceRule[];
  bookableFrom?: string | null;
  bookableTo?: string | null;
  maxBoards?: number;
  staff: {
    id: string;
    name: string;
    kind: string;
    description?: string | null;
    photoUrl?: string | null;
  }[];
};

export type WakeSlot = {
  startAt: string;
  endAt: string;
  staffId: string;
  staffName: string;
  status: "free" | "busy";
};

export type SupSlot = {
  startAt: string;
  endAt: string;
  status: "free" | "busy";
  availableBoards: number;
};

export type ActivityKind = "wake" | "sup" | "custom";

export function isStaffPickActivity(kind: ActivityKind | null | undefined): boolean {
  return kind === "wake" || kind === "custom";
}

export type WidgetPrefill = {
  branchId: string;
  serviceId: string;
  staffId: string;
  activityKind: ActivityKind;
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  comment?: string;
};

export type WidgetConfig = {
  branches: WidgetBranch[];
  servicesByBranch: Record<string, WidgetService[]>;
  settings: WidgetSettings;
  organization: { currency: string };
};
