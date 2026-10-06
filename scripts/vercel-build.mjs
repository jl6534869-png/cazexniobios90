import { spawnSync } from "node:child_process";
function run(file, args = []) {
  const result = spawnSync(process.execPath, [file, ...args], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Production credentials must be scoped to Production in the Vercel dashboard.
// Preview builds compile the UI without migrating or accessing production data.
if (process.env.VERCEL_ENV === "production") run("scripts/migrate.mjs");
run("node_modules/prisma/build/index.js", ["generate"]);
run("node_modules/next/dist/bin/next", ["build"]);
