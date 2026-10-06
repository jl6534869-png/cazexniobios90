import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z, ZodError } from "zod";
import sharp from "sharp";
import { db } from "@/lib/db";
import {
  device,
  checkOrigin,
  HttpError,
  pair,
  rateLimit,
  origin,
  cookieName,
} from "@/lib/auth";
import {
  contentSchema,
  destinationAllowed,
  sendRequestSchema,
  subscriptionSchema,
} from "@/lib/validation";
import { sendNow, vapidReady } from "@/lib/push";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
async function json(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new HttpError(413, "Request too large.");
    }
    chunks.push(part.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function validatedContent(raw: unknown, deviceId: string) {
  const c = contentSchema.parse(raw);
  if (
    !destinationAllowed(
      c.destination,
      origin(),
      process.env.DESTINATION_ORIGINS,
    )
  )
    throw new HttpError(400, "Destination must use an allowed HTTPS origin.");
  if (
    c.assetId &&
    !(await db.uploadedAsset.findFirst({ where: { id: c.assetId, deviceId } }))
  )
    throw new HttpError(400, "Image not found.");
  return c;
}
async function handle(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const parts = (await context.params).path,
      [resource, id] = parts;
    if (req.method !== "GET") checkOrigin(req);
    if (resource === "pair" && req.method === "POST") {
      const b = z
        .object({
          code: z.string().max(200),
          name: z.string().trim().min(1).max(60),
        })
        .parse(await json(req));
      await pair(b.code, b.name);
      return NextResponse.json({ ok: true });
    }
    const d = await device();
    if (req.method !== "GET") await rateLimit(`device:${d.id}`, 60);
    if (resource === "session" && req.method === "DELETE") {
      await db.pushSubscription.deleteMany({ where: { deviceId: d.id } });
      await db.device.update({
        where: { id: d.id },
        data: { expiresAt: new Date() },
      });
      (await cookies()).delete(cookieName());
      return NextResponse.json({ ok: true });
    }
    if (resource === "device" && req.method === "PATCH") {
      const b = z
        .object({ name: z.string().trim().min(1).max(60) })
        .parse(await json(req));
      await db.device.update({ where: { id: d.id }, data: b });
      return NextResponse.json({ ok: true });
    }
    if (resource === "state" && req.method === "GET") {
      const [subscription, notifications, templates] = await Promise.all([
        db.pushSubscription.findUnique({
          where: { deviceId: d.id },
          select: { id: true },
        }),
        db.notification.findMany({
          where: { deviceId: d.id },
          include: {
            history: { orderBy: { createdAt: "desc" }, take: 20 },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        db.template.findMany({
          where: { deviceId: d.id },
          orderBy: { updatedAt: "desc" },
        }),
      ]);
      return NextResponse.json({
        device: { id: d.id, name: d.name },
        connected: Boolean(subscription),
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
        notifications,
        templates,
      });
    }
    if (resource === "subscription") {
      if (req.method === "POST") {
        const b = subscriptionSchema.parse(await json(req));
        if (!vapidReady()) throw new HttpError(503, "VAPID is not configured.");
        const existing = await db.pushSubscription.findUnique({
          where: { endpoint: b.endpoint },
        });
        if (existing && existing.deviceId !== d.id)
          throw new HttpError(
            409,
            "Subscription belongs to another session. Disconnect and enable again.",
          );
        await db.pushSubscription.upsert({
          where: { deviceId: d.id },
          create: { deviceId: d.id, endpoint: b.endpoint, ...b.keys },
          update: { endpoint: b.endpoint, ...b.keys },
        });
        return NextResponse.json({ ok: true });
      }
      if (req.method === "DELETE") {
        await db.pushSubscription.deleteMany({ where: { deviceId: d.id } });
        return NextResponse.json({ ok: true });
      }
    }
    if (resource === "assets") {
      if (req.method === "GET" && id) {
        const asset = await db.uploadedAsset.findFirst({
          where: { id, deviceId: d.id },
        });
        if (!asset) throw new HttpError(404, "Image not found.");
        return new Response(new Uint8Array(asset.data), {
          headers: {
            "Content-Type": asset.mime,
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
      if (req.method === "POST") {
        if (Number(req.headers.get("content-length") || 0) > 2200000)
          throw new HttpError(413, "Image too large.");
        const reader = req.body?.getReader();
        if (!reader) throw new HttpError(400, "Missing image.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > 2000000) {
            await reader.cancel();
            throw new HttpError(413, "Maximum image size is 2 MB.");
          }
          chunks.push(chunk.value);
        }
        if (
          (await db.uploadedAsset.count({ where: { deviceId: d.id } })) >= 100
        )
          throw new HttpError(
            400,
            "Image limit reached (100). Delete unused images in Settings.",
          );
        const input = Buffer.concat(chunks);
        let data: Buffer;
        try {
          const meta = await sharp(input, {
            limitInputPixels: 20000000,
          }).metadata();
          if (!["jpeg", "png", "webp"].includes(meta.format || ""))
            throw new Error();
          data = await sharp(input, { limitInputPixels: 20000000 })
            .rotate()
            .resize(256, 256, { fit: "cover" })
            .webp({ quality: 80 })
            .toBuffer();
        } catch {
          throw new HttpError(400, "Use a valid JPEG, PNG or WebP image.");
        }
        const asset = await db.uploadedAsset.create({
          data: { deviceId: d.id, data: new Uint8Array(data) },
        });
        return NextResponse.json({ id: asset.id });
      }
      if (req.method === "DELETE") {
        const [templates, notifications] = await Promise.all([
          db.template.findMany({ where: { deviceId: d.id } }),
          db.notification.findMany({ where: { deviceId: d.id } }),
        ]);
        const used = new Set(
          [...templates, ...notifications].map(
            (v) => contentSchema.parse(v.content).assetId,
          ),
        );
        const assets = await db.uploadedAsset.findMany({
          where: { deviceId: d.id },
          select: { id: true },
        });
        await db.uploadedAsset.deleteMany({
          where: {
            deviceId: d.id,
            id: { in: assets.map((a) => a.id).filter((a) => !used.has(a)) },
          },
        });
        return NextResponse.json({ ok: true });
      }
    }
    if (resource === "templates") {
      if (req.method === "POST") {
        if ((await db.template.count({ where: { deviceId: d.id } })) >= 100)
          throw new HttpError(400, "Maximum 100 templates.");
        const content = await validatedContent(await json(req), d.id);
        return NextResponse.json(
          await db.template.create({ data: { deviceId: d.id, content } }),
        );
      }
      if (id && req.method === "PATCH") {
        const content = await validatedContent(await json(req), d.id);
        const r = await db.template.updateMany({
          where: { id, deviceId: d.id },
          data: { content },
        });
        if (!r.count) throw new HttpError(404, "Template not found.");
        return NextResponse.json({ ok: true });
      }
      if (id && req.method === "DELETE") {
        await db.template.deleteMany({ where: { id, deviceId: d.id } });
        return NextResponse.json({ ok: true });
      }
    }
    if (resource === "notifications") {
      if (req.method === "POST" && !id) {
        await rateLimit(`send:${d.id}`, 20);
        const b = sendRequestSchema.parse(await json(req));
        const content = await validatedContent(b.content, d.id);
        let n = await db.notification.findUnique({
          where: {
            deviceId_idempotencyKey: {
              deviceId: d.id,
              idempotencyKey: b.idempotencyKey,
            },
          },
        });
        if (!n) {
          if (!vapidReady())
            throw new HttpError(503, "VAPID is not configured.");
          if (
            !(await db.pushSubscription.findUnique({
              where: { deviceId: d.id },
            }))
          )
            throw new HttpError(
              409,
              "Enable notifications on this device first.",
            );
          n = await db.notification.upsert({
            where: {
              deviceId_idempotencyKey: {
                deviceId: d.id,
                idempotencyKey: b.idempotencyKey,
              },
            },
            update: {},
            create: {
              deviceId: d.id,
              content,
              idempotencyKey: b.idempotencyKey,
              history: {
                create: {
                  status: "Pending",
                  detail:
                    "Immediate send requested. Pending or Unconfirmed does not confirm acceptance; no background retry is scheduled.",
                },
              },
            },
          });
        }
        if (n.status === "Pending") await sendNow(n.id, d.id);
        return NextResponse.json(
          await db.notification.findUnique({
            where: { id: n.id },
          }),
        );
      }
      if (id && req.method === "DELETE" && parts.length === 2) {
        const removed = await db.notification.deleteMany({
          where: {
            id,
            deviceId: d.id,
            OR: [
              { status: { not: "Unconfirmed" } },
              { attemptedAt: { lt: new Date(Date.now() - 120000) } },
            ],
          },
        });
        if (!removed.count)
          throw new HttpError(
            409,
            "Record unavailable or a send may still be running. Wait two minutes and refresh History.",
          );
        return NextResponse.json({ ok: true });
      }
      if (id && ["PATCH", "POST"].includes(req.method)) {
        throw new HttpError(
          410,
          "Scheduling is unavailable in this edition. Create a notification and use Send Now.",
        );
      }
    }
    if (resource === "diagnostics" && req.method === "GET") {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({
        backend: true,
        database: true,
        sending: "Immediate serverless request",
        scheduling: "Unavailable in the free edition",
        retries: "Manual only; no background queue",
        vapid: vapidReady(),
        destinationOrigins: [
          origin(),
          ...(process.env.DESTINATION_ORIGINS || "").split(",").filter(Boolean),
        ],
      });
    }
    throw new HttpError(404, "Not found.");
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    console.error(
      "API operation failed:",
      error instanceof Error ? error.name : "Unknown",
    );
    return NextResponse.json(
      {
        error:
          "Server unavailable or operation failed. Check Diagnostics and retry.",
      },
      { status: 503 },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
