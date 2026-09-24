import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { frozenCore, verifyCore, verifyDeploymentReceipt } from "./lib/core-release.js";
import { sepoliaContext } from "./lib/sepolia-release.js";

const deploymentPath = new URL("../deployments/sepolia/pulse-core-v1.json", import.meta.url);
const rehearsalPath = new URL("../deployments/sepolia/pulse-core-v1-rehearsal.json", import.meta.url);
const explorerPath = new URL("../deployments/sepolia/pulse-core-v1-explorer.json", import.meta.url);
const releasePath = new URL("../releases/pulse-core-v1/sepolia.json", import.meta.url);

async function main() {
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const rehearsal = JSON.parse(readFileSync(rehearsalPath, "utf8"));
  assert.equal(deployment.status, "verified");
  assert.equal(rehearsal.status, "verified");
  assert.equal(rehearsal.core, deployment.address);
  const frozen = frozenCore();
  const { provider } = await sepoliaContext();
  try {
    const verified = await verifyCore(provider, deployment.address, 11155111n, frozen);
    const receipt = await verifyDeploymentReceipt(provider, verified.address, deployment.transactionHash, frozen);
    const explorer = existsSync(explorerPath) ? JSON.parse(readFileSync(explorerPath, "utf8")) : null;
    if (explorer) assert.equal(explorer.address, verified.address);
    const previousRecord = existsSync(releasePath) ? JSON.parse(readFileSync(releasePath, "utf8")) : null;
    if (previousRecord) {
      assert.equal(previousRecord.address, verified.address);
      assert.equal(previousRecord.runtimeCodeHash, frozen.manifest.runtimeCodeHash);
    }
    let rehearsalGas = 0n;
    let rehearsalExecutionFee = 0n;
    let lastRehearsalBlock = 0;
    for (const [name, entry] of Object.entries(rehearsal.steps)) {
      const txReceipt = await provider.getTransactionReceipt(entry.transactionHash);
      assert(txReceipt, `Missing rehearsal receipt: ${name}`);
      assert.equal(txReceipt.status, 1, `Rehearsal transaction reverted: ${name}`);
      assert.equal(txReceipt.gasUsed.toString(), entry.gasUsed, `Gas mismatch: ${name}`);
      rehearsalGas += txReceipt.gasUsed;
      rehearsalExecutionFee += txReceipt.gasUsed * txReceipt.gasPrice;
      lastRehearsalBlock = Math.max(lastRehearsalBlock, txReceipt.blockNumber);
    }
    const finalized = await provider.getBlock("finalized");
    assert(finalized, "Sepolia finalized block unavailable");
    const record = {
      schema: "pulse-core-public-network-release/v1", semanticsVersion: frozen.manifest.semanticsVersion,
      network: "Ethereum Sepolia", chainId: 11155111, address: verified.address,
      versionId: frozen.manifest.versionId, compiler: frozen.manifest.compiler,
      creationCodeHash: frozen.manifest.creationCodeHash,
      runtimeCodeHash: frozen.manifest.runtimeCodeHash,
      deployment: receipt,
      finality: { checkedAtUTC: new Date().toISOString(), finalizedBlock: finalized.number,
        coreFinalized: finalized.number >= receipt.blockNumber,
        referenceRehearsalFinalized: finalized.number >= lastRehearsalBlock },
      sourceSha256: frozen.manifest.sourceSha256,
      abiSha256: frozen.manifest.filesSha256["IPulseCore.abi.json"],
      vectorsSha256: frozen.manifest.filesSha256["vectors.json"],
      sourceRevision: previousRecord?.sourceRevision ?? null,
      explorerVerification: explorer?.status === "verified" ? { status: "verified", result: explorer.result }
        : { status: "not-published" },
      referenceRehearsal: {
        status: "verified", actor: rehearsal.result.actor,
        scheduledConsumer: rehearsal.result.scheduled,
        conditionalConsumer: rehearsal.result.conditional,
        testToken: rehearsal.result.token, allocationSlots: 1024,
        activationTime: rehearsal.result.activationTime,
        conditionalSaleTx: rehearsal.result.conditionalSaleTx,
        scheduledSaleTx: rehearsal.result.scheduledSaleTx,
        transactions: Object.keys(rehearsal.steps).length,
        totalGas: rehearsalGas.toString(),
        totalExecutionFeeWei: rehearsalExecutionFee.toString()
      }
    };
    writeFileSync(releasePath, JSON.stringify(record, null, 2) + "\n");
    console.log(`Sepolia release record: ${releasePath.pathname}`);
    console.log(JSON.stringify({ address: record.address, runtimeCodeHash: record.runtimeCodeHash,
      deploymentTx: record.deployment.transactionHash, explorerVerification: record.explorerVerification.status,
      referenceRehearsal: record.referenceRehearsal.status }, null, 2));
  } finally {
    provider.destroy();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
