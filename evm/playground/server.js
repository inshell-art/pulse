import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Contract, JsonRpcProvider, keccak256 } from "ethers";

const release = JSON.parse(readFileSync(new URL("../releases/pulse-core-v1/sepolia.json", import.meta.url), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("../releases/pulse-core-v1/manifest.json", import.meta.url), "utf8"));
const abi = JSON.parse(readFileSync(new URL("../releases/pulse-core-v1/IPulseCore.abi.json", import.meta.url), "utf8"));
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/projects", ["projects.html", "text/html; charset=utf-8"]],
  ["/projects/", ["projects.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/projects.js", ["projects.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/projects.json", ["projects.json", "application/json; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]]
]);
const fields = ["epochIndex", "openTime", "curveStartTime", "anchorTime", "floorPrice"];
const errorNames = new Set([
  "InvalidCurveK", "InvalidGenesisPrices", "GenesisGapExceedsK", "InvalidPts",
  "TimeScaleOutOfRange", "StartTimeTooEarly", "InvalidState", "TimestampBeforeEpoch",
  "PriceOverflow", "TargetPriceOverflow", "EpochOverflow"
]);

function rpcUrl() {
  const direct = process.env.PULSE_RPC_URL ?? process.env.SEPOLIA_RPC_URL;
  if (direct) return direct;
  const envPath = process.env.PULSE_SEPOLIA_ENV_FILE ?? `${homedir()}/.opsec/path/env/sepolia.env`;
  const entries = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?(PULSE_RPC_URL|SEPOLIA_RPC_URL)=(.*)$/);
    if (match) entries[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  const value = entries.PULSE_RPC_URL ?? entries.SEPOLIA_RPC_URL;
  assert(value, "Set PULSE_RPC_URL or SEPOLIA_RPC_URL for the local playground");
  return value;
}

function uint(value, bits) {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) throw new Error("Invalid unsigned integer input");
  const parsed = BigInt(value);
  if (parsed >= 1n << BigInt(bits)) throw new Error("Input exceeds its ABI width");
  return parsed;
}

function config(value) {
  if (!value || typeof value !== "object") throw new Error("Missing curve settings");
  return {
    k: uint(value.k, 256),
    genesisPrice: uint(value.genesisPrice, 256),
    genesisFloor: uint(value.genesisFloor, 256),
    pts: uint(value.pts, 256)
  };
}

function state(value) {
  if (!value || typeof value !== "object") throw new Error("Missing curve state");
  return {
    epochIndex: uint(value.epochIndex, 64),
    openTime: uint(value.openTime, 64),
    curveStartTime: uint(value.curveStartTime, 64),
    anchorTime: uint(value.anchorTime, 64),
    floorPrice: uint(value.floorPrice, 256)
  };
}

function wireState(value) {
  return Object.fromEntries(fields.map((field) => [field, value[field].toString()]));
}

function limited(promise, milliseconds = 8000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Sepolia RPC timed out")), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}

function reply(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(body);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) throw new Error("Request is too large");
  }
  return JSON.parse(body);
}

