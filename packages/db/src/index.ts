import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export function createPrismaClient(): PrismaClient {
  const url = process.env.FLOWSHOPY_DB_URL ?? "file:./data.db";
  const adapter = new PrismaBetterSqlite3({
    url,
    timestampFormat: "unixepoch-ms"
  });
  return new PrismaClient({ adapter });
}

export { PrismaClient };
