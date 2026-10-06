import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
test("real Web Push library encrypts payload and signs VAPID without exposing private key", () => {
  const vapid = webpush.generateVAPIDKeys();
  const browserKey = createECDH("prime256v1");
  browserKey.generateKeys();
  const request = webpush.generateRequestDetails(
    {
      endpoint: "https://web.push.apple.com/test",
      keys: {
        p256dh: browserKey.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    },
    JSON.stringify({
      v: 1,
      id: "qa",
      title: "Blockchain",
      body: "Private reminder",
    }),
    {
      vapidDetails: {
        subject: "mailto:qa@example.com",
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey,
      },
      TTL: 86400,
    },
  );
  assert.equal(request.headers["Content-Encoding"], "aes128gcm");
  assert.match(String(request.headers.Authorization), /^vapid t=/);
  assert.ok(Buffer.isBuffer(request.body));
  assert.equal(request.body!.includes("Private reminder"), false);
  assert.equal(
    JSON.stringify(request.headers).includes(vapid.privateKey),
    false,
  );
});
