import prismaClientModule from "@prisma/client";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const { PrismaClient } = prismaClientModule;

export function createPrismaClient(): PrismaClientType {
  const url = process.env.FLOWSHOPY_DB_URL ?? "file:./data.db";
  const adapter = new PrismaBetterSqlite3({
    url,
    timestampFormat: "unixepoch-ms"
  });
  return new PrismaClient({ adapter });
}

export { PrismaClient };
export type { PrismaClientType };
