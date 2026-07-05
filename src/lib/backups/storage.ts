import { createHmac, randomUUID } from "crypto";
import {
  BACKUP_BUCKET,
  BACKUP_MANIFEST_PREFIX,
  BACKUP_RESTORE_PREFIX,
  SIGNED_URL_TTL_SEC,
  UPLOAD_BUCKET,
} from "./constants";
import type { UploadFileEntry } from "./fingerprint";
import { hashFilesFingerprint } from "./fingerprint";
import { getRetentionPolicy } from "./retention";
import { formatBackupLabel } from "./season";
import {
  downloadBackupObject,
  getBackupSupabase,
  removeBackupObjects,
  uploadBackupObject,
} from "./supabase";
import type {
  BackupListItem,
  BackupManifest,
  BackupStorageWarning,
  RestoreStatus,
} from "./types";

function manifestPath(id: string): string {
  return `${BACKUP_MANIFEST_PREFIX}/${id}.json`;
}

function restorePath(restoreId: string): string {
  return `${BACKUP_RESTORE_PREFIX}/${restoreId}.json`;
}

export async function readManifest(id: string): Promise<BackupManifest | null> {
  const client = getBackupSupabase();
  try {
    const buf = await downloadBackupObject(client, manifestPath(id));
    return JSON.parse(buf.toString("utf8")) as BackupManifest;
  } catch {
    return null;
  }
}

export async function writeManifest(manifest: BackupManifest): Promise<void> {
  const client = getBackupSupabase();
  const body = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  await uploadBackupObject(client, manifestPath(manifest.id), body, "application/json");
}

export async function listManifests(): Promise<BackupManifest[]> {
  const client = getBackupSupabase();
  const { data, error } = await client.storage.from(BACKUP_BUCKET).list(BACKUP_MANIFEST_PREFIX, {
    limit: 200,
    sortBy: { column: "name", order: "desc" },
  });
  if (error) {
    throw new Error(`BACKUP_LIST_FAILED:${error.message}`);
  }

  const manifests: BackupManifest[] = [];
  for (const item of data ?? []) {
    if (!item.name.endsWith(".json")) continue;
    const id = item.name.replace(/\.json$/, "");
    const manifest = await readManifest(id);
    if (manifest) manifests.push(manifest);
  }

  return manifests.sort((a, b) => b.id.localeCompare(a.id));
}

export async function getLatestManifest(): Promise<BackupManifest | null> {
  const all = await listManifests();
  return all[0] ?? null;
}

export function toListItem(manifest: BackupManifest): BackupListItem {
  const hasDb = Boolean(manifest.db?.path);
  const hasFiles = Boolean(manifest.files?.path);
  let label = formatBackupLabel(manifest.id);
  if (manifest.seasonArchive) label += " · Архив сезона";
  if (manifest.forced) label += " · Финальный";
  if (manifest.skipped) label += " · без изменений";
  return { ...manifest, hasDb, hasFiles, label };
}

export async function listBackupItems(): Promise<BackupListItem[]> {
  const manifests = await listManifests();
  return manifests
    .filter((m) => !m.skipped && (m.db || m.files))
    .map(toListItem);
}

