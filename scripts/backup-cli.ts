#!/usr/bin/env npx tsx
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import {
  hashDbFingerprint,
  hashFilesFingerprint,
  queryDbFingerprint,
  type UploadFileEntry,
} from "../src/lib/backups/fingerprint";
import { getRetentionPolicy } from "../src/lib/backups/retention";
import {
  formatBackupId,
  isBackupSeason,
  isSeasonEndForceDay,
} from "../src/lib/backups/season";
import {
  computeFilesFingerprint,
  dbObjectPath,
  filesObjectPath,
  findTodayDbManifest,
  getLatestManifest,
  listUploadFiles,
  readManifest,
  trimManifests,
  verifyRestoreConfirmToken,
  writeManifest,
  writeRestoreStatus,
} from "../src/lib/backups/storage";
import {
  downloadBackupObject,
  getBackupSupabase,
  uploadBackupObject as uploadObject,
} from "../src/lib/backups/supabase";
import type { BackupManifest, RestoreStatus } from "../src/lib/backups/types";

const prisma = new PrismaClient();

function log(msg: string) {
  console.log(`[backup] ${msg}`);
}

function parseArgs(argv: string[]) {
  const command = argv[0];
  const flags = new Set(argv.slice(1).filter((a) => a.startsWith("--")));
  const values = Object.fromEntries(
    argv
      .slice(1)
      .filter((a) => a.includes("="))
      .map((a) => {
        const [k, ...rest] = a.replace(/^--/, "").split("=");
        return [k, rest.join("=")];
      }),
  );
  return {
    command,
    force: flags.has("--force"),
    offseason: flags.has("--offseason"),
    values,
  };
}

async function runPgDump(outPath: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const bin = process.env.PG_DUMP ?? "pg_dump";
  execFileSync(
    bin,
    [url, "-Fc", "--no-owner", "--no-acl", "-f", outPath],
    { stdio: "inherit" },
  );
}

async function runPgRestore(dumpPath: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const bin = process.env.PG_RESTORE ?? "pg_restore";
  execFileSync(
    bin,
    ["--clean", "--if-exists", "--no-owner", "--no-acl", "-d", url, dumpPath],
    { stdio: "inherit" },
  );
}

async function zipDirectory(sourceDir: string, zipPath: string): Promise<void> {
  execFileSync("zip", ["-r", zipPath, "."], { cwd: sourceDir, stdio: "inherit" });
}

async function unzipToDirectory(zipPath: string, targetDir: string): Promise<void> {
  execFileSync("unzip", ["-o", zipPath, "-d", targetDir], { stdio: "inherit" });
}

async function downloadUploadsToDir(entries: UploadFileEntry[], dir: string): Promise<void> {
  const client = getBackupSupabase();
  const { mkdirSync, writeFileSync } = await import("fs");
  const { dirname } = await import("path");

  for (const entry of entries) {
    const { data, error } = await client.storage.from("uploads").download(entry.path);
    if (error || !data) {
      throw new Error(`UPLOAD_DOWNLOAD_FAILED:${entry.path}:${error?.message}`);
    }
    const fullPath = join(dir, entry.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, Buffer.from(await data.arrayBuffer()));
  }
}

async function uploadDirToUploads(sourceDir: string): Promise<void> {
  const client = getBackupSupabase();
  const { readdirSync, statSync, readFileSync } = await import("fs");
  const { join: joinPath } = await import("path");

  const files: Array<{ rel: string; body: Buffer; contentType: string }> = [];

  function walk(current: string, prefix = ""): void {
    for (const name of readdirSync(current)) {
      const full = joinPath(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
        continue;
      }
      const body = readFileSync(full);
      const contentType = name.endsWith(".png")
        ? "image/png"
        : name.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
      files.push({ rel, body, contentType });
    }
  }

  walk(sourceDir);

  for (const file of files) {
    const { error } = await client.storage.from("uploads").upload(file.rel, file.body, {
      upsert: true,
      contentType: file.contentType,
    });
    if (error) {
      throw new Error(`UPLOAD_RESTORE_FAILED:${file.rel}:${error.message}`);
    }
  }
}

async function cmdFingerprintDb(): Promise<void> {
  const fp = await queryDbFingerprint();
  const hash = hashDbFingerprint(fp);
  console.log(JSON.stringify({ fingerprint: fp, hash }, null, 2));
}

