import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
test("manifest has install identity and required real assets", () => {
  const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  assert.equal(m.name, "Blockchain");
  assert.equal(m.display, "standalone");
  assert.equal(m.scope, "/");
  for (const icon of m.icons) assert.ok(existsSync(`public${icon.src}`));
  assert.ok(m.icons.some((i: { purpose: string }) => i.purpose === "maskable"));
});
test("service worker displays push and handles malformed payload visibly", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const self = {
    addEventListener: (name: string, fn: (e: unknown) => void) =>
      (listeners[name] = fn),
    registration: {
      showNotification: async (
        title: string,
        options: Record<string, unknown>,
      ) => {
        shown.push({ title, options });
      },
    },
    location: { origin: "https://example.com" },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  async function push(data: unknown) {
    let promise: Promise<void> | undefined;
    listeners.push({
      data: { json: () => data },
      waitUntil: (p: Promise<void>) => {
        promise = p;
      },
    });
    await promise;
  }
  await push({
    v: 1,
    id: "test",
    title: "Hello",
    body: "Message",
    url: "https://evil.com",
  });
  assert.equal(shown[0].title, "Hello");
  assert.deepEqual(JSON.parse(JSON.stringify(shown[0].options.data)), {
    id: "test",
  });
  assert.equal(shown[0].options.icon, "/icons/icon-192.png");
  await push({ v: 99, title: "Fake" });
  assert.equal(shown[1].title, "Blockchain");
});
test("notification click always opens same-origin Blockchain", async () => {
  const listeners: Record<string, (event: unknown) => void> = {};
  let opened = "";
  let promise: Promise<void> | undefined;
  const self = {
    addEventListener: (n: string, f: (e: unknown) => void) =>
      (listeners[n] = f),
    location: { origin: "https://example.com" },
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => {
        opened = url;
      },
    },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  listeners.notificationclick({
    notification: { close() {}, data: { id: "abc", url: "https://evil.com" } },
    waitUntil: (p: Promise<void>) => {
      promise = p;
    },
  });
  await promise;
  assert.equal(opened, "https://example.com/?notification=abc");
});
