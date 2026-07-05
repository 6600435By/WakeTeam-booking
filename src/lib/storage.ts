import { mkdir, writeFile } from "fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import path from "path";

const UPLOAD_BUCKET = "uploads";
const LOCAL_UPLOAD_DIR = "uploads";

export type UploadKind = "branch" | "staff";

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function buildUploadObjectPath(kind: UploadKind, ext: string): string {
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  return `${kind}/${filename}`;
}

async function uploadToLocal(
  buffer: Buffer,
  objectPath: string,
): Promise<string> {
  const segments = objectPath.split("/");
  const kind = segments[0] as UploadKind;
  const filename = segments[1];
  const dir = path.join(process.cwd(), "public", LOCAL_UPLOAD_DIR, kind);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);
  return `/${LOCAL_UPLOAD_DIR}/${objectPath}`;
}

async function uploadToSupabase(
  client: SupabaseClient,
  buffer: Buffer,
  objectPath: string,
  contentType: string,
): Promise<string> {
  const { error } = await client.storage.from(UPLOAD_BUCKET).upload(objectPath, buffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }
  const { data } = client.storage.from(UPLOAD_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function uploadImage(
  buffer: Buffer,
  options: { kind: UploadKind; ext: string; contentType: string },
): Promise<string> {
  const objectPath = buildUploadObjectPath(options.kind, options.ext);
  const supabase = getSupabaseClient();
  if (supabase) {
    return uploadToSupabase(supabase, buffer, objectPath, options.contentType);
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "Загрузка фото на сервере недоступна: добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в настройках Vercel",
    );
  }
  return uploadToLocal(buffer, objectPath);
}

export function isCloudStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
