#!/usr/bin/env npx tsx
import path from "path";
import { importRubitimeClientsFromFile } from "../src/lib/clients/import-rubitime-clients";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((a) => !a.startsWith("--"));

  if (!fileArg) {
    console.error("Usage: npm run db:import-clients -- <path-to-clients.tsv> [--dry-run]");
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  const result = await importRubitimeClientsFromFile(filePath, {
    organizationSlug: "waketeam",
    dryRun,
  });

  console.log(
    JSON.stringify(
      {
        file: filePath,
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
