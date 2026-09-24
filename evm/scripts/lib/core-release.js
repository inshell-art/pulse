import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Contract, getAddress, keccak256 } from "ethers";

const bundle = new URL("../../releases/pulse-core-v1/", import.meta.url);
const read = (name) => readFileSync(new URL(name, bundle), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function frozenCore() {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.schema, "pulse-core-reviewed-build/v1");
  for (const [name, digest] of Object.entries(manifest.filesSha256)) {
    assert.equal(sha256(read(name)), digest, `Frozen file differs: ${name}`);
  }
  const abi = JSON.parse(read("IPulseCore.abi.json"));
  const creationCode = read("PulseCoreV1.creation.hex").trim();
  const runtimeCode = read("PulseCoreV1.runtime.hex").trim();
  assert.equal(keccak256(creationCode), manifest.creationCodeHash);
  assert.equal(keccak256(runtimeCode), manifest.runtimeCodeHash);
  assert.equal((creationCode.length - 2) / 2, manifest.creationBytes);
  assert.equal((runtimeCode.length - 2) / 2, manifest.runtimeBytes);
  return { manifest, abi, creationCode, runtimeCode };
}

export async function verifyCore(provider, address, expectedChainId, frozen = frozenCore()) {
  const actualChainId = (await provider.getNetwork()).chainId;
  assert.equal(actualChainId, BigInt(expectedChainId), "Wrong chain for Pulse core release");
  const normalizedAddress = getAddress(address);
  const code = await provider.getCode(normalizedAddress);
  assert.notEqual(code, "0x", "Core address has no code");
  const runtimeCodeHash = keccak256(code);
  assert.equal(runtimeCodeHash, frozen.manifest.runtimeCodeHash, "Core runtime hash differs from reviewed build");
  assert.equal(code.toLowerCase(), frozen.runtimeCode.toLowerCase(), "Core runtime bytes differ");
  const core = new Contract(normalizedAddress, frozen.abi, provider);
  assert.equal(await core.version(), frozen.manifest.versionId, "Core version differs");
  return { address: normalizedAddress, chainId: actualChainId.toString(), runtimeCodeHash, versionId: frozen.manifest.versionId };
}

export async function verifyDeploymentReceipt(provider, address, transactionHash, frozen = frozenCore()) {
  const receipt = await provider.getTransactionReceipt(transactionHash);
  assert(receipt, "Deployment transaction has no receipt");
  assert.equal(receipt.status, 1, "Deployment transaction reverted");
  assert.equal(receipt.contractAddress && getAddress(receipt.contractAddress), getAddress(address),
    "Deployment receipt address differs");
  const transaction = await provider.getTransaction(transactionHash);
  assert(transaction, "Deployment transaction is unavailable");
  assert.equal(transaction.to, null, "Deployment transaction must create the core directly");
  assert.equal(transaction.data.toLowerCase(), frozen.creationCode.toLowerCase(),
    "Deployment creation bytecode differs from reviewed build");
  const block = await provider.getBlock(receipt.blockNumber);
  assert(block, "Deployment block is unavailable");
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: block.hash,
    deployer: receipt.from,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.gasPrice?.toString() ?? null
  };
}
