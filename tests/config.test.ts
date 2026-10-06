import { test } from "node:test";
import assert from "node:assert/strict";
import { appOrigin, runtimeDatabaseUrl } from "../src/lib/config";
test("stable production origin is used for cookies and Origin checks, never a preview hostname", () => {
  assert.equal(
    appOrigin({
      VERCEL: "1",
      VERCEL_URL: "preview.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "blockchain.vercel.app",
    }),
    "https://blockchain.vercel.app",
  );
  assert.equal(
    appOrigin({
      APP_ORIGIN: "https://custom.example/",
      VERCEL_PROJECT_PRODUCTION_URL: "blockchain.vercel.app",
    }),
    "https://custom.example",
  );
  assert.throws(() =>
    appOrigin({ VERCEL: "1", VERCEL_URL: "preview.vercel.app" }),
  );
});
test("runtime bounds Prisma connections without altering credentials or TLS", () => {
  const url = new URL(
    runtimeDatabaseUrl(
      "postgresql://u:p@ep-test-pooler.aws.neon.tech/db?sslmode=require",
    )!,
  );
  assert.equal(url.searchParams.get("connection_limit"), "1");
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.hostname, "ep-test-pooler.aws.neon.tech");
  assert.equal(
    new URL(
      runtimeDatabaseUrl("postgresql://u:p@localhost/db?connection_limit=2")!,
    ).searchParams.get("connection_limit"),
    "2",
  );
});
