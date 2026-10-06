import { rmSync } from "node:fs";
// Fixed, project-local generated directory. Avoid running removed/stale tests.
rmSync(new URL("../.runtime/", import.meta.url), {
  recursive: true,
  force: true,
});
