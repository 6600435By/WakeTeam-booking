import type { ServicePriceRuleDto } from "@/lib/service-pricing";

export type AppointmentModalService = {
  id: string;
  name: string;
  kind: string;
  durationMinutes: number;
  allowedDurations: string;
  price: number;
  priceRules: ServicePriceRuleDto[];
  staff: { id: string; name: string }[];
};

const appointmentServicesCache = new Map<string, AppointmentModalService[]>();

export function getCachedAppointmentServices(branchId: string) {
  return appointmentServicesCache.get(branchId);
}

export function setCachedAppointmentServices(
  branchId: string,
  services: AppointmentModalService[],
) {
  appointmentServicesCache.set(branchId, services);
}

/** Call after branch service/tariff edits so the journal modal does not reuse stale prices. */
export function invalidateAppointmentServicesCache(branchId?: string) {
  if (branchId) {
    appointmentServicesCache.delete(branchId);
    return;
  }
  appointmentServicesCache.clear();
}
