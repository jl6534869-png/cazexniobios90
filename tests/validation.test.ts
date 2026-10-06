import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentSchema,
  destinationAllowed,
  pushEndpointAllowed,
  sendRequestSchema,
} from "../src/lib/validation";
test("destination URLs reject credentials, unsafe protocols, deceptive hosts and open redirects", () => {
  const origin = "https://blockchain.example.com";
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://evil.com",
    "https://blockchain.example.com.evil.com",
    "//evil.com",
    "https://user:pass@blockchain.example.com",
  ])
    assert.equal(destinationAllowed(url, origin), false, url);
  assert.equal(destinationAllowed("/?tab=history", origin), true);
  assert.equal(
    destinationAllowed(
      "https://wallet.example.com/a",
      origin,
      "https://wallet.example.com",
    ),
    true,
  );
});
test("push endpoints prevent arbitrary server requests", () => {
  for (const url of [
    "http://127.0.0.1",
    "https://127.0.0.1",
    "https://push.apple.com.evil.com",
    "https://fcm.googleapis.com:8080/a",
    "https://user@web.push.apple.com/a",
  ])
    assert.equal(pushEndpointAllowed(url), false);
  for (const url of [
    "https://web.push.apple.com/a",
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
  ])
    assert.equal(pushEndpointAllowed(url), true);
});
test("send-only API rejects schedule fields instead of silently sending early", () => {
  const body = {
    content: {
      name: "Test",
      profile: "Blockchain",
      title: "Test",
      message: "Hello",
    },
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  };
  assert.equal(sendRequestSchema.safeParse(body).success, true);
  for (const field of [
    "local",
    "timezone",
    "dueAt",
    "scheduledAt",
    "schedule",
  ]) {
    assert.equal(
      sendRequestSchema.safeParse({ ...body, [field]: "2030-01-01" }).success,
      false,
    );
  }
});
test("composer enforces limits and rejects unknown fields", () => {
  const c = {
    name: "Reminder",
    profile: "Blockchain",
    title: "Hello",
    message: "Remember",
  };
  assert.equal(contentSchema.parse(c).assetId, null);
  assert.equal(
    contentSchema.safeParse({ ...c, title: "x".repeat(101) }).success,
    false,
  );
  assert.equal(contentSchema.safeParse({ ...c, name: "  " }).success, false);
  assert.equal(
    contentSchema.safeParse({ ...c, deviceId: "other-device" }).success,
    false,
  );
});
