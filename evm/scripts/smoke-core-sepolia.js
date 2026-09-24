import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Contract, JsonRpcProvider } from "ethers";
import { frozenCore, verifyCore, verifyDeploymentReceipt } from "./lib/core-release.js";

const releasePath = new URL("../releases/pulse-core-v1/sepolia.json", import.meta.url);

function rpcUrl() {
  const configured = process.env.PULSE_RPC_URL ?? process.env.SEPOLIA_RPC_URL;
  if (configured) return configured;

  const path = process.env.PULSE_SEPOLIA_ENV_FILE ?? `${homedir()}/.opsec/path/env/sepolia.env`;
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?(PULSE_RPC_URL|SEPOLIA_RPC_URL)=(.*)$/);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  const url = values.PULSE_RPC_URL ?? values.SEPOLIA_RPC_URL;
  assert(url, "Set PULSE_RPC_URL or provide a Sepolia RPC environment file");
  return url;
}

function state(value) {
  return {
    epochIndex: value.epochIndex,
    openTime: value.openTime,
    curveStartTime: value.curveStartTime,
    anchorTime: value.anchorTime,
    floorPrice: value.floorPrice
  };
}

async function main() {
  const release = JSON.parse(readFileSync(releasePath, "utf8"));
  const frozen = frozenCore();
  assert.equal(release.chainId, 11155111);
  assert.equal(release.runtimeCodeHash, frozen.manifest.runtimeCodeHash);
  assert.equal(release.versionId, frozen.manifest.versionId);

  const provider = new JsonRpcProvider(rpcUrl());
  try {
    const verified = await verifyCore(provider, release.address, 11155111n, frozen);
    const deployment = await verifyDeploymentReceipt(
      provider, verified.address, release.deployment.transactionHash, frozen
    );
    assert.equal(deployment.blockNumber, release.deployment.blockNumber);
    assert.equal(deployment.blockHash, release.deployment.blockHash);
    const finalized = await provider.getBlock("finalized");
    assert(finalized && finalized.number >= deployment.blockNumber, "Core deployment is not finalized");

    const core = new Contract(verified.address, frozen.abi, provider);
    const config = { k: 600n, genesisPrice: 1000n, genesisFloor: 900n, pts: 1n };
    const initial = state(await core.initialize(config, 1000n));
    assert.deepEqual(initial, {
      epochIndex: 0n, openTime: 1000n, curveStartTime: 1000n,
      anchorTime: 994n, floorPrice: 900n
    });
    assert.equal(await core.quote(config, initial, 0n), 1000n, "Pre-open quote differs");
    assert.equal(await core.quote(config, initial, 1010n), 937n, "Decayed quote differs");
    const [ask, next] = await core.advance(config, initial, 1000n);
    assert.equal(ask, 1000n);
    assert.deepEqual(state(next), {
      epochIndex: 1n, openTime: 1000n, curveStartTime: 1000n,
      anchorTime: 400n, floorPrice: 1000n
    });
    assert.equal(await core.quote(config, state(next), 1000n), 1001n, "Next-epoch quote differs");

    const rounded = { k: 10n, genesisPrice: 106n, genesisFloor: 100n, pts: 1n };
    const roundedInitial = state(await core.initialize(rounded, 100n));
    assert.equal(await core.quote(rounded, roundedInitial, 100n), 110n, "Rounding quote differs");

    console.log(JSON.stringify({
      status: "passed", network: "Ethereum Sepolia", chainId: release.chainId,
      address: verified.address, runtimeCodeHash: verified.runtimeCodeHash,
      deploymentTx: deployment.transactionHash, finalizedBlock: finalized.number,
      calls: ["initialize", "quote", "advance", "rounding quote"]
    }, null, 2));
  } finally {
    provider.destroy();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