async function cmdFingerprintFiles(): Promise<void> {
  const hash = await computeFilesFingerprint();
  const entries = await listUploadFiles();
  console.log(JSON.stringify({ hash, count: entries.length }, null, 2));
}

async function backupDb(force: boolean): Promise<void> {
  if (!isBackupSeason() && !force) {
    log("off-season: skip db backup");
    return;
  }

  const fp = await queryDbFingerprint();
  const hash = hashDbFingerprint(fp);
  const latest = await getLatestManifest();
  if (!force && latest?.dbFingerprint === hash) {
    log("skipped: db unchanged");
    return;
  }

  const id = formatBackupId();
  const tmp = mkdtempSync(join(tmpdir(), "booking-db-"));
  const dumpPath = join(tmp, "db.dump");
  try {
    await runPgDump(dumpPath);
    const body = readFileSync(dumpPath);
    const client = getBackupSupabase();
    const path = dbObjectPath(id);
    await uploadObject(client, path, body, "application/octet-stream");

    const retention = getRetentionPolicy(fp.dbSize);
    const manifest: BackupManifest = {
      id,
      createdAt: new Date().toISOString(),
      db: { path, sizeBytes: body.length, fingerprint: hash },
      dbFingerprint: hash,
      dbSizeBytes: fp.dbSize,
      forced: force,
      seasonArchive: isSeasonEndForceDay() && force,
      retentionWarning: retention.level,
    };
    await writeManifest(manifest);
    await trimManifests({
      dbRetention: retention.dbRetentionCount,
      filesRetention: retention.filesRetentionCount,
    });
    log(`db backup created: ${id} (${body.length} bytes)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function backupFiles(force: boolean): Promise<void> {
  if (!isBackupSeason() && !force) {
    log("off-season: skip files backup");
    return;
  }

  const entries = await listUploadFiles();
  const hash = hashFilesFingerprint(entries);
  const sameDayDb = await findTodayDbManifest();
  const latest = await getLatestManifest();
  const fingerprintSource = sameDayDb ?? latest;
  if (!force && fingerprintSource?.filesFingerprint === hash) {
    log("skipped: files unchanged");
    return;
  }

  const existingManifest = sameDayDb;
  const id = existingManifest?.id ?? formatBackupId();
  const tmp = mkdtempSync(join(tmpdir(), "booking-files-"));
  const zipPath = join(tmp, "files.zip");
  const sourceDir = join(tmp, "uploads");
  try {
    const { mkdirSync } = await import("fs");
    mkdirSync(sourceDir, { recursive: true });
    await downloadUploadsToDir(entries, sourceDir);
    await zipDirectory(sourceDir, zipPath);
    const body = readFileSync(zipPath);
    const client = getBackupSupabase();
    const path = filesObjectPath(id);
    await uploadObject(client, path, body, "application/zip");

    const fp = await queryDbFingerprint();
    const retention = getRetentionPolicy(fp.dbSize);
    const manifest: BackupManifest = existingManifest
      ? {
          ...existingManifest,
          files: { path, sizeBytes: body.length, fingerprint: hash },
          filesFingerprint: hash,
        }
      : {
          id,
          createdAt: new Date().toISOString(),
          files: { path, sizeBytes: body.length, fingerprint: hash },
          filesFingerprint: hash,
          dbSizeBytes: fp.dbSize,
          forced: force,
          seasonArchive: isSeasonEndForceDay() && force,
          retentionWarning: retention.level,
        };
    await writeManifest(manifest);
    await trimManifests({
      dbRetention: retention.dbRetentionCount,
      filesRetention: retention.filesRetentionCount,
    });
    log(`files backup created: ${id} (${body.length} bytes)`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function cmdTrim(offseason: boolean): Promise<void> {
  if (offseason) {
    const result = await trimManifests({
      dbRetention: 1,
      filesRetention: 1,
      keepSeasonArchiveOnly: true,
    });
    log(`off-season trim removed: ${result.removed.join(", ") || "none"}`);
    return;
  }

  const fp = await queryDbFingerprint();
  const retention = getRetentionPolicy(fp.dbSize);
  const result = await trimManifests({
    dbRetention: retention.dbRetentionCount,
    filesRetention: retention.filesRetentionCount,
  });
  log(`trim removed: ${result.removed.join(", ") || "none"}`);
}

async function cmdRestore(values: Record<string, string>): Promise<void> {
  const backupId = values["backup-id"];
  const filesBackupId = values["files-backup-id"] || backupId;
  const restoreId = values["restore-id"];
  const confirmToken = values["confirm-token"] ?? "";
  const restoreDb = values["restore-db"] === "true";
  const restoreFiles = values["restore-files"] === "true";
  const requestedBy = values["requested-by"] ?? "";

  if (!backupId || !restoreId) throw new Error("backup-id and restore-id required");
  if (
    !verifyRestoreConfirmToken(
      backupId,
      restoreDb,
      restoreFiles,
      confirmToken,
      filesBackupId !== backupId ? filesBackupId : undefined,
    )
  ) {
    throw new Error("INVALID_CONFIRM_TOKEN");
  }

  const dbManifest = await readManifest(backupId);
  const filesManifest =
    filesBackupId === backupId ? dbManifest : await readManifest(filesBackupId);
  if (!dbManifest && !filesManifest) {
    throw new Error(`MANIFEST_NOT_FOUND:${backupId}`);
  }

  const status: RestoreStatus = {
    restoreId,
    backupId,
    status: "running",
    restoreDb,
    restoreFiles,
    startedAt: new Date().toISOString(),
    requestedBy: requestedBy || undefined,
    githubRunUrl: process.env.GITHUB_RUN_URL,
    steps: [
      { name: "download", label: "Скачивание бэкапа", status: "running" },
      { name: "db", label: "Восстановление базы данных", status: "pending" },
      { name: "files", label: "Восстановление фото", status: "pending" },
    ],
  };
  await writeRestoreStatus(status);

  const client = getBackupSupabase();
  const tmp = mkdtempSync(join(tmpdir(), "booking-restore-"));

  try {
    if (restoreDb && dbManifest?.db?.path) {
      status.steps[0].status = "done";
      status.steps[1].status = "running";
      await writeRestoreStatus(status);
      const dumpBuf = await downloadBackupObject(client, dbManifest.db.path);
      const dumpPath = join(tmp, "restore.dump");
      const { writeFileSync } = await import("fs");
      writeFileSync(dumpPath, dumpBuf);
      await runPgRestore(dumpPath);
      status.steps[1].status = "done";
    } else if (restoreDb) {
      throw new Error("BACKUP_HAS_NO_DB");
    } else {
      status.steps[0].status = "done";
      status.steps[1].status = "done";
    }

    if (restoreFiles && filesManifest?.files?.path) {
      status.steps[2].status = "running";
      await writeRestoreStatus(status);
      const zipBuf = await downloadBackupObject(client, filesManifest.files.path);
      const zipPath = join(tmp, "files.zip");
      const { writeFileSync } = await import("fs");
      writeFileSync(zipPath, zipBuf);
      const targetDir = join(tmp, "restored-uploads");
      const { mkdirSync } = await import("fs");
      mkdirSync(targetDir, { recursive: true });
      await unzipToDirectory(zipPath, targetDir);
      await uploadDirToUploads(targetDir);
      status.steps[2].status = "done";
    } else if (restoreFiles) {
      throw new Error("BACKUP_HAS_NO_FILES");
    } else {
      status.steps[2].status = "done";
    }

    status.status = "success";
    status.finishedAt = new Date().toISOString();
    await writeRestoreStatus(status);
    log(`restore success: ${restoreId}`);
  } catch (e) {
    status.status = "failed";
    status.finishedAt = new Date().toISOString();
    status.error = e instanceof Error ? e.message : String(e);
    for (const step of status.steps) {
      if (step.status === "running") step.status = "failed";
    }
    await writeRestoreStatus(status);
    throw e;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

async function main() {
  const { command, force, offseason, values } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case "fingerprint-db":
        await cmdFingerprintDb();
        break;
      case "fingerprint-files":
        await cmdFingerprintFiles();
        break;
      case "backup-db":
        await backupDb(force || isSeasonEndForceDay());
        break;
      case "backup-files":
        await backupFiles(force || isSeasonEndForceDay());
        break;
      case "trim":
        await cmdTrim(offseason);
        break;
      case "restore":
        await cmdRestore(values);
        break;
      default:
        console.error(
          "Usage: backup-cli.ts <fingerprint-db|fingerprint-files|backup-db|backup-files|trim|restore> [--force] [--offseason] [--backup-id=] ...",
        );
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
