import { readFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { isCompletePhone } from "@/lib/phone";
import { upsertClientByPhone } from "@/lib/clients/upsert";
import {
  dedupeRubitimeClients,
  parseRubitimeClientsTsv,
} from "@/lib/clients/parse-rubitime-export";

export type ImportRubitimeClientsOptions = {
  organizationSlug?: string;
  dryRun?: boolean;
};

export type ImportRubitimeClientsResult = {
  organizationId: string;
  parsed: number;
  skippedIncompletePhone: number;
  uniquePhones: number;
  created: number;
  updated: number;
  dryRun: boolean;
};

export async function importRubitimeClientsFromText(
  text: string,
  options: ImportRubitimeClientsOptions = {},
): Promise<ImportRubitimeClientsResult> {
  const slug = options.organizationSlug ?? "waketeam";
  const dryRun = options.dryRun ?? false;

  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) {
    throw new Error(`Organization not found: ${slug}`);
  }

  const parsed = parseRubitimeClientsTsv(text);
  const skippedIncompletePhone = parsed.filter((r) => !isCompletePhone(r.phone)).length;
  const rows = dedupeRubitimeClients(parsed);

  let created = 0;
  let updated = 0;

  if (!dryRun) {
    for (const row of rows) {
      const existing = await prisma.client.findUnique({
        where: {
          organizationId_phone: {
            organizationId: org.id,
            phone: row.canonicalPhone,
          },
        },
      });

      await upsertClientByPhone({
        organizationId: org.id,
        phone: row.canonicalPhone,
        firstName: row.firstName ?? "Клиент",
        lastName: row.lastName,
        email: row.email,
        notes: row.notes,
      });

      if (existing) updated++;
      else created++;
    }
  }

  return {
    organizationId: org.id,
    parsed: parsed.length,
    skippedIncompletePhone,
    uniquePhones: rows.length,
    created,
    updated,
    dryRun,
  };
}

export async function importRubitimeClientsFromFile(
  filePath: string,
  options: ImportRubitimeClientsOptions = {},
): Promise<ImportRubitimeClientsResult> {
  const text = await readFile(filePath, "utf8");
  return importRubitimeClientsFromText(text, options);
}
