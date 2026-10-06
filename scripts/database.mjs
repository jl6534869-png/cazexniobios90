export function migrationUrl(databaseUrl, directUrl) {
  if (!databaseUrl) throw new Error("Configure DATABASE_URL before deploying.");
  const url = new URL(directUrl || databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be PostgreSQL.");
  if (!directUrl && url.hostname.endsWith(".neon.tech")) {
    url.hostname = url.hostname.replace(/-pooler\./, ".");
  }
  url.searchParams.delete("pgbouncer");
  return url.toString();
}
