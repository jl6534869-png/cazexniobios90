import { test } from "node:test";
import assert from "node:assert/strict";
import { migrationUrl } from "../scripts/database.mjs";
test("Neon migrations use the matching direct endpoint and preserve credentials, database and TLS", () => {
  const input =
    "postgresql://owner:pass%40word@ep-test-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true";
  const result = new URL(migrationUrl(input));
  assert.equal(result.hostname, "ep-test.us-east-2.aws.neon.tech");
  assert.equal(result.password, "pass%40word");
  assert.equal(result.pathname, "/neondb");
  assert.equal(result.searchParams.get("sslmode"), "require");
  assert.equal(result.searchParams.has("pgbouncer"), false);
});
test("migration URL leaves other providers intact, honors an explicit direct endpoint and rejects missing configuration", () => {
  const other = "postgresql://u:p@my-pooler.example.com/db";
  assert.equal(migrationUrl(other), other);
  assert.equal(
    migrationUrl(other, "postgresql://u:p@direct.example.com/db"),
    "postgresql://u:p@direct.example.com/db",
  );
  assert.throws(() => migrationUrl(undefined));
  assert.throws(() => migrationUrl("https://example.com"));
});
