import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import webpush from "web-push";
test(
  "PostgreSQL immediate dispatch and HTTP security",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:qa@example.com";
    const { db } = await import("../src/lib/db");
    const { sendNow } = await import("../src/lib/push");
    const token = randomUUID();
    const d = await db.device.create({
      data: {
        name: "QA disposable",
        sessionHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const d2 = await db.device.create({
      data: {
        name: "QA second device",
        sessionHash: randomUUID(),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const content = {
      name: "QA",
      profile: "Blockchain",
      title: "Test",
      message: "Test payload",
      secondary: "",
      destination: "",
      assetId: null,
    };
    const subscribe = () =>
      db.pushSubscription.upsert({
        where: { deviceId: d.id },
        create: {
          deviceId: d.id,
          endpoint: "https://web.push.apple.com/qa-" + d.id,
          p256dh: "test",
          auth: "test",
        },
        update: {},
      });
    const create = () =>
      db.notification.create({
        data: {
          deviceId: d.id,
          content,
          idempotencyKey: randomUUID(),
        },
      });
    const original = webpush.sendNotification;
    try {
      await subscribe();
      await t.test(
        "concurrent invocations send one accepted push",
        async () => {
          let sends = 0;
          webpush.sendNotification = async () => {
            sends++;
            await new Promise((r) => setTimeout(r, 50));
            return { statusCode: 201, body: "", headers: {} };
          };
          const n = await create();
          const results = await Promise.all([
            sendNow(n.id, d.id),
            sendNow(n.id, d.id),
          ]);
          assert.equal(results.filter(Boolean).length, 1);
          assert.equal(sends, 1);
          const saved = await db.notification.findUniqueOrThrow({
            where: { id: n.id },
            include: { job: true, history: true },
          });
          assert.equal(saved.status, "Sent");
          assert.equal(saved.job, null);
          assert.match(saved.history[0].detail, /not confirmed/);
        },
      );
      await t.test(
        "transient, rate-limit and network failures finish without a queued retry",
        async () => {
          for (const statusCode of [503, 429, undefined]) {
            let sends = 0;
            webpush.sendNotification = async () => {
              sends++;
              throw Object.assign(new Error("network"), { statusCode });
            };
            const n = await create();
            await sendNow(n.id, d.id);
            await sendNow(n.id, d.id);
            const saved = await db.notification.findUniqueOrThrow({
              where: { id: n.id },
              include: { history: true, job: true },
            });
            assert.equal(saved.status, "Failed");
            assert.equal(saved.job, null);
            assert.match(saved.history[0].detail, /No automatic retry/);
            assert.equal(sends, 1);
          }
        },
      );
      await t.test(
        "an ambiguous interrupted attempt is never automatically sent again",
        async () => {
          const n = await create();
          await db.notification.update({
            where: { id: n.id },
            data: { status: "Unconfirmed", attemptedAt: new Date() },
          });
          webpush.sendNotification = async () => {
            throw new Error("must not send");
          };
          assert.equal(await sendNow(n.id, d.id), false);
          assert.equal(
            (await db.notification.findUniqueOrThrow({ where: { id: n.id } }))
              .status,
            "Unconfirmed",
          );
        },
      );
      await t.test(
        "database failure after provider acceptance remains unconfirmed and cannot resend",
        async () => {
          const n = await create();
          const transaction = db.$transaction;
          let sends = 0;
          webpush.sendNotification = async () => {
            sends++;
            return { statusCode: 201, body: "", headers: {} };
          };
          try {
            db.$transaction = async () => {
              throw new Error("Test database completion failure");
            };
            await assert.rejects(sendNow(n.id, d.id), /completion failure/);
          } finally {
            db.$transaction = transaction;
          }
          assert.equal(
            (await db.notification.findUniqueOrThrow({ where: { id: n.id } }))
              .status,
            "Unconfirmed",
          );
          assert.equal(await sendNow(n.id, d.id), false);
          assert.equal(sends, 1);
        },
      );
      await t.test(
        "another device cannot claim a pending notification",
        async () => {
          const n = await create();
          assert.equal(await sendNow(n.id, d2.id), false);
          assert.equal(
            (await db.notification.findUniqueOrThrow({ where: { id: n.id } }))
              .status,
            "Pending",
          );
        },
      );
      await t.test("expired subscription is removed", async () => {
        webpush.sendNotification = async () => {
          throw Object.assign(new Error("expired"), { statusCode: 410 });
        };
        const n = await create();
        await sendNow(n.id, d.id);
        assert.equal(
          (await db.notification.findUniqueOrThrow({ where: { id: n.id } }))
            .status,
          "Failed",
        );
        assert.equal(
          await db.pushSubscription.findUnique({ where: { deviceId: d.id } }),
          null,
        );
      });
      await t.test("cancelled notification never sends", async () => {
        const n = await create();
        await db.notification.update({
          where: { id: n.id },
          data: { status: "Cancelled" },
        });
        assert.equal(await sendNow(n.id, d.id), false);
      });
      await t.test(
        "idempotency key uniqueness and device isolation",
        async () => {
          const n = await create();
          await assert.rejects(
            db.notification.create({
              data: {
                deviceId: d.id,
                content,
                idempotencyKey: n.idempotencyKey,
              },
            }),
          );
          assert.equal(
            await db.notification.findFirst({
              where: { id: n.id, deviceId: d2.id },
            }),
            null,
          );
        },
      );
      if (process.env.TEST_APP_URL)
        await t.test(
          "HTTP endpoints enforce authentication, Origin and ownership",
          async () => {
            const base = process.env.TEST_APP_URL!;
            const headers = {
              cookie: `blockchain_dev=${token}`,
              origin: base,
              "Content-Type": "application/json",
            };
            assert.equal((await fetch(`${base}/api/state`)).status, 401);
            assert.equal(
              (await fetch(`${base}/api/cron/notifications`)).status,
              401,
            );
            assert.equal(
              (await fetch(`${base}/api/cron/notifications`, { headers }))
                .status,
              404,
            );
            assert.equal(
              (
                await fetch(`${base}/api/templates`, {
                  method: "POST",
                  headers: { ...headers, origin: "https://evil.example" },
                  body: JSON.stringify(content),
                })
              ).status,
              403,
            );
            const response = await fetch(`${base}/api/templates`, {
              method: "POST",
              headers,
              body: JSON.stringify(content),
            });
            assert.equal(response.status, 200);
            const template = await response.json();
            const other = await db.template.create({
              data: { deviceId: d2.id, content },
            });
            assert.equal(
              (
                await fetch(`${base}/api/templates/${other.id}`, {
                  method: "PATCH",
                  headers,
                  body: JSON.stringify(content),
                })
              ).status,
              404,
            );
            assert.equal(
              (
                await fetch(`${base}/api/templates/${template.id}`, {
                  method: "PATCH",
                  headers,
                  body: JSON.stringify({
                    ...content,
                    destination: "https://evil.example",
                  }),
                })
              ).status,
              400,
            );
            assert.equal(
              (
                await fetch(`${base}/api/subscription`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    endpoint: "https://127.0.0.1/internal",
                    keys: { p256dh: "a".repeat(87), auth: "a".repeat(22) },
                  }),
                })
              ).status,
              400,
            );
            const state = await (
              await fetch(`${base}/api/state`, { headers })
            ).json();
            assert.ok(
              state.templates.some((v: { id: string }) => v.id === template.id),
            );
            assert.ok(
              !state.templates.some((v: { id: string }) => v.id === other.id),
            );
            assert.equal("sessionHash" in state.device, false);
            assert.equal(
              (
                await fetch(`${base}/api/templates`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    ...content,
                    message: "x".repeat(17000),
                  }),
                })
              ).status,
              413,
            );
            assert.equal(
              (
                await fetch(`${base}/api/assets`, {
                  method: "POST",
                  headers: { ...headers, "Content-Type": "image/png" },
                  body: "not-an-image",
                })
              ).status,
              400,
            );
            const sharp = (await import("sharp")).default;
            const image = await sharp({
              create: {
                width: 32,
                height: 32,
                channels: 3,
                background: "#ff982d",
              },
            })
              .png()
              .toBuffer();
            const upload = await fetch(`${base}/api/assets`, {
              method: "POST",
              headers: { ...headers, "Content-Type": "image/png" },
              body: new Uint8Array(image),
            });
            assert.equal(upload.status, 200);
            const asset = await upload.json();
            const downloaded = await fetch(`${base}/api/assets/${asset.id}`, {
              headers,
            });
            assert.equal(downloaded.headers.get("content-type"), "image/webp");
            assert.equal(
              (await fetch(`${base}/api/assets/${asset.id}`)).status,
              401,
            );
            const before = await db.notification.count({
              where: { deviceId: d.id },
            });
            const scheduled = await fetch(`${base}/api/notifications`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                content,
                local: "2030-01-01T12:00",
                timezone: "UTC",
                idempotencyKey: randomUUID(),
              }),
            });
            assert.equal(scheduled.status, 400);
            assert.equal(
              await db.notification.count({ where: { deviceId: d.id } }),
              before,
            );
            const pending = await create();
            for (const [suffix, method] of [
              ["", "PATCH"],
              ["/cancel", "POST"],
              ["/send", "POST"],
            ]) {
              assert.equal(
                (
                  await fetch(
                    `${base}/api/notifications/${pending.id}${suffix}`,
                    { method, headers, body: JSON.stringify({ content }) },
                  )
                ).status,
                410,
              );
            }
            const diagnostics = await (
              await fetch(`${base}/api/diagnostics`, { headers })
            ).json();
            assert.equal(
              diagnostics.scheduling,
              "Unavailable in the free edition",
            );
            assert.equal(diagnostics.database, true);
            assert.equal("schedulerLastSeen" in diagnostics, false);
            // Replaying a completed idempotency key must not invoke transport,
            // even on the HTTP test server with VAPID intentionally unconfigured.
            const completed = await db.notification.create({
              data: {
                deviceId: d.id,
                content,
                idempotencyKey: randomUUID(),
                status: "Sent",
                sentAt: new Date(),
              },
            });
            const replay = await fetch(`${base}/api/notifications`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                content,
                idempotencyKey: completed.idempotencyKey,
              }),
            });
            assert.equal(replay.status, 200);
            assert.equal((await replay.json()).id, completed.id);
            if (!process.env.TEST_SERVER_HAS_VAPID) {
              const noConfig = await fetch(`${base}/api/notifications`, {
                method: "POST",
                headers,
                body: JSON.stringify({ content, idempotencyKey: randomUUID() }),
              });
              assert.equal(noConfig.status, 503);
              assert.match((await noConfig.json()).error, /VAPID/);
            }
            assert.equal(
              (
                await fetch(`${base}/api/notifications/${completed.id}`, {
                  method: "DELETE",
                  headers,
                })
              ).status,
              200,
            );
            const interrupted = await create();
            await db.notification.update({
              where: { id: interrupted.id },
              data: { status: "Unconfirmed", attemptedAt: new Date() },
            });
            assert.equal(
              (
                await fetch(`${base}/api/notifications/${interrupted.id}`, {
                  method: "DELETE",
                  headers,
                })
              ).status,
              409,
            );
            await db.notification.update({
              where: { id: interrupted.id },
              data: { attemptedAt: new Date(Date.now() - 180000) },
            });
            assert.equal(
              (
                await fetch(`${base}/api/notifications/${interrupted.id}`, {
                  method: "DELETE",
                  headers,
                })
              ).status,
              200,
            );
            await db.rateLimit.upsert({
              where: { key: `device:${d.id}` },
              create: {
                key: `device:${d.id}`,
                count: 60,
                resetAt: new Date(Date.now() + 60000),
              },
              update: { count: 60, resetAt: new Date(Date.now() + 60000) },
            });
            assert.equal(
              (
                await fetch(`${base}/api/templates`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify(content),
                })
              ).status,
              429,
            );
          },
        );
    } finally {
      webpush.sendNotification = original;
      await db.device.deleteMany({ where: { id: { in: [d.id, d2.id] } } });
      await db.rateLimit.deleteMany({
        where: { key: { in: [`device:${d.id}`, `send:${d.id}`] } },
      });
      await db.$disconnect();
    }
  },
);
