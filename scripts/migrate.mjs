import { spawnSync } from "node:child_process";
import { migrationUrl } from "./database.mjs";
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: migrationUrl(
        process.env.DATABASE_URL,
        process.env.DIRECT_URL,
      ),
    },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