export async function createSignedDownloadUrl(
  objectPath: string,
): Promise<string> {
  const client = getBackupSupabase();
  const { data, error } = await client.storage
    .from(BACKUP_BUCKET)
    .createSignedUrl(objectPath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(`BACKUP_SIGNED_URL_FAILED:${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

export async function listUploadFiles(): Promise<UploadFileEntry[]> {
  const client = getBackupSupabase();
  const entries: UploadFileEntry[] = [];

  async function walk(prefix: string): Promise<void> {
    const { data, error } = await client.storage.from(UPLOAD_BUCKET).list(prefix, {
      limit: 1000,
    });
    if (error) {
      throw new Error(`UPLOAD_LIST_FAILED:${error.message}`);
    }
    for (const item of data ?? []) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        await walk(path);
        continue;
      }
      entries.push({
        path,
        size: item.metadata?.size ?? 0,
        updatedAt: item.updated_at ?? item.created_at ?? "",
      });
    }
  }

  await walk("");
  return entries;
}

export async function computeFilesFingerprint(): Promise<string> {
  const entries = await listUploadFiles();
  return hashFilesFingerprint(entries);
}

export async function getStorageWarning(
  dbSizeBytes: number,
): Promise<BackupStorageWarning> {
  return getRetentionPolicy(dbSizeBytes);
}

export async function writeRestoreStatus(status: RestoreStatus): Promise<void> {
  const client = getBackupSupabase();
  const body = Buffer.from(JSON.stringify(status, null, 2), "utf8");
  await uploadBackupObject(client, restorePath(status.restoreId), body, "application/json");
}

export async function readRestoreStatus(
  restoreId: string,
): Promise<RestoreStatus | null> {
  const client = getBackupSupabase();
  try {
    const buf = await downloadBackupObject(client, restorePath(restoreId));
    return JSON.parse(buf.toString("utf8")) as RestoreStatus;
  } catch {
    return null;
  }
}

export async function findRunningRestore(): Promise<RestoreStatus | null> {
  const client = getBackupSupabase();
  const { data, error } = await client.storage.from(BACKUP_BUCKET).list(BACKUP_RESTORE_PREFIX, {
    limit: 50,
    sortBy: { column: "name", order: "desc" },
  });
  if (error) return null;

  for (const item of data ?? []) {
    if (!item.name.endsWith(".json")) continue;
    const restoreId = item.name.replace(/\.json$/, "");
    const status = await readRestoreStatus(restoreId);
    if (status?.status === "running") return status;
  }
  return null;
}

export function createRestoreId(): string {
  return randomUUID();
}

export function createRestoreConfirmToken(
  backupId: string,
  restoreDb: boolean,
  restoreFiles: boolean,
): string {
  const secret = process.env.BACKUP_RESTORE_SECRET;
  if (!secret) throw new Error("BACKUP_RESTORE_SECRET_NOT_SET");
  return createHmac("sha256", secret)
    .update(`${backupId}:${restoreDb}:${restoreFiles}`)
    .digest("hex");
}

export function verifyRestoreConfirmToken(
  backupId: string,
  restoreDb: boolean,
  restoreFiles: boolean,
  token: string,
): boolean {
  try {
    const expected = createRestoreConfirmToken(backupId, restoreDb, restoreFiles);
    return expected === token;
  } catch {
    return false;
  }
}

export async function collectManifestObjectPaths(
  manifest: BackupManifest,
): Promise<string[]> {
  const paths: string[] = [manifestPath(manifest.id)];
  if (manifest.db?.path) paths.push(manifest.db.path);
  if (manifest.files?.path) paths.push(manifest.files.path);
  return paths;
}

export async function trimManifests(options: {
  dbRetention: number;
  filesRetention: number;
  keepSeasonArchiveOnly?: boolean;
}): Promise<{ removed: string[] }> {
  const client = getBackupSupabase();
  const manifests = await listManifests();
  const removed: string[] = [];

  const withDb = manifests.filter((m) => m.db && !m.skipped);
  const withFiles = manifests.filter((m) => m.files && !m.skipped);

  const keepIds = new Set<string>();

  if (options.keepSeasonArchiveOnly) {
    const archive =
      manifests.find((m) => m.seasonArchive) ??
      manifests.find((m) => m.forced) ??
      manifests[0];
    if (archive) keepIds.add(archive.id);
  } else {
    for (const m of withDb.slice(0, options.dbRetention)) keepIds.add(m.id);
    for (const m of withFiles.slice(0, options.filesRetention)) keepIds.add(m.id);
    for (const m of manifests.filter((m) => m.seasonArchive)) keepIds.add(m.id);
  }

  for (const manifest of manifests) {
    if (keepIds.has(manifest.id)) continue;
    const paths = await collectManifestObjectPaths(manifest);
    await removeBackupObjects(client, paths);
    removed.push(manifest.id);
  }

  return { removed };
}

export function dbObjectPath(id: string): string {
  return `db/${id}.dump`;
}

export function filesObjectPath(id: string): string {
  return `files/${id}.zip`;
}
