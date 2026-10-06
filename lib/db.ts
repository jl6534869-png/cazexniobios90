import { PrismaClient } from "@prisma/client";
import { runtimeDatabaseUrl } from "./config";
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db =
  globalDb.db ??
  new PrismaClient({
    datasourceUrl: runtimeDatabaseUrl(process.env.DATABASE_URL),
  });
// Reuse within a warm function instance; the managed pooler handles instances.
globalDb.db = db;
