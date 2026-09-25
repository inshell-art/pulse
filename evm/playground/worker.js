import { Interface, keccak256 } from "ethers";
import release from "../releases/pulse-core-v1/sepolia.json" with { type: "json" };
import abi from "../releases/pulse-core-v1/IPulseCore.abi.json" with { type: "json" };
import { errorNames, uint, config, state, wireState } from "./core-api.js";

const core = new Interface(abi);
const endpoints = ["https://ethereum-sepolia-rpc.publicnode.com", "https://sepolia.gateway.tenderly.co"];
const paths = new Map([
  ["/", "/index.html"], ["/projects", "/projects.html"], ["/projects/", "/projects.html"],
  ...["app.js", "projects.js", "styles.css", "projects.json", "favicon.svg"].map((p) => [`/${p}`, `/${p}`])
]);
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
};
const safeErrors = new Set(["Invalid unsigned integer input", "Input exceeds its ABI width", "Missing curve settings", "Missing curve state", "Request is too large", "Unknown calculation", ...errorNames]);
const json = (value, status = 200) => Response.json(value, { status, headers });

// These bounded counters protect each isolate; they are not a global quota.
export function createWorker(fetchRpc = fetch) {
  const verified = new Map();
  let windowStart = 0, count = 0, active = 0;
  const clients = new Map();

  async function rpc(url, method, params) {
    const response = await fetchRpc(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error("Sepolia unavailable");
    const body = await response.json();
    if (body.error) {
      const data = body.error.data;
      if (typeof data === "string") {
        let decoded;
        try { decoded = core.parseError(data); } catch { /* Untrusted RPC error. */ }
        if (errorNames.has(decoded?.name)) throw new Error(decoded.name);
      }
      throw new Error("Sepolia unavailable");
    }
    if (typeof body.result !== "string") throw new Error("Sepolia unavailable");
    return body.result;
  }

  async function verify(url) {
    const cached = verified.get(url);
    if (cached && cached.until > Date.now()) return cached.promise;
    const promise = (async () => {
      if (BigInt(await rpc(url, "eth_chainId", [])) !== BigInt(release.chainId)) throw new Error("Wrong chain");
      if (keccak256(await rpc(url, "eth_getCode", [release.address, "latest"])) !== release.runtimeCodeHash) throw new Error("Wrong Core");
      const version = await rpc(url, "eth_call", [{ to: release.address, data: core.encodeFunctionData("version") }, "latest"]);
      if (core.decodeFunctionResult("version", version)[0] !== release.versionId) throw new Error("Wrong version");
    })();
    verified.set(url, { promise, until: Date.now() + 300_000 });
    try { await promise; } catch (error) { verified.delete(url); throw error; }
  }

  async function calculate(method, args) {
    for (const url of endpoints) {
      try {
        await verify(url);
        if (!method) return;
        const result = await rpc(url, "eth_call", [{ to: release.address, data: core.encodeFunctionData(method, args) }, "latest"]);
        return core.decodeFunctionResult(method, result);
      } catch (error) {
        if (errorNames.has(error.message)) throw error;
      }
    }
    throw new Error("Sepolia calculation failed");
  }

  function admit(request) {
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); count = 0; clients.clear(); }
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    const calls = clients.get(ip) ?? 0;
    if (count >= 300 || calls >= 120 || active >= 16) return false;
    count++; clients.set(ip, calls + 1);
    return true;
  }

  async function readBody(request) {
    if (Number(request.headers.get("Content-Length")) > 16_384) throw new Error("Request is too large");
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Invalid input");
    const chunks = []; let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 16_384) { await reader.cancel(); throw new Error("Request is too large"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === "/api/call" || url.pathname === "/api/status") {
        const isCall = url.pathname === "/api/call";
        if (request.method !== (isCall ? "POST" : "GET")) return json({ error: "Method not allowed" }, 405);
        if (isCall && (request.headers.get("X-Pulse-Playground") !== "1" ||
            (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin))) {
          return json({ error: "Use the Pulse site to call this endpoint" }, 403);
        }
        if (!admit(request)) return json({ error: "Too many calculations. Wait a moment and try again." }, 429);
        active++;
        try {
          if (!isCall) {
            await calculate();
            return json({ network: release.network, chainId: release.chainId, address: release.address,
              runtimeCodeHash: release.runtimeCodeHash, version: release.semanticsVersion, verified: true });
          }
          const body = await readBody(request);
          const curve = config(body.config);
          if (body.function === "initialize") {
            const [initial] = await calculate("initialize", [curve, uint(body.startTime, 64)]);
            return json({ state: wireState(initial) });
          }
          if (body.function !== "quote" && body.function !== "advance") throw new Error("Unknown calculation");
          const result = await calculate(body.function, [curve, state(body.state), uint(body.timestamp, 64)]);
          return json(body.function === "quote" ? { ask: result[0].toString() } :
            { ask: result[0].toString(), nextState: wireState(result[1]) });
        } catch (error) {
          const inputError = safeErrors.has(error.message);
          return json({ error: inputError ? error.message : "Sepolia calculation failed" }, inputError || error instanceof SyntaxError ? 400 : 503);
        } finally { active--; }
      }
      const asset = paths.get(url.pathname);
      if (!asset || !["GET", "HEAD"].includes(request.method)) return json({ error: "Page not found" }, 404);
      url.pathname = asset;
      const response = await env.ASSETS.fetch(new Request(url, request));
      const secured = new Response(response.body, response);
      for (const [key, value] of Object.entries(headers)) secured.headers.set(key, value);
      return secured;
    }
  };
}

export default createWorker();
