import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#101114"/><path d="M138 163L256 95l118 68v138l-118 69-118-69z" fill="none" stroke="#ff941f" stroke-width="16" stroke-linejoin="round"/><path d="M218 178h51c55 0 56 65 10 68 59 1 59 72-1 72h-60zm0 68h61M237 154v24m29-24v24m-29 140v25m29-25v25" fill="none" stroke="#ff941f" stroke-width="20" stroke-linejoin="round"/><path d="M184 396h144" stroke="#414248" stroke-width="10" stroke-linecap="round"/></svg>`;
await mkdir("public/icons", { recursive: true });
await writeFile("public/icons/mark.svg", svg);
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
  ["favicon", 32],
])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/${name}.png`);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#101114" },
})
  .composite([
    {
      input: await sharp(Buffer.from(svg)).resize(384, 384).toBuffer(),
      gravity: "center",
    },
  ])
  .png()
  .toFile("public/icons/maskable-512.png");
console.log("Original Blockchain icons generated.");
