import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { execFileSync, execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { catalog, sourceEntries } from "./knowledge-catalog.js";
import { generateKnowledge, readSource, sha256 } from "./generate-knowledge.js";
import { publicAssets } from "./public-assets.js";

const { index, files: generated } = generateKnowledge();
const target = new URL("../../output/pulse-site/", import.meta.url);
const privatePaths = ["/server.js", "/public-assets.js", "/generate-knowledge.js", "/knowledge-catalog.js", "/worker.js",
  "/docs/unknown.md", "/docs/documents/unknown.json", "/docs/../server.js", "/docs/%2e%2e%2fserver.js", "/.env", "/AGENTS.md", "/MEMO.md", "/INBOX.md"];

// Build once; test both the generated files and the actual bundled Worker entrypoint.
execFileSync(process.execPath, [fileURLToPath(new URL("build-site.js", import.meta.url))]);

test("all ten sources round-trip exactly, with separate source and serialized download hashes", () => {
  assert.equal(sourceEntries(index).length, 10);
  for (const entry of sourceEntries(index)) {
    const bytes = readSource(entry);
    const raw = generated.get(entry.download.url.slice(1));
    const doc = JSON.parse(raw);
    assert.deepEqual(Buffer.from(doc.content, "utf8"), bytes, entry.id);
    assert.equal(sha256(bytes), entry.sha256);
    assert.equal(doc.source.sha256, entry.sha256);
    assert.equal(doc.source.commit, entry.sourceCommit);
    assert.equal(doc.revision, `sha256:${entry.sha256}`);
    assert.equal(sha256(raw), entry.download.sha256);
    assert.equal(raw.length, entry.download.byteLength);
    assert.equal(doc.schema, entry.download.schema);
    assert.deepEqual(doc.assets, []);
    // Current reviewed inventory: formulas/diagrams are text, no unaccounted-for embedded media.
    assert.doesNotMatch(doc.content, /!\[[^\]]*\]\(|<(?:img|video|iframe)\b/i);
  }
  assert.equal(index.answerPolicy.forbidStateChanges, true);
  assert.deepEqual(index.answerPolicy.allowedMethods, ["GET", "HEAD"]);
  assert(index.liveReadOnlyResources.every(source => source.method === "GET" && source.stateChanging === false));
});

function oneDocument(content, json = false) {
  const value = structuredClone(catalog);
  const entry = { ...value.documents[0], id: "fixture", url: json ? "/projects.json" : "/docs/pulse.md", sha256: sha256(content) };
  value.documents = [entry]; value.releases = []; value.projectContext = [];
  return value;
}
test("Unicode, BOM, CRLF, formula/code/table text, nested JSON and large numbers survive losslessly", () => {
  for (const [content, json] of [
    [Buffer.from('\uFEFF# 等待 → demand 🟢\r\n\r\n```solidity\r\nuint x = 1;\r\n```\r\n| x | y |\r\nΔP = PTS × Δt\r\n'), false],
    [Buffer.from('{\r\n "nested": {"integer": 900719925474099312345, "string": "900719925474099312345", "unicode": "需求"}}\r\n'), true]
  ]) {
    const { index, files } = generateKnowledge(oneDocument(content, json), () => content);
    const entry = index.documents[0];
    const doc = JSON.parse(files.get(entry.download.url.slice(1)));
    assert.deepEqual(Buffer.from(doc.content), content);
    assert.equal(doc.contentFormat, json ? "json" : "markdown");
  }
});
test("generation is deterministic and rejects stale hashes, duplicate IDs, paths, invalid UTF-8 and missing assets", () => {
  assert.deepEqual(generateKnowledge().files, generated);
  const stale = structuredClone(catalog); stale.documents[0].sha256 = "0".repeat(64);
  assert.throws(() => generateKnowledge(stale), /Stale source digest: proposition/);
  const duplicate = structuredClone(catalog); duplicate.documents.push(duplicate.documents[0]);
  assert.throws(() => generateKnowledge(duplicate), /duplicate document ID/);
  for (const id of ["../secret", "Foo", "a/b", "", "a%2fb"]) {
    const invalid = structuredClone(catalog); invalid.documents[0].id = id;
    assert.throws(() => generateKnowledge(invalid), /document ID/);
  }
  for (const url of ["/../.env", "/docs/../../MEMO.md", "https://example.com/source.md"]) {
    const invalid = structuredClone(catalog); invalid.documents[0].url = url;
    assert.throws(() => generateKnowledge(invalid), /source path/);
  }
  const invalid = Buffer.from([0xc3, 0x28]);
  assert.throws(() => generateKnowledge(oneDocument(invalid), () => invalid), /not lossless UTF-8: fixture/);
  const asset = structuredClone(catalog); asset.documents[0].assets = ["/docs/assets/missing.svg"];
  assert.throws(() => generateKnowledge(asset), /Missing required asset/);
  asset.publicDocumentAssets = [{ url: "/docs/assets/missing.svg", sourceFile: "docs/public-media/missing.svg", sha256: "0".repeat(64), mediaType: "image/svg+xml" }];
  assert.throws(() => generateKnowledge(asset), /Missing required document asset/);
});
test("build exposes exactly the explicit allowlist and generated bodies", () => {
  const files = [];
  function collect(dir, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) collect(new URL(`${entry.name}/`, dir), `${name}/`);
      else files.push(name);
    }
  }
  collect(target);
  const expected = [...new Set([...publicAssets.values()].map(([name]) => name))].sort();
  assert.deepEqual(files.sort(), expected);
  for (const name of expected) assert.deepEqual(readFileSync(new URL(name, target)), generated.get(name) ?? readFileSync(new URL(name, import.meta.url)));
});

