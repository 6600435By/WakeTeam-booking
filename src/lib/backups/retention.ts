import {
  RETENTION_DB_BYTES_HIGH,
  RETENTION_DB_BYTES_LOW,
  envInt,
} from "./constants";
import type { BackupStorageWarning } from "./types";

export function getRetentionPolicy(dbSizeBytes: number): BackupStorageWarning {
  const seasonDbDefault = envInt("BACKUP_SEASON_DB_RETENTION_COUNT", 5);
  const seasonFilesDefault = envInt("BACKUP_SEASON_FILES_RETENTION_COUNT", 2);

  if (dbSizeBytes < RETENTION_DB_BYTES_LOW) {
    return {
      level: null,
      message: null,
      dbRetentionCount: seasonDbDefault,
      filesRetentionCount: seasonFilesDefault,
      dbSizeBytes,
    };
  }

  if (dbSizeBytes < RETENTION_DB_BYTES_HIGH) {
    return {
      level: "storage_medium",
      message:
        "База данных выросла: храним 3 последних бэкапа вместо 5. Рекомендуем следить за объёмом Supabase.",
      dbRetentionCount: Math.min(3, seasonDbDefault),
      filesRetentionCount: 1,
      dbSizeBytes,
    };
  }

  return {
    level: "storage_high",
    message:
      "База данных большая: храним 2 последних бэкапа. Рассмотрите апгрейд Supabase Storage.",
    dbRetentionCount: 2,
    filesRetentionCount: 1,
    dbSizeBytes,
  };
}