async function main() {
  assert.equal(release.chainId, 11155111);
  assert.equal(release.runtimeCodeHash, manifest.runtimeCodeHash);
  const configuredRpc = rpcUrl();
  const rpcHosts = [configuredRpc];
  if (new URL(configuredRpc).hostname === "ethereum-sepolia-rpc.publicnode.com") {
    rpcHosts.push("https://sepolia.gateway.tenderly.co");
  }
  const connections = [];
  for (const url of rpcHosts) {
    const provider = new JsonRpcProvider(url);
    try {
      const network = await limited(provider.getNetwork());
      assert.equal(network.chainId, 11155111n, "The configured RPC is not Sepolia");
      const code = await limited(provider.getCode(release.address));
      assert.notEqual(code, "0x", "Pulse Core is missing at the released address");
      assert.equal(keccak256(code), release.runtimeCodeHash, "Pulse Core runtime hash differs from the release");
      const core = new Contract(release.address, abi, provider);
      assert.equal(await limited(core.version()), release.versionId, "Pulse Core version differs from the release");
      const sample = { k: 2160n * 10n ** 18n, genesisPrice: 10n ** 18n, genesisFloor: 2n * 10n ** 17n, pts: 66666666666666n };
      await limited(core.initialize(sample, BigInt(Math.floor(Date.now() / 1000))));
      connections.push({ provider, core });
    } catch {
      provider.destroy();
    }
  }
  assert(connections.length > 0, "No verified Sepolia RPC answered the Pulse Core calculation");
  let activeConnection = 0;
  let rateWindowStart = Date.now();
  let callCount = 0;
  let activeCalls = 0;
  const callsByAddress = new Map();

  function admitCall(req) {
    const now = Date.now();
    if (now - rateWindowStart >= 60_000) {
      rateWindowStart = now;
      callCount = 0;
      callsByAddress.clear();
    }
    const address = req.socket.remoteAddress ?? "unknown";
    const count = callsByAddress.get(address) ?? 0;
    if (callCount >= 300 || count >= 120 || activeCalls >= 16) return false;
    callCount++;
    activeCalls++;
    callsByAddress.set(address, count + 1);
    return true;
  }

  async function calculate(method, args) {
    let lastError;
    for (let attempt = 0; attempt < connections.length; attempt++) {
      const index = (activeConnection + attempt) % connections.length;
      try {
        const result = await limited(connections[index].core[method](...args));
        activeConnection = index;
        return result;
      } catch (error) {
        if (errorNames.has(error?.revert?.name)) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new Error("Sepolia calculation failed");
  }

  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/api/status") {
        return reply(res, 200, JSON.stringify({
          network: release.network,
          chainId: release.chainId,
          address: release.address,
          runtimeCodeHash: release.runtimeCodeHash,
          version: release.semanticsVersion,
          verified: true
        }));
      }
      if (req.method === "POST" && req.url === "/api/call") {
        if (req.headers["x-pulse-playground"] !== "1") {
          return reply(res, 403, JSON.stringify({ error: "Use the Pulse site to call this endpoint" }));
        }
        if (!admitCall(req)) return reply(res, 429, JSON.stringify({ error: "Too many calculations. Wait a moment and try again." }));
        try {
          const body = await readBody(req);
          const curve = config(body.config);
          let result;
          if (body.function === "initialize") {
            result = { state: wireState(await calculate("initialize", [curve, uint(body.startTime, 64)])) };
          } else if (body.function === "quote") {
            result = { ask: (await calculate("quote", [curve, state(body.state), uint(body.timestamp, 64)])).toString() };
          } else if (body.function === "advance") {
            const [ask, nextState] = await calculate("advance", [curve, state(body.state), uint(body.timestamp, 64)]);
            result = { ask: ask.toString(), nextState: wireState(nextState) };
          } else {
            throw new Error("Unknown calculation");
          }
          return reply(res, 200, JSON.stringify(result));
        } finally {
          activeCalls--;
        }
      }
      const file = files.get(req.url);
      if (req.method === "GET" && file) {
        return reply(res, 200, readFileSync(new URL(file[0], import.meta.url)), file[1]);
      }
      reply(res, 404, JSON.stringify({ error: "Page not found" }));
    } catch (error) {
      const domainName = error?.revert?.name;
      const message = errorNames.has(domainName) ? domainName :
        error?.message === "Invalid unsigned integer input" || error?.message === "Input exceeds its ABI width" ||
        error?.message === "Missing curve settings" || error?.message === "Missing curve state" ||
        error?.message === "Request is too large" || error?.message === "Unknown calculation"
          ? error.message : "Sepolia calculation failed";
      reply(res, 400, JSON.stringify({ error: message }));
    }
  });
  const port = Number(process.env.PORT ?? process.env.PULSE_PLAYGROUND_PORT ?? 4173);
  const host = process.env.PULSE_SITE_HOST ?? "127.0.0.1";
  assert(Number.isInteger(port) && port > 0 && port < 65536, "Invalid site port");
  server.listen(port, host, () => {
    console.log(`Pulse site listening on ${host}:${port}`);
    console.log(`Verified ${release.network} Core ${release.address}`);
  });
  server.on("close", () => connections.forEach(({ provider }) => provider.destroy()));
}

main().catch((error) => {
  console.error(`Playground could not start: ${error.message.replace(/https?:\/\/\S+/g, "[RPC URL]")}`);
  process.exitCode = 1;
});
