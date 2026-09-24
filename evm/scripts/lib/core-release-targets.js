import assert from "node:assert/strict";

export const releaseTargets = Object.freeze({
  1: "ethereum-mainnet",
  11155111: "ethereum-sepolia",
  31337: "anvil-local"
});

export function selectedTarget(chainId) {
  const name = releaseTargets[BigInt(chainId).toString()];
  assert(name, `Unsupported Pulse Core V1 release chain: ${chainId}`);
  return name;
}
