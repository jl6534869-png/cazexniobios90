import type { Content } from "./validation";
export type RecordItem = {
  id: string;
  content: Content;
  status: string;
  createdAt: string;
  sentAt: string | null;
  history: { id: string; status: string; detail: string; createdAt: string }[];
};
export type Template = { id: string; content: Content };
export type State = {
  device: { id: string; name: string };
  connected: boolean;
  vapidPublicKey: string;
  notifications: RecordItem[];
  templates: Template[];
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || "Request failed."), {
      status: response.status,
    });
  return data;
}
export function isStandalone() {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
export const blank: Content = {
  name: "",
  profile: "Blockchain",
  title: "",
  message: "",
  secondary: "",
  destination: "",
  assetId: null,
};
export function vapidBytes(key: string) {
  return Uint8Array.from(
    atob(
      key
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(key.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
}
export async function compress(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPEG, PNG or WebP image. Export HEIC as JPEG first.",
    );
  if (file.size > 20_000_000)
    throw new Error("Choose an image smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const size = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - size) / 2,
      (img.height - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not process image."))),
        "image/jpeg",
        0.85,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
