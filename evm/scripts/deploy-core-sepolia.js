import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { frozenCore, verifyCore, verifyDeploymentReceipt } from "./lib/core-release.js";
import { checkedSend, sepoliaContext } from "./lib/sepolia-release.js";

const journalPath = new URL("../deployments/sepolia/pulse-core-v1.json", import.meta.url);
const save = (value) => {
  mkdirSync(new URL("../deployments/sepolia/", import.meta.url), { recursive: true });
  writeFileSync(journalPath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
};

async function main() {
  const { provider, wallet, deployer } = await sepoliaContext();
  try {
    const frozen = frozenCore();
    let record = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : null;
    if (record) {
      assert.equal(record.deployer, deployer, "Existing journal uses a different signer");
      assert.equal(record.creationCodeHash, frozen.manifest.creationCodeHash, "Existing journal uses a different build");
    } else {
      const gasEstimate = await provider.estimateGas({ from: deployer, data: frozen.creationCode, value: 0n });
      const tx = await checkedSend(wallet, { data: frozen.creationCode, value: 0n }, gasEstimate + gasEstimate / 5n);
      record = { schema: "pulse-core-sepolia-deployment/v1", chainId: 11155111,
        deployer, creationCodeHash: frozen.manifest.creationCodeHash,
        runtimeCodeHash: frozen.manifest.runtimeCodeHash, transactionHash: tx.hash, status: "pending" };
      save(record);
    }
    const receipt = await provider.waitForTransaction(record.transactionHash, 1, 180_000);
    assert(receipt, "Deployment transaction is pending; rerun this script to resume");
    assert.equal(receipt.status, 1, "Deployment transaction reverted");
    assert(receipt.contractAddress, "Deployment receipt has no contract address");
    const core = await verifyCore(provider, receipt.contractAddress, 11155111n, frozen);
    const deployment = await verifyDeploymentReceipt(provider, core.address, record.transactionHash, frozen);
    record = { ...record, status: "verified", address: core.address, versionId: core.versionId, deployment };
    save(record);
    console.log(JSON.stringify(record, null, 2));
  } finally {
    provider.destroy();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
