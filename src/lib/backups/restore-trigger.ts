export async function triggerRestoreWorkflow(input: {
  backupId: string;
  restoreDb: boolean;
  restoreFiles: boolean;
  confirmToken: string;
  restoreId: string;
  requestedBy?: string;
}): Promise<{ runUrl?: string }> {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    throw new Error("GITHUB_BACKUP_NOT_CONFIGURED");
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/restore.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.GITHUB_BACKUP_REF ?? "main",
        inputs: {
          backup_id: input.backupId,
          restore_db: String(input.restoreDb),
          restore_files: String(input.restoreFiles),
          confirm_token: input.confirmToken,
          restore_id: input.restoreId,
          requested_by: input.requestedBy ?? "",
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GITHUB_RESTORE_DISPATCH_FAILED:${res.status}:${text}`);
  }

  return {};
}

export async function triggerBackupWorkflow(input: {
  part: "db" | "files" | "all" | "trim";
  force?: boolean;
}): Promise<void> {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    throw new Error("GITHUB_BACKUP_NOT_CONFIGURED");
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/backup.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.GITHUB_BACKUP_REF ?? "main",
        inputs: {
          part: input.part,
          force: String(Boolean(input.force)),
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GITHUB_BACKUP_DISPATCH_FAILED:${res.status}:${text}`);
  }
}
