import { prisma } from "@/lib/db";
import { normalizePhone } from "@/lib/slots/generateSlots";
import { parseIntField, parseMembershipCsv, parseSaleDate } from "./parse-csv";

export function membershipsCsvUrlFromEnv(): string {
  const raw = process.env.MEMBERSHIPS_SHEET_URL?.trim();
  if (!raw) throw new Error("MEMBERSHIPS_SHEET_URL_NOT_SET");
  if (raw.includes("output=csv") || raw.includes("format=csv")) return raw;
  if (raw.includes("/pubhtml")) {
    return raw.replace(/\/pubhtml\/?$/, "/pub?output=csv");
  }
  if (raw.includes("/pub?")) return raw;
  if (raw.includes("/spreadsheets/d/") && !raw.includes("/e/")) {
    const base = raw.split("#")[0].replace(/\/edit.*$/, "");
    const gidMatch = raw.match(/[#&]gid=(\d+)/);
    const gid = gidMatch?.[1] ?? "0";
    return `${base}/export?format=csv&gid=${gid}`;
  }
  throw new Error("MEMBERSHIPS_SHEET_URL_INVALID");
}

export async function fetchMembershipsCsv(): Promise<string> {
  const url = membershipsCsvUrlFromEnv();
  const res = await fetch(url, {
    headers: {
      "User-Agent": "booking-crm/1.0 (+memberships-sync)",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`MEMBERSHIPS_FETCH_FAILED:${res.status}`);
  }
  return res.text();
}

export type SyncMembershipsResult = {
  imported: number;
  updated: number;
  skipped: number;
};

export async function syncMembershipsFromSheet(
  organizationId: string,
): Promise<SyncMembershipsResult> {
  const csv = await fetchMembershipsCsv();
  const rows = parseMembershipCsv(csv);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date();

  for (const row of rows) {
    const phoneRaw = row.phone.trim();
    if (!phoneRaw) {
      skipped++;
      continue;
    }
    const phone = normalizePhone(phoneRaw);
    const data = {
      category: row.category || null,
      ownerName: row.ownerName || null,
      phone,
      saleDate: parseSaleDate(row.saleDate),
      initialMinutes: parseIntField(row.initialMinutes),
      sheetRemainingMinutes: parseIntField(row.sheetRemainingMinutes),
      comment: row.comment || null,
      syncedAt: now,
    };

    const existing = await prisma.membership.findUnique({
      where: {
        organizationId_externalCode: {
          organizationId,
          externalCode: row.externalCode,
        },
      },
    });

    if (existing) {
      const newSheet = data.sheetRemainingMinutes;
      const oldSheet = existing.sheetRemainingMinutes;
      let localDeductedMinutes = existing.localDeductedMinutes;
      if (newSheet > oldSheet) {
        localDeductedMinutes = Math.max(
          0,
          localDeductedMinutes - (newSheet - oldSheet),
        );
      }
      await prisma.membership.update({
        where: { id: existing.id },
        data: { ...data, localDeductedMinutes },
      });
      updated++;
    } else {
      await prisma.membership.create({
        data: {
          organizationId,
          externalCode: row.externalCode,
          ...data,
        },
      });
      imported++;
    }
  }

  return { imported, updated, skipped };
}
