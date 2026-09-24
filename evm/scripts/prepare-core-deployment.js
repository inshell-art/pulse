import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { getAddress, JsonRpcProvider } from "ethers";
import { frozenCore } from "./lib/core-release.js";
import { selectedTarget } from "./lib/core-release-targets.js";

const json = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);

async function main() {
  const rpcUrl = process.env.PULSE_RPC_URL;
  const requestedChainId = process.env.PULSE_EXPECTED_CHAIN_ID;
  const requestedDeployer = process.env.PULSE_DEPLOYER_ADDRESS;
  assert(rpcUrl, "Set PULSE_RPC_URL for the selected target chain");
  assert(requestedChainId && /^[1-9][0-9]*$/.test(requestedChainId), "Set positive PULSE_EXPECTED_CHAIN_ID");
  assert(requestedDeployer, "Set PULSE_DEPLOYER_ADDRESS (public address only)");
  const provider = new JsonRpcProvider(rpcUrl);
  try {
    const chainId = (await provider.getNetwork()).chainId;
    assert.equal(chainId, BigInt(requestedChainId), "RPC chain differs from selected chain");
    const targetName = selectedTarget(chainId);
    const from = getAddress(requestedDeployer);
    const frozen = frozenCore();
    const tx = { from, data: frozen.creationCode, value: 0n, chainId };
    const gasLimit = await provider.estimateGas(tx);
    const [nonce, fee] = await Promise.all([provider.getTransactionCount(from, "pending"), provider.getFeeData()]);
    const feeFields = fee.maxFeePerGas != null && fee.maxPriorityFeePerGas != null
      ? { type: 2, maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas }
      : { type: 0, gasPrice: fee.gasPrice };
    assert(feeFields.type === 2 || feeFields.gasPrice != null, "RPC did not return usable fee data");
    const feeCeilingPerGas = feeFields.maxFeePerGas ?? feeFields.gasPrice;
    const balance = await provider.getBalance(from);
    const prepared = {
      schema: "pulse-core-unsigned-deployment/v1", status: "unsigned; not broadcast",
      target: { name: targetName, chainId: chainId.toString(), deployer: from, nonce },
      build: { versionId: frozen.manifest.versionId, compiler: frozen.manifest.compiler,
        creationCodeHash: frozen.manifest.creationCodeHash, runtimeCodeHash: frozen.manifest.runtimeCodeHash },
      transaction: { ...tx, nonce, gasLimit, ...feeFields },
      estimate: { gasLimit, executionFeeCeilingWei: gasLimit * feeCeilingPerGas,
        deployerBalanceWei: balance, coversExecutionFeeCeiling: balance >= gasLimit * feeCeilingPerGas,
        note: "RPC execution gas estimate only; L2 data fees and future fee changes are excluded." }
    };
    mkdirSync(new URL("../deployments/prepared/", import.meta.url), { recursive: true });
    const path = new URL(`../deployments/prepared/pulse-core-v1-${chainId}-${from.toLowerCase()}.json`, import.meta.url);
    writeFileSync(path, json(prepared) + "\n");
    console.log(json({ ...prepared, transaction: { ...prepared.transaction, data: `[frozen creation bytecode; ${frozen.manifest.creationBytes} bytes]` } }));
    console.log(`Full unsigned transaction: ${path.pathname}`);
  } finally {
    provider.destroy();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
