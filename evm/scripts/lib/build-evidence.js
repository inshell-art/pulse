import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import hre from "hardhat";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const evmRoot = new URL("../../", import.meta.url);

// Follow the deployed artifact's build ID, never a directory's first old build.
export async function buildEvidence(name) {
  const artifact = await hre.artifacts.readArtifact(name);
  const inputPath = await hre.artifacts.getBuildInfoPath(artifact.buildInfoId);
  const outputPath = await hre.artifacts.getBuildInfoOutputPath(artifact.buildInfoId);
  assert(inputPath && outputPath, `Missing build evidence for ${name}`);
  const build = JSON.parse(readFileSync(inputPath, "utf8"));
  const output = JSON.parse(readFileSync(outputPath, "utf8")).output
    .contracts[artifact.inputSourceName][artifact.contractName];
  assert.equal(artifact.bytecode, `0x${output.evm.bytecode.object}`);
  assert.equal(artifact.deployedBytecode, `0x${output.evm.deployedBytecode.object}`);
  assert.deepEqual(artifact.abi, output.abi);
  const metadata = JSON.parse(output.metadata);
  const sources = {};
  const sourceHashes = {};
  for (const inputName of Object.keys(metadata.sources).sort()) {
    const relative = Object.keys(build.userSourceNameMap).find((key) => build.userSourceNameMap[key] === inputName)
      ?? (inputName.startsWith("project/") ? inputName.slice("project/".length) : undefined);
    assert(relative, `No source mapping for ${inputName}`);
    const content = readFileSync(new URL(relative, evmRoot), "utf8");
    assert.equal(content, build.input.sources[inputName].content, `Stale compiled source: ${relative}`);
    sources[inputName] = { content };
    sourceHashes[relative] = sha256(content);
  }
  return {
    artifact,
    compiler: build.solcLongVersion,
    settings: build.input.settings,
    sourceHashes,
    standardInput: { language: "Solidity", sources, settings: build.input.settings }
  };
}
