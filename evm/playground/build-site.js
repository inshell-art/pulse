import { mkdir, copyFile, rm, writeFile } from "node:fs/promises";
import { publicAssets } from "./public-assets.js";
import { generateKnowledge } from "./generate-knowledge.js";
const { files: generated } = generateKnowledge();
const target = new URL("../../output/pulse-site/", import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
// Publish only allowlisted browser assets and public documentation.
const names = new Set([...publicAssets.values()].map(([name]) => name));
for (const name of names) {
  await mkdir(new URL(".", new URL(name, target)), { recursive: true });
  if (generated.has(name)) await writeFile(new URL(name, target), generated.get(name));
  else await copyFile(new URL(name, import.meta.url), new URL(name, target));
}
console.log(`Built ${names.size} public Pulse site assets.`);
