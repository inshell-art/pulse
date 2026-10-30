// Explicit public files only. The server, Worker, and build share this allowlist.
// Values are [source file, media type, published asset path].
import { catalog, sourceEntries, documentPath } from "./knowledge-catalog.js";
export const publicAssets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8", "/index.html"]],
  ["/projects", ["projects.html", "text/html; charset=utf-8", "/projects.html"]],
  ["/projects/", ["projects.html", "text/html; charset=utf-8", "/projects.html"]],
  ...["app.js", "projects.js", "agent.js", "analytics.js", "analytics-core.js"].map(name => [`/${name}`, [name, "text/javascript; charset=utf-8", `/${name}`]]),
  ["/styles.css", ["styles.css", "text/css; charset=utf-8", "/styles.css"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml", "/favicon.svg"]],
  ["/robots.txt", ["robots.txt", "text/plain; charset=utf-8", "/robots.txt"]],
  ["/docs/agent-index.json", ["docs/agent-index.json", "application/json; charset=utf-8", "/docs/agent-index.json"]],
  ["/docs/agent-prompt.txt", ["docs/agent-prompt.txt", "text/plain; charset=utf-8", "/docs/agent-prompt.txt"]],
  ["/docs/document-format.md", ["docs/document-format.md", "text/markdown; charset=utf-8", "/docs/document-format.md"]],
  ...sourceEntries(catalog).filter(entry => entry.url.startsWith("/")).map(entry => [entry.url,
    [entry.url.slice(1), `${entry.url.endsWith(".json") ? "application/json" : "text/markdown"}; charset=utf-8`, entry.url]]),
  ...sourceEntries(catalog).map(entry => {
    const path = documentPath(entry.id);
    return [path, [path.slice(1), "application/json; charset=utf-8", path]];
  }),
  ...(catalog.publicDocumentAssets ?? []).map(asset => [asset.url, [asset.url.slice(1), asset.mediaType, asset.url]])
]);
