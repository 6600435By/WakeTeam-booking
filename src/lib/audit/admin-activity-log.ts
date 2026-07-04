import type { AdminContext } from "@/lib/admin-access";
import { prisma } from "@/lib/db";
import { staffDisplayName } from "@/lib/staff-user";

export const RETENTION_DAYS = 90;
const SUMMARY_MAX = 280;
const CLEANUP_BATCH = 500;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CLEANUP_SAMPLE_RATE = 0.01;

let lastCleanupAt = 0;

export type AdminActivityLogInput = {
  organizationId: string;
  action: string;
  actorMemberId?: string | null;
  actorName: string;
  branchId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
};

export function truncateSummary(text: string): string {
  const t = text.trim();
  if (t.length <= SUMMARY_MAX) return t;
  return `${t.slice(0, SUMMARY_MAX - 1)}…`;
}

export function actorFromContext(ctx: AdminContext): {
  actorMemberId: string;
  actorName: string;
} {
  return {
    actorMemberId: ctx.memberId,
    actorName: staffDisplayName(ctx.user).slice(0, 80),
  };
}

async function maybeCleanupOldLogs(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS && Math.random() >= CLEANUP_SAMPLE_RATE) {
    return;
  }
  lastCleanupAt = now;
  const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const stale = await prisma.adminActivityLog.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take: CLEANUP_BATCH,
  });
  if (stale.length === 0) return;
  await prisma.adminActivityLog.deleteMany({
    where: { id: { in: stale.map((r) => r.id) } },
  });
}

export async function writeAdminActivityLog(input: AdminActivityLogInput): Promise<void> {
  await prisma.adminActivityLog.create({
    data: {
      organizationId: input.organizationId,
      action: input.action,
      actorMemberId: input.actorMemberId ?? null,
      actorName: input.actorName.slice(0, 80),
      branchId: input.branchId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      summary: truncateSummary(input.summary),
    },
  });
  await maybeCleanupOldLogs();
}

export function fireAdminActivityLog(input: AdminActivityLogInput): void {
  void writeAdminActivityLog(input).catch(() => undefined);
}

export function fireAdminActivityFromContext(
  ctx: AdminContext,
  params: Omit<AdminActivityLogInput, "organizationId" | "actorMemberId" | "actorName">,
): void {
  const actor = actorFromContext(ctx);
  fireAdminActivityLog({
    organizationId: ctx.organizationId,
    actorMemberId: actor.actorMemberId,
    actorName: actor.actorName,
    ...params,
  });
}
