import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { keccak256, toUtf8Bytes } from "ethers";
import { buildEvidence, sha256 } from "./lib/build-evidence.js";
import { coreReleaseSolidity } from "../config/core-build.js";

const root = new URL("../", import.meta.url);
const destination = new URL("releases/pulse-core-v1/", root);
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const read = (path) => readFileSync(new URL(path, root), "utf8");
const build = await buildEvidence("PulseCoreV1");
const { artifact } = build;
assert.equal(build.compiler, "0.8.24+commit.e11b9ed9");
for (const [key, expected] of Object.entries(coreReleaseSolidity.settings)) {
  assert.deepEqual(build.settings[key], expected, `Release setting differs: ${key}`);
}
for (const field of ["linkReferences", "deployedLinkReferences", "immutableReferences"]) {
  assert.deepEqual(artifact[field], {}, `Unexpected ${field}`);
}
const abiFixture = JSON.parse(read("test/fixtures/pulseCore.v1.abi.json"));
assert.deepEqual(artifact.abi, abiFixture.abi);
assert.equal(keccak256(toUtf8Bytes("pulse-core/1.0.0")), abiFixture.versionId);

const files = {
  "standard-input.json": json(build.standardInput),
  "IPulseCore.abi.json": json(artifact.abi),
  "IPulseCore.sol": read("src/interfaces/IPulseCore.sol"),
  "PulseCoreV1.creation.hex": artifact.bytecode + "\n",
  "PulseCoreV1.runtime.hex": artifact.deployedBytecode + "\n",
  "vectors.json": read("test/fixtures/pulseCore.v1.vectors.json")
};
const lock = JSON.parse(read("package-lock.json"));
const manifest = {
  schema: "pulse-core-reviewed-build/v1",
  semanticsVersion: "1.0.0",
  versionId: abiFixture.versionId,
  contract: "PulseCoreV1",
  compiler: build.compiler,
  settings: build.settings,
  sourceSha256: build.sourceHashes,
  packageLockSha256: sha256(read("package-lock.json")),
  hardhatVersion: lock.packages["node_modules/hardhat"].version,
  creationBytes: (artifact.bytecode.length - 2) / 2,
  runtimeBytes: (artifact.deployedBytecode.length - 2) / 2,
  creationCodeHash: keccak256(artifact.bytecode),
  runtimeCodeHash: keccak256(artifact.deployedBytecode),
  filesSha256: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, sha256(data)])),
  provenance: "Reviewed worktree contents are pinned by hashes; no release Git tag or public deployment is asserted.",
  deployment: null
};
files["manifest.json"] = json(manifest);

if (process.env.PULSE_WRITE_FREEZE === "1") {
  mkdirSync(destination, { recursive: true });
  for (const [name, data] of Object.entries(files)) writeFileSync(new URL(name, destination), data);
  console.log(`Wrote reviewed build: ${manifest.runtimeCodeHash}`);
} else {
  for (const [name, data] of Object.entries(files)) {
    assert.equal(readFileSync(new URL(name, destination), "utf8"), data,
      `Frozen release differs: ${name}. Review the change before replacing the freeze.`);
  }
  console.log(`Reviewed build verified: ${manifest.runtimeCodeHash}`);
}
