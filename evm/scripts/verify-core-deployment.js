import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { JsonRpcProvider } from "ethers";
import { frozenCore, verifyCore, verifyDeploymentReceipt } from "./lib/core-release.js";
import { selectedTarget } from "./lib/core-release-targets.js";

async function main() {
  const rpcUrl = process.env.PULSE_RPC_URL;
  const chainId = process.env.PULSE_EXPECTED_CHAIN_ID;
  const address = process.env.PULSE_CORE_ADDRESS;
  const txHash = process.env.PULSE_DEPLOYMENT_TX;
  assert(rpcUrl, "Set PULSE_RPC_URL for the selected target chain");
  assert(chainId && /^[1-9][0-9]*$/.test(chainId), "Set positive PULSE_EXPECTED_CHAIN_ID");
  assert(address, "Set PULSE_CORE_ADDRESS");
  assert(txHash && /^0x[0-9a-fA-F]{64}$/.test(txHash), "Set PULSE_DEPLOYMENT_TX");
  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const frozen = frozenCore();
    const verifiedCore = await verifyCore(provider, address, chainId, frozen);
    const targetName = selectedTarget(verifiedCore.chainId);
    const deployment = await verifyDeploymentReceipt(provider, verifiedCore.address, txHash);
    const record = {
      schema: "pulse-core-verified-deployment/v1",
      build: { versionId: frozen.manifest.versionId, compiler: frozen.manifest.compiler,
        creationCodeHash: frozen.manifest.creationCodeHash, runtimeCodeHash: frozen.manifest.runtimeCodeHash },
      targetName,
      core: verifiedCore, deployment
    };
    const path = new URL(`../deployments/verified/pulse-core-v1-${chainId}-${verifiedCore.address.toLowerCase()}.json`, import.meta.url);
    mkdirSync(new URL("../deployments/verified/", import.meta.url), { recursive: true });
    writeFileSync(path, JSON.stringify(record, null, 2) + "\n");
    console.log(JSON.stringify(record, null, 2));
    console.log(`Verified deployment record: ${path.pathname}`);
  } finally {
    provider.destroy();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
