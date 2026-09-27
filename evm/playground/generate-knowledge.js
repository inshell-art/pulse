import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { catalog, sourceEntries, validateCatalog, documentPath, documentSchema } from "./knowledge-catalog.js";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const serialize = value => Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
const root = new URL("../../", import.meta.url);
export function readSource(entry) {
  if (entry.url.startsWith("/")) return readFileSync(new URL(entry.url.slice(1), import.meta.url));
  const path = entry.url.split(`${entry.sourceCommit}/`)[1];
  return execFileSync("git", ["show", `${entry.sourceCommit}:${path}`], { cwd: fileURLToPath(root), maxBuffer: 8 * 1024 * 1024 });
}
function contentText(bytes, id) {
  try {
    // Preserve a UTF-8 BOM and original line endings in the content string.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!Buffer.from(text, "utf8").equals(Buffer.from(bytes))) throw new Error("round trip");
    return text;
  } catch { throw new Error(`Source is not lossless UTF-8: ${id}`); }
}
function checkHash(bytes, expected, id) {
  if (sha256(bytes) !== expected) throw new Error(`Stale source digest: ${id}; review source, update sha256 and index version`);
}

// Offline and deterministic. Outputs exist only in memory or the website build,
// never in Core release directories. Tests may inject a source reader.
export function generateKnowledge(input = catalog, read = readSource) {
  validateCatalog(input);
  const index = structuredClone(input);
  const files = new Map();
  const assets = new Map();
  for (const asset of input.publicDocumentAssets ?? []) {
    let bytes;
    try { bytes = readFileSync(new URL(asset.sourceFile, import.meta.url)); }
    catch { throw new Error(`Missing required document asset: ${asset.url}`); }
    checkHash(bytes, asset.sha256, asset.url);
    files.set(asset.url.slice(1), bytes);
    assets.set(asset.url, { url: asset.url, mediaType: asset.mediaType, byteLength: bytes.length, sha256: asset.sha256 });
  }
  // Build-only source paths must not be exposed in the public index.
  index.publicDocumentAssets = [...assets.values()];
  for (const entry of sourceEntries(index)) {
    const bytes = read(entry);
    checkHash(bytes, entry.sha256, entry.id);
    const content = contentText(bytes, entry.id);
    const json = entry.url.endsWith(".json");
    if (json) JSON.parse(content.replace(/^\uFEFF/, "")); // Validate only; never reserialize source content.
    const source = { url: entry.url, ...(entry.sourceCommit ? { commit: entry.sourceCommit } : {}),
      mediaType: json ? "application/json" : "text/markdown", sha256: entry.sha256 };
    const envelope = { schema: documentSchema, id: entry.id, title: entry.title, authority: entry.authority,
      revision: `sha256:${entry.sha256}`, source, contentFormat: json ? "json" : "markdown", content,
      assets: entry.assets.map(url => assets.get(url)) };
    const body = serialize(envelope);
    const path = documentPath(entry.id);
    files.set(path.slice(1), body);
    entry.download = { url: path, mediaType: "application/json", byteLength: body.length, sha256: sha256(body), schema: documentSchema };
  }
  files.set("docs/agent-index.json", serialize(index));
  return { index, files };
}
