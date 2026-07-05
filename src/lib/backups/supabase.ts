import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BACKUP_BUCKET } from "./constants";

export function getBackupSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isBackupStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function backupObjectPath(...parts: string[]): string {
  return parts.join("/");
}

export async function downloadBackupObject(
  client: SupabaseClient,
  objectPath: string,
): Promise<Buffer> {
  const { data, error } = await client.storage.from(BACKUP_BUCKET).download(objectPath);
  if (error || !data) {
    throw new Error(`BACKUP_DOWNLOAD_FAILED:${objectPath}:${error?.message ?? "unknown"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadBackupObject(
  client: SupabaseClient,
  objectPath: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage.from(BACKUP_BUCKET).upload(objectPath, body, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`BACKUP_UPLOAD_FAILED:${objectPath}:${error.message}`);
  }
}

export async function removeBackupObjects(
  client: SupabaseClient,
  objectPaths: string[],
): Promise<void> {
  if (objectPaths.length === 0) return;
  const { error } = await client.storage.from(BACKUP_BUCKET).remove(objectPaths);
  if (error) {
    throw new Error(`BACKUP_REMOVE_FAILED:${error.message}`);
  }
}
