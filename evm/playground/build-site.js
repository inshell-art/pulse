import { mkdir, copyFile, rm } from "node:fs/promises";
const target = new URL("../../output/pulse-site/", import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
// Publish only browser assets, never server code, credentials, or release inputs.
for (const name of ["index.html", "projects.html", "app.js", "projects.js", "styles.css", "projects.json", "favicon.svg"]) {
  await copyFile(new URL(name, import.meta.url), new URL(name, target));
}
console.log("Built seven public Pulse site assets.");
