import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { frozenCore } from "./lib/core-release.js";

const deploymentPath = new URL("../deployments/sepolia/pulse-core-v1.json", import.meta.url);
const journalPath = new URL("../deployments/sepolia/pulse-core-v1-explorer.json", import.meta.url);

function etherscanKey() {
  if (process.env.PULSE_ETHERSCAN_API_KEY) return process.env.PULSE_ETHERSCAN_API_KEY;
  const path = process.env.PULSE_ETHERSCAN_ENV_FILE ?? `${homedir()}/.inshell-secrets/inshell-sepolia.env`;
  const line = readFileSync(path, "utf8").split(/\r?\n/)
    .find((candidate) => /^ETHERSCAN_API_KEY=/.test(candidate));
  assert(line, "ETHERSCAN_API_KEY missing from configured environment file");
  return line.slice("ETHERSCAN_API_KEY=".length).trim().replace(/^['"]|['"]$/g, "");
}

async function api(action, key, body, query = {}) {
  const url = new URL("https://api.etherscan.io/v2/api");
  url.searchParams.set("chainid", "11155111");
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", action);
  url.searchParams.set("apikey", key);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const response = await fetch(url, body ? { method: "POST", headers: {
    "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) } : undefined);
  assert(response.ok, `Etherscan HTTP ${response.status}`);
  return response.json();
}

async function main() {
  assert(existsSync(deploymentPath), "Sepolia deployment record missing");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  assert.equal(deployment.status, "verified", "On-chain Sepolia deployment is not verified");
  const frozen = frozenCore();
  assert.equal(deployment.runtimeCodeHash, frozen.manifest.runtimeCodeHash);
  const key = etherscanKey();
  let journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : null;
  if (journal) assert.equal(journal.address, deployment.address, "Explorer journal uses another deployment");
  if (!journal) {
    const sourceCode = readFileSync(new URL("../releases/pulse-core-v1/standard-input.json", import.meta.url), "utf8");
    const response = await api("verifysourcecode", key, {
      contractaddress: deployment.address, sourceCode,
      contractname: "project/src/core/PulseCoreV1.sol:PulseCoreV1",
      compilerversion: `v${frozen.manifest.compiler}`,
      codeformat: "solidity-standard-json-input", optimizationUsed: "1", runs: "200",
      evmVersion: "shanghai", licenseType: "3"
    });
    assert.equal(response.status, "1", `Etherscan submission failed: ${response.result}`);
    journal = { schema: "pulse-core-explorer-verification/v1", chainId: 11155111,
      address: deployment.address, runtimeCodeHash: frozen.manifest.runtimeCodeHash,
      submissionGuid: response.result, status: "submitted" };
    writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
    console.log(`Explorer source submitted for ${deployment.address}`);
  }
  if (journal.status === "verified") { console.log(JSON.stringify(journal, null, 2)); return; }
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await api("checkverifystatus", key, undefined, { guid: journal.submissionGuid });
    if (result.status === "1") {
      journal.status = "verified";
      journal.result = result.result;
      writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
      console.log(JSON.stringify(journal, null, 2));
      return;
    }
    if (!/pending|queue/i.test(result.result ?? "")) throw new Error(`Etherscan verification failed: ${result.result}`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error("Etherscan verification remains pending; rerun to resume status check");
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
