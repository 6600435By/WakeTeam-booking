import { prisma } from "@/lib/db";
import { syncMembershipsFromSheet } from "./sync";

export function membershipsSyncIntervalMinutes(): number {
  const raw = process.env.MEMBERSHIPS_SYNC_INTERVAL_MIN?.trim();
  const n = raw ? parseInt(raw, 10) : 15;
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export async function getLastMembershipSyncAt(
  organizationId: string,
): Promise<Date | null> {
  const row = await prisma.membership.findFirst({
    where: { organizationId },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  return row?.syncedAt ?? null;
}

export function isMembershipSyncStale(lastSyncedAt: Date | null): boolean {
  if (!lastSyncedAt) return true;
  const ageMs = Date.now() - lastSyncedAt.getTime();
  return ageMs > membershipsSyncIntervalMinutes() * 60 * 1000;
}

export async function syncMembershipsIfStale(organizationId: string) {
  const lastSyncedAt = await getLastMembershipSyncAt(organizationId);
  if (!isMembershipSyncStale(lastSyncedAt)) {
    return { syncSkipped: true as const, lastSyncedAt };
  }
  const result = await syncMembershipsFromSheet(organizationId);
  const fresh = await getLastMembershipSyncAt(organizationId);
  return { syncSkipped: false as const, lastSyncedAt: fresh, ...result };
}
