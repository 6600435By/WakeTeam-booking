import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type DbFingerprint = {
  clients: number;
  appointments: number;
  memberships: number;
  users: number;
  workShifts: number;
  activityLogs: number;
  maxMembership: string | null;
  maxAppointment: string | null;
  maxActivity: string | null;
  dbSize: number;
};

const FINGERPRINT_SQL = Prisma.sql`
  SELECT json_build_object(
    'clients', (SELECT COUNT(*)::bigint FROM "Client"),
    'appointments', (SELECT COUNT(*)::bigint FROM "Appointment"),
    'memberships', (SELECT COUNT(*)::bigint FROM "Membership"),
    'users', (SELECT COUNT(*)::bigint FROM "User"),
    'workShifts', (SELECT COUNT(*)::bigint FROM "WorkShift"),
    'activityLogs', (SELECT COUNT(*)::bigint FROM "AdminActivityLog"),
    'maxMembership', (SELECT MAX("updatedAt") FROM "Membership"),
    'maxAppointment', (SELECT MAX("updatedAt") FROM "Appointment"),
    'maxActivity', (SELECT MAX("createdAt") FROM "AdminActivityLog"),
    'dbSize', (SELECT pg_database_size(current_database()))
  ) AS fingerprint
`;

function normalizeFingerprint(raw: Record<string, unknown>): DbFingerprint {
  return {
    clients: Number(raw.clients ?? 0),
    appointments: Number(raw.appointments ?? 0),
    memberships: Number(raw.memberships ?? 0),
    users: Number(raw.users ?? 0),
    workShifts: Number(raw.workShifts ?? 0),
    activityLogs: Number(raw.activityLogs ?? 0),
    maxMembership: raw.maxMembership ? String(raw.maxMembership) : null,
    maxAppointment: raw.maxAppointment ? String(raw.maxAppointment) : null,
    maxActivity: raw.maxActivity ? String(raw.maxActivity) : null,
    dbSize: Number(raw.dbSize ?? 0),
  };
}

export async function queryDbFingerprint(): Promise<DbFingerprint> {
  const rows = await prisma.$queryRaw<Array<{ fingerprint: Record<string, unknown> }>>(
    FINGERPRINT_SQL,
  );
  const row = rows[0]?.fingerprint;
  if (!row) {
    throw new Error("DB_FINGERPRINT_FAILED");
  }
  return normalizeFingerprint(row);
}

export function hashDbFingerprint(fp: DbFingerprint): string {
  return createHash("sha256").update(JSON.stringify(fp)).digest("hex");
}

export type UploadFileEntry = {
  path: string;
  size: number;
  updatedAt: string;
};

export function hashFilesFingerprint(entries: UploadFileEntry[]): string {
  const normalized = [...entries]
    .map((e) => `${e.path}|${e.size}|${e.updatedAt}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex");
}
