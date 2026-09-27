// Browser/Worker-safe catalog: no filesystem access or arbitrary public paths.
// agent-index.json is the authored catalog; the served index adds generated downloads.
import catalog from "./docs/agent-index.json" with { type: "json" };
export { catalog };
export const documentSchema = "pulse.public-document/v1";
export const sourceEntries = value => [...value.documents, ...value.releases, ...value.projectContext];
const safePath = value => typeof value === "string" && /^[a-zA-Z0-9_./-]+$/.test(value) &&
  !value.split("/").some(part => !part || part === "." || part === "..");
export function validateCatalog(value) {
  const ids = new Set();
  const assetUrls = new Set();
  for (const asset of value.publicDocumentAssets ?? []) {
    if (!asset.url?.startsWith("/docs/assets/") || !safePath(asset.url.slice(1)) ||
        !asset.sourceFile?.startsWith("docs/public-media/") || !safePath(asset.sourceFile) ||
        !/^[a-f0-9]{64}$/.test(asset.sha256) || !asset.mediaType || assetUrls.has(asset.url)) {
      throw new Error(`Invalid or duplicate document asset: ${asset.url}`);
    }
    assetUrls.add(asset.url);
  }
  for (const entry of sourceEntries(value)) {
    if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id)) {
      throw new Error(`Invalid or duplicate document ID: ${entry.id}`);
    }
    ids.add(entry.id);
    if (!entry.title || !entry.authority || !entry.useFor || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Incomplete source metadata: ${entry.id}`);
    }
    if (entry.url.startsWith("/")) {
      if (!safePath(entry.url.slice(1)) ||
          !(entry.url === "/projects.json" || /^\/docs\/[a-z][a-z0-9-]*\.md$/.test(entry.url)) || entry.sourceCommit) {
        throw new Error(`Unapproved local source path: ${entry.id}`);
      }
    } else {
      const prefix = `https://raw.githubusercontent.com/inshell-art/pulse/${entry.sourceCommit}/`;
      if (!/^[a-f0-9]{40}$/.test(entry.sourceCommit) || !entry.url.startsWith(prefix) ||
          !safePath(entry.url.slice(prefix.length)) || !/\.(md|json)$/.test(entry.url)) {
        throw new Error(`Invalid pinned source path: ${entry.id}`);
      }
    }
    if (!Array.isArray(entry.assets) || entry.assets.some(url => !assetUrls.has(url))) {
      throw new Error(`Missing required asset or asset inventory: ${entry.id}`);
    }
  }
  return value;
}
export const documentPath = id => `/docs/documents/${id}.json`;
validateCatalog(catalog);
