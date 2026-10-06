import webpush from "web-push";
import { db } from "./db";
import { contentSchema } from "./validation";

export function vapidReady() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
}

// One explicit request, one provider attempt. A durable claim prevents duplicate
// sends across concurrent functions and after an ambiguous process interruption.
export async function sendNow(id: string, deviceId: string): Promise<boolean> {
  if (!vapidReady()) throw new Error("VAPID is not configured.");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const claimed = await db.notification.updateMany({
    where: { id, deviceId, status: "Pending" },
    data: { status: "Unconfirmed", attemptedAt: new Date() },
  });
  if (!claimed.count) return false;
  const n = await db.notification.findUniqueOrThrow({
    where: { id },
    include: { device: { include: { subscription: true } } },
  });
  const sub = n.device.subscription;
  let failure: { status?: number } | undefined;
  try {
    const data = contentSchema.parse(n.content);
    if (!sub)
      throw Object.assign(new Error("No subscription"), { statusCode: 410 });
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        v: 1,
        id: n.id,
        title: data.title,
        body: [data.message, data.secondary].filter(Boolean).join("\n"),
        url: data.destination || "/",
      }),
      { TTL: 86400, urgency: "normal", timeout: 12000 },
    );
  } catch (error) {
    failure = { status: (error as { statusCode?: number }).statusCode };
  }
  // Keep DB errors outside the transport catch: an accepted push must never be
  // misclassified as a provider failure or silently sent a second time.
  const expired = failure?.status === 404 || failure?.status === 410;
  await db.$transaction(async (tx) => {
    if (expired && sub)
      await tx.pushSubscription.deleteMany({ where: { id: sub.id } });
    await tx.notification.update({
      where: { id },
      data: {
        status: failure ? "Failed" : "Sent",
        sentAt: failure ? null : new Date(),
        history: {
          create: {
            status: failure ? "Failed" : "Sent",
            detail: !failure
              ? "Accepted by push service; device delivery is not confirmed."
              : expired
                ? "Push subscription expired. Enable notifications again, then use Send Again."
                : `Push request failed${failure.status ? ` (HTTP ${failure.status})` : "; acceptance is unknown after a network error"}. No automatic retry. Review your device before using Send Again.`,
          },
        },
      },
    });
  });
  return true;
}
