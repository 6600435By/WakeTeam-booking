import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientMtime?: number;
};

function prismaClientMtime(): number | undefined {
  try {
    const clientPath = path.join(
      process.cwd(),
      "node_modules",
      ".prisma",
      "client",
      "index.js",
    );
    return fs.statSync(clientPath).mtimeMs;
  } catch {
    return undefined;
  }
}

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === "production") {
    return globalForPrisma.prisma ?? createPrismaClient();
  }

  const mtime = prismaClientMtime();
  if (
    !globalForPrisma.prisma ||
    (mtime !== undefined && globalForPrisma.prismaClientMtime !== mtime)
  ) {
    void globalForPrisma.prisma?.$disconnect();
    globalForPrisma.prisma = createPrismaClient();
    globalForPrisma.prismaClientMtime = mtime;
  }

  return globalForPrisma.prisma;
}

export const prisma = getPrismaClient();