test("bundled Worker serves exact built GET/HEAD bodies and security headers with no RPC", async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL("worker.js", import.meta.url))], bundle: true, platform: "browser", format: "esm", write: false, metafile: true });
  assert(!Object.keys(bundle.metafile.inputs).some(path => path.includes("generate-knowledge")));
  // Capture a failing transport when the bundled production default is constructed.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Static discovery must not need RPC"); };
  try {
    const worker = (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`)).default;
    const env = { ASSETS: { fetch: async req => new Response(req.method === "HEAD" ? null : readFileSync(new URL(new URL(req.url).pathname.slice(1), target))) } };
    for (const [route, [source, mediaType]] of publicAssets) {
      for (const method of ["GET", "HEAD"]) {
        const response = await worker.fetch(new Request(`https://pulse.inshell.art${route}`, { method }), env);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("Content-Type"), mediaType);
        assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
        assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
        assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
        assert.equal(await response.text(), method === "HEAD" ? "" : readFileSync(new URL(source, target), "utf8"));
      }
    }
    for (const path of privatePaths) assert.equal((await worker.fetch(new Request(`https://pulse.inshell.art${path}`), env)).status, 404);
  } finally { globalThis.fetch = originalFetch; }
});

async function listen(server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return server.address().port;
}
async function startPreview(t, extraEnv = {}) {
  const reserve = createServer(); const port = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL("server.js", import.meta.url))], {
    env: { ...process.env, PULSE_SITE_HOST: "127.0.0.1", PORT: String(port), PULSE_RPC_URL: "", SEPOLIA_RPC_URL: "", PULSE_SEPOLIA_ENV_FILE: "/nonexistent/pulse-test-env", ...extraEnv }, stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, "exit"); } });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Preview startup timeout")), 10000);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Preview exited ${code}`)); });
    child.stdout.on("data", chunk => { if (chunk.toString().includes("listening")) { clearTimeout(timer); resolve(); } });
  });
  return `http://127.0.0.1:${port}`;
}
test("Node documents work without RPC configuration; standalone client downloads/searches outside repo", async t => {
  const base = await startPreview(t);
  for (const [route, [source, mediaType]] of publicAssets) {
    for (const method of ["GET", "HEAD"]) {
      const response = await fetch(base + route, { method });
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get("Content-Type"), mediaType);
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.equal(await response.text(), method === "HEAD" ? "" : readFileSync(new URL(source, target), "utf8"));
    }
  }
  for (const path of privatePaths) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + "/api/status")).status, 503);
  assert.equal((await fetch(base + "/docs/agent-index.json")).status, 200);
  const dir = mkdtempSync(join(tmpdir(), "pulse-public-client-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  copyFileSync(new URL("smoke-public-access.py", import.meta.url), join(dir, "client.py"));
  const { stdout } = await promisify(execFile)("python3", ["client.py", base, "--save-dir", "downloads"], { cwd: dir, timeout: 30000 });
  assert.match(stdout, /10 complete downloads/);
  assert.match(stdout, /all network access disabled during analysis/);
  const offline = await promisify(execFile)("python3", ["client.py", "--offline-dir", "downloads"], { cwd: dir, timeout: 10000 });
  assert.match(offline.stdout, /10 complete downloads/);
  const selected = await promisify(execFile)("python3", ["client.py", base, "--ids", "core-api", "core-abi", "--save-dir", "selected"], { cwd: dir, timeout: 30000 });
  assert.match(selected.stdout, /2 complete downloads/);
  assert.match(readFileSync(join(dir, "downloads", "core-api.md"), "utf8"), /floorPrice/);
  assert(readFileSync(join(dir, "downloads", "core-abi.json"), "utf8").includes('"advance"'));
});
test("Node rejects invalid requests before RPC and wrong-chain verification fails closed", async t => {
  const methods = [];
  const rpc = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); const batch = Array.isArray(request) ? request : [request];
    const results = batch.map(item => { methods.push(item.method); return { jsonrpc: "2.0", id: item.id, result: "0x1" }; });
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(Array.isArray(request) ? results : results[0]));
  });
  const port = await listen(rpc); t.after(() => { rpc.closeAllConnections(); rpc.close(); });
  const base = await startPreview(t, { PULSE_RPC_URL: `http://127.0.0.1:${port}` });
  const call = body => fetch(base + "/api/call", { method: "POST", headers: { "X-Pulse-Playground": "1" }, body: JSON.stringify(body) });
  assert.equal((await call({ function: "initialize", config: { k: "-1", genesisPrice: "1000", genesisFloor: "900", pts: "1" }, startTime: "1000" })).status, 400);
  assert.deepEqual(methods, []);
  assert.equal((await fetch(base + "/api/status")).status, 503);
  assert.deepEqual(methods, ["eth_chainId"]);
  assert.equal((await call({ function: "initialize", config: { k: "600", genesisPrice: "1000", genesisFloor: "900", pts: "1" }, startTime: "1000" })).status, 503);
  assert.equal((await fetch(base + "/docs/documents/core-api.json")).status, 200);
});
