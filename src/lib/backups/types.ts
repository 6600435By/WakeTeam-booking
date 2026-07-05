export type BackupPartInfo = {
  path: string;
  sizeBytes: number;
  fingerprint: string;
};

export type BackupManifest = {
  id: string;
  createdAt: string;
  db?: BackupPartInfo;
  files?: BackupPartInfo;
  dbFingerprint?: string;
  filesFingerprint?: string;
  skipped?: boolean;
  forced?: boolean;
  seasonArchive?: boolean;
  dbSizeBytes?: number;
  retentionWarning?: "storage_medium" | "storage_high" | null;
};

export type RestoreStepStatus = "pending" | "running" | "done" | "failed";

export type RestoreStep = {
  name: string;
  label: string;
  status: RestoreStepStatus;
};

export type RestoreStatus = {
  restoreId: string;
  backupId: string;
  status: "running" | "success" | "failed";
  restoreDb: boolean;
  restoreFiles: boolean;
  startedAt: string;
  finishedAt?: string;
  requestedBy?: string;
  error?: string;
  githubRunUrl?: string;
  steps: RestoreStep[];
};

export type BackupListItem = BackupManifest & {
  hasDb: boolean;
  hasFiles: boolean;
  label: string;
  /** DD.MM.YYYY for restore confirmation */
  confirmDate: string;
  /** Manifest id when db part lives in a different manifest (merged row) */
  dbManifestId?: string;
  /** Manifest id when files part lives in a different manifest (merged row) */
  filesManifestId?: string;
};

export type BackupStorageWarning = {
  level: "storage_medium" | "storage_high" | null;
  message: string | null;
  dbRetentionCount: number;
  filesRetentionCount: number;
  dbSizeBytes: number;
};
