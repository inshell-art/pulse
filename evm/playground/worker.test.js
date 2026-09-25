import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Interface } from "ethers";
import { createWorker } from "./worker.js";
const abi = JSON.parse(readFileSync(new URL("../releases/pulse-core-v1/IPulseCore.abi.json", import.meta.url)));
const release = JSON.parse(readFileSync(new URL("../releases/pulse-core-v1/sepolia.json", import.meta.url)));
const runtime = readFileSync(new URL("../releases/pulse-core-v1/PulseCoreV1.runtime.hex", import.meta.url), "utf8").trim();
const core = new Interface(abi);
const config = { k: "600", genesisPrice: "1000", genesisFloor: "900", pts: "1" };
const state = { epochIndex: "0", openTime: "1000", curveStartTime: "1000", anchorTime: "994", floorPrice: "900" };
const request = (body, extra = {}) => new Request("https://pulse.inshell.art/api/call", {
  method: "POST", headers: { "X-Pulse-Playground": "1", ...extra }, body: JSON.stringify(body)
});
function transport({ wrongChain = false, wrongCode = false, wrongVersion = false, failPrimary = false, revert = false } = {}) {
  const calls = [];
  return { calls, fetch: async (url, options) => {
    const { method, params } = JSON.parse(options.body); calls.push({ url, method, params });
    if (failPrimary && url.includes("publicnode")) return new Response("unavailable", { status: 503 });
    let result;
    if (method === "eth_chainId") result = wrongChain ? "0x1" : "0xaa36a7";
    else if (method === "eth_getCode") result = wrongCode ? "0x00" : runtime;
    else {
      assert.equal(method, "eth_call"); assert.equal(params[0].to, release.address);
      const parsed = core.parseTransaction({ data: params[0].data });
      if (revert && parsed.name !== "version") return Response.json({ error: { data: core.encodeErrorResult("InvalidCurveK") } });
      const values = parsed.name === "version" ? [wrongVersion ? '0x'+'00'.repeat(32) : release.versionId] : parsed.name === "initialize" ? [state] : parsed.name === "quote" ? [937n] : [1000n, { ...state, epochIndex: "1", floorPrice: "1000" }];
      result = core.encodeFunctionResult(parsed.name, values);
    }
    return Response.json({ result });
  } };
}
test("verified identity and all three calculations use fixed read-only RPC calls", async () => {
  const rpc = transport(); const worker = createWorker(rpc.fetch);
  const status = await worker.fetch(new Request("https://pulse.inshell.art/api/status"));
  assert.equal((await status.json()).verified, true);
  for (const method of ["initialize", "quote", "advance"]) {
    const response = await worker.fetch(request({ function: method, config, state, startTime: "1000", timestamp: "1010" }));
    assert.equal(response.status, 200); const result = await response.json();
    if (method === "initialize") assert.deepEqual(result.state, state);
    else assert.equal(result.ask, method === "quote" ? "937" : "1000");
  }
  assert.equal(rpc.calls.filter(c => c.method === "eth_chainId").length, 1);
});
test("reject mismatched chain, bytecode and version; fail over on transport failure", async () => {
  for (const option of ["wrongChain", "wrongCode", "wrongVersion"]) {
    const response = await createWorker(transport({ [option]: true }).fetch).fetch(new Request("https://pulse.inshell.art/api/status"));
    assert.equal(response.status, 503); assert.equal((await response.json()).error, "Sepolia calculation failed");
  }
  const rpc = transport({ failPrimary: true });
  assert.equal((await createWorker(rpc.fetch).fetch(new Request("https://pulse.inshell.art/api/status"))).status, 200);
  assert(rpc.calls.some(c => c.url.includes("tenderly")));
});
test("reject invalid inputs, cross-origin requests, oversized bodies and arbitrary methods before RPC", async () => {
  const rpc = transport(); const worker = createWorker(rpc.fetch);
  for (const [req, expected] of [
    [request({ function: "sendTransaction", config }), 400],
    [request({ function: "initialize", config: { ...config, k: "-1" }, startTime: "1000" }), 400],
    [request({ function: "initialize", config, startTime: (2n**64n).toString() }), 400],
    [request({}, { Origin: "https://foreign.example" }), 403],
    [request({}, { "X-Pulse-Playground": "0" }), 403],
    [request({ padding: "x".repeat(16385) }), 400]
  ]) assert.equal((await worker.fetch(req)).status, expected);
  assert.equal(rpc.calls.length, 0);
});
test("surface only approved Core errors and bound repeated API requests", async () => {
  const worker = createWorker(transport({ revert: true }).fetch);
  const body = { function: "initialize", config, startTime: "1000" };
  const response = await worker.fetch(request(body));
  assert.equal(response.status, 400); assert.equal((await response.json()).error, "InvalidCurveK");
  for (let i = 1; i < 120; i++) await worker.fetch(request(body));
  assert.equal((await worker.fetch(request(body))).status, 429);
});
test("only public asset paths are served, with security headers", async () => {
  const worker = createWorker();
  const env = { ASSETS: { fetch: async req => new Response(new URL(req.url).pathname) } };
  const page = await worker.fetch(new Request("https://pulse.inshell.art/projects"), env);
  assert.equal(await page.text(), "/projects.html");
  assert.match(page.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal((await worker.fetch(new Request("https://pulse.inshell.art/server.js"), env)).status, 404);
});
