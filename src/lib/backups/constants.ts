export const BACKUP_BUCKET = "backups";
export const UPLOAD_BUCKET = "uploads";

export const BACKUP_DB_PREFIX = "db";
export const BACKUP_FILES_PREFIX = "files";
export const BACKUP_MANIFEST_PREFIX = "manifests";
export const BACKUP_RESTORE_PREFIX = "restores";

export const SIGNED_URL_TTL_SEC = 15 * 60;

export const DEFAULT_SEASON_START_MONTH = 5;
export const DEFAULT_SEASON_END_MONTH = 10;

export const RETENTION_DB_BYTES_LOW = 100 * 1024 * 1024;
export const RETENTION_DB_BYTES_HIGH = 200 * 1024 * 1024;

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function seasonStartMonth(): number {
  return envInt("BACKUP_SEASON_START_MONTH", DEFAULT_SEASON_START_MONTH);
}

export function seasonEndMonth(): number {
  return envInt("BACKUP_SEASON_END_MONTH", DEFAULT_SEASON_END_MONTH);
}

export function offseasonRetentionCount(): number {
  return envInt("BACKUP_OFFSEASON_RETENTION_COUNT", 1);
}
