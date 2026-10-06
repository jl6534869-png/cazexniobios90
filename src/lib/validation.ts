import { z } from "zod";
export const contentSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    profile: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(600),
    secondary: z.string().trim().max(120).default(""),
    destination: z.string().trim().max(500).default(""),
    assetId: z
      .string()
      .regex(/^[a-z0-9]+$/)
      .max(40)
      .nullable()
      .default(null),
  })
  .strict();
export type Content = z.infer<typeof contentSchema>;
export function destinationAllowed(
  value: string,
  origin: string,
  extra: string = "",
): boolean {
  if (!value) return true;
  try {
    const u = new URL(value, origin);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      [
        origin,
        ...extra
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ].includes(u.origin)
    );
  } catch {
    return false;
  }
}
export function pushEndpointAllowed(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      (u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".push.apple.com") ||
        u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com")
    );
  } catch {
    return false;
  }
}
export const sendRequestSchema = z
  .object({
    content: contentSchema,
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine(pushEndpointAllowed, "Unsupported push provider"),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .length(87),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .length(22),
  }),
  expirationTime: z.number().nullable().optional(),
});
