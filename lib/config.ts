export function appOrigin(env: Record<string, string | undefined>) {
  if (env.APP_ORIGIN) return new URL(env.APP_ORIGIN).origin;
  if (env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL)
    throw new Error("Enable Vercel system variables or configure APP_ORIGIN.");
  return "http://localhost:3000";
}
export function runtimeDatabaseUrl(value: string | undefined) {
  if (!value) return undefined;
  const url = new URL(value);
  for (const [key, val] of Object.entries({
    connection_limit: "1",
    pool_timeout: "5",
    connect_timeout: "10",
  })) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, val);
  }
  return url.toString();
}
