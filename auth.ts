import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { appOrigin } from "./config";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secureEqual = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export const origin = () => appOrigin(process.env);
export const cookieName = () =>
  origin().startsWith("https:") ? "__Host-blockchain" : "blockchain_dev";
export async function device() {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token) throw new HttpError(401, "Pair this device first.");
  const d = await db.device.findUnique({ where: { sessionHash: hash(token) } });
  if (!d || d.expiresAt < new Date())
    throw new HttpError(401, "Session expired. Pair this device again.");
  return d;
}
export function checkOrigin(req: Request) {
  if (req.headers.get("origin") !== origin())
    throw new HttpError(403, "Origin rejected.");
}
export async function rateLimit(key: string, max: number, seconds = 60) {
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key","count","resetAt") VALUES (${key},1,NOW()+${seconds}*interval '1 second') ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateLimit"."resetAt"<NOW() THEN 1 ELSE "RateLimit"."count"+1 END,"resetAt"=CASE WHEN "RateLimit"."resetAt"<NOW() THEN NOW()+${seconds}*interval '1 second' ELSE "RateLimit"."resetAt" END RETURNING "count"`;
  if (rows[0].count > max)
    throw new HttpError(429, "Too many requests. Please wait and try again.");
}
export async function pair(code: string, name: string) {
  await rateLimit("pair-global", 10, 300);
  const expected = process.env.PAIRING_CODE;
  if (!expected || expected.length < 24)
    throw new HttpError(
      503,
      "Pairing is not configured securely on the server.",
    );
  if (!secureEqual(code, expected))
    throw new HttpError(401, "Incorrect pairing code.");
  const token = randomBytes(32).toString("base64url");
  await db.device.create({
    data: {
      name,
      sessionHash: hash(token),
      expiresAt: new Date(Date.now() + 365 * 86400000),
    },
  });
  (await cookies()).set(cookieName(), token, {
    httpOnly: true,
    secure: origin().startsWith("https:"),
    sameSite: "strict",
    path: "/",
    maxAge: 365 * 86400,
  });
}
