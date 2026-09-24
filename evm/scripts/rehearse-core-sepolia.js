import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Contract, ContractFactory, id, keccak256 } from "ethers";
import hre from "hardhat";
import * as model from "../test/helpers/pulseCoreSpecModel.js";
import { frozenCore, verifyCore } from "./lib/core-release.js";
import { checkedSend, sepoliaContext } from "./lib/sepolia-release.js";

const config = { k: 600n, genesisPrice: 1000n, genesisFloor: 900n, pts: 1n };
const deploymentPath = new URL("../deployments/sepolia/pulse-core-v1.json", import.meta.url);
const progressPath = new URL("../deployments/sepolia/pulse-core-v1-rehearsal.json", import.meta.url);
const key = (index) => id(`pulse-sepolia-release/initial-${index}`);
const state = (s) => ({ epochIndex: s.epochIndex, openTime: s.openTime,
  curveStartTime: s.curveStartTime, anchorTime: s.anchorTime, floorPrice: s.floorPrice });
const json = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
const events = (contract, receipt, name) => receipt.logs
  .filter((log) => log.address.toLowerCase() === contract.target.toLowerCase())
  .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
  .filter((log) => log?.name === name).map((log) => log.args);

async function main() {
  const { provider, wallet, deployer } = await sepoliaContext();
  try {
    const frozen = frozenCore();
    assert(existsSync(deploymentPath), "Deploy and verify the Sepolia core first");
    const coreRecord = JSON.parse(readFileSync(deploymentPath, "utf8"));
    assert.equal(coreRecord.status, "verified", "Core deployment journal is not verified");
    const verifiedCore = await verifyCore(provider, coreRecord.address, 11155111n, frozen);
    const core = new Contract(verifiedCore.address, frozen.abi, provider);
    const artifacts = {};
    for (const name of ["PulseConsumerActor", "PulseConsumerHarness", "PulseConsumerTestToken"]) {
      artifacts[name] = await hre.artifacts.readArtifact(name);
    }
    let progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, "utf8")) : {
      schema: "pulse-core-sepolia-rehearsal/v1", chainId: 11155111,
      deployer, core: verifiedCore.address, runtimeCodeHash: frozen.manifest.runtimeCodeHash,
      artifactCreationHashes: Object.fromEntries(Object.entries(artifacts).map(([n, a]) => [n, keccak256(a.bytecode)])),
      steps: {}
    };
    assert.equal(progress.deployer, deployer);
    assert.equal(progress.core, verifiedCore.address);
    for (const [name, artifact] of Object.entries(artifacts)) {
      assert.equal(progress.artifactCreationHashes[name], keccak256(artifact.bytecode), `${name} artifact changed`);
    }
    if (progress.status === "verified") {
      console.log(json({ status: progress.status, chainId: progress.chainId, core: progress.core,
        result: progress.result, transactions: Object.keys(progress.steps).length }));
      return;
    }
    const save = () => {
      mkdirSync(new URL("../deployments/sepolia/", import.meta.url), { recursive: true });
      writeFileSync(progressPath, json(progress) + "\n", { mode: 0o600 });
    };
    save();
    async function step(name, request, fixedGasLimit) {
      let entry = progress.steps[name];
      if (!entry) {
        const estimate = fixedGasLimit ?? await provider.estimateGas({ ...request, from: deployer });
        const gasLimit = fixedGasLimit ?? estimate + estimate / 5n;
        const tx = await checkedSend(wallet, request, gasLimit);
        entry = { transactionHash: tx.hash, status: "pending" };
        progress.steps[name] = entry;
        save();
        console.log(`${name}: sent ${tx.hash}`);
      }
      const receipt = await provider.waitForTransaction(entry.transactionHash, 1, 180_000);
      assert(receipt, `${name} is pending; rerun to resume`);
      assert.equal(receipt.status, 1, `${name} reverted`);
      if (entry.status !== "mined") {
        entry.status = "mined";
        entry.blockNumber = receipt.blockNumber;
        entry.gasUsed = receipt.gasUsed.toString();
        if (receipt.contractAddress) entry.address = receipt.contractAddress;
        save();
      }
      return receipt;
    }
    async function deploy(name, args = []) {
      const artifact = artifacts[name];
      const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
      const request = await factory.getDeployTransaction(...args);
      const receipt = await step(`deploy-${name}${name === "PulseConsumerHarness" ? `-${args[2].allocationSlots === 0n ? "scheduled" : "conditional"}` : ""}`, request);
      assert(receipt.contractAddress, `${name} receipt lacks address`);
      const code = await provider.getCode(receipt.contractAddress);
      assert.notEqual(code, "0x", `${name} has no deployed code`);
      return new Contract(receipt.contractAddress, artifact.abi, wallet);
    }
    const actor = await deploy("PulseConsumerActor");
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    if (!progress.scheduledOpenTime) { progress.scheduledOpenTime = (now + 120n).toString(); save(); }
    const binding = { core: verifiedCore.address, runtimeCodeHash: frozen.manifest.runtimeCodeHash, chainId: 11155111n };
    const scheduled = await deploy("PulseConsumerHarness", [binding, config, {
      paymentToken: "0x0000000000000000000000000000000000000000", treasury: actor.target,
      owner: deployer, scheduledOpenTime: BigInt(progress.scheduledOpenTime), allocationSlots: 0n,
      initialPrice: 0n, maxSupply: 100_000n
    }]);
    const token = await deploy("PulseConsumerTestToken");
    const conditional = await deploy("PulseConsumerHarness", [binding, config, {
      paymentToken: token.target, treasury: actor.target, owner: deployer,
      scheduledOpenTime: 0n, allocationSlots: 1024n, initialPrice: 0n, maxSupply: 100_000n
    }]);
    assert.equal(await scheduled.pulseCore(), verifiedCore.address);
    assert.equal(await conditional.pulseCore(), verifiedCore.address);
    assert.deepEqual(state(await scheduled.getPulseState()), model.initialize(config, BigInt(progress.scheduledOpenTime)));
    assert.equal(await conditional.allocationSlots(), 1024n);
    for (let i = 0; i < 1024; i += 128) {
      const keys = Array.from({ length: Math.min(128, 1024 - i) }, (_, n) => key(i + n));
      await step(`register-${i}`, { to: conditional.target,
        data: conditional.interface.encodeFunctionData("allowInitial", [keys, actor.target]) });
    }
    assert.equal(await conditional.registeredSlots(), 1024n);
    for (let i = 0; i < 1023; i += 64) {
      const count = Math.min(64, 1023 - i);
      const receipt = await step(`fulfill-${i}`, { to: actor.target,
        data: actor.interface.encodeFunctionData("batch", [
          Array(count).fill(conditional.target),
          Array.from({ length: count }, (_, n) => conditional.interface.encodeFunctionData("fulfillInitial", [key(i + n)])),
          Array(count).fill(0n)
        ]) }, 12_000_000n);
      const attempts = events(actor, receipt, "Attempt");
      assert.equal(attempts.length, count);
      assert.equal(attempts.every((a) => a.success), true, `Initial batch ${i} failed`);
      assert.equal(events(conditional, receipt, "Sale").length, 0);
      console.log(`initial slots: ${Math.min(i + count, 1023)}/1024`);
    }
    if (!progress.steps["activate-1024"]) {
      assert.equal(await conditional.initialFulfilled(), 1023n);
      assert.equal(await conditional.initialized(), false);
    }
    const activationReceipt = await step("activate-1024", { to: actor.target,
      data: actor.interface.encodeFunctionData("batch", [[conditional.target],
        [conditional.interface.encodeFunctionData("fulfillInitial", [key(1023)])], [0n]]) }, 500_000n);
    assert.equal(events(actor, activationReceipt, "Attempt")[0].success, true);
    assert.equal(events(conditional, activationReceipt, "Sale").length, 0);
    const activationTime = BigInt((await provider.getBlock(activationReceipt.blockNumber)).timestamp);
    assert.equal(events(conditional, activationReceipt, "LaunchConfigured")[0].openTime, activationTime);
    if (!progress.steps["conditional-sale"]) {
      assert.deepEqual(state(await conditional.getPulseState()), model.initialize(config, activationTime));
    }
    assert.equal(await conditional.initialFulfilled(), 1024n);

    await step("mint-test-token", { to: token.target,
      data: token.interface.encodeFunctionData("mint", [deployer, 10_000n]) });
    await step("approve-test-token", { to: token.target,
      data: token.interface.encodeFunctionData("approve", [conditional.target, 10_000n]) });
    const conditionalPreviouslySent = !!progress.steps["conditional-sale"];
    const conditionalBefore = await token.balanceOf(actor.target);
    const conditionalState = conditionalPreviouslySent
      ? model.initialize(config, activationTime) : state(await conditional.getPulseState());
    const conditionalReceipt = await step("conditional-sale", { to: conditional.target,
      data: conditional.interface.encodeFunctionData("buy", [1100n, id("pulse-sepolia-release/conditional-sale")]) });
    const conditionalTimestamp = BigInt((await provider.getBlock(conditionalReceipt.blockNumber)).timestamp);
    const conditionalExpected = model.advance(config, conditionalState, conditionalTimestamp);
    assert.equal(events(conditional, conditionalReceipt, "Sale")[0].price, conditionalExpected.ask);
    assert.deepEqual(state(await conditional.getPulseState()), conditionalExpected.nextState);
    if (!conditionalPreviouslySent) {
      assert.equal(await token.balanceOf(actor.target) - conditionalBefore, conditionalExpected.ask);
    }

    const scheduledPreviouslySent = !!progress.steps["scheduled-sale"];
    const scheduledBefore = await provider.getBalance(actor.target);
    const scheduledState = scheduledPreviouslySent
      ? model.initialize(config, BigInt(progress.scheduledOpenTime)) : state(await scheduled.getPulseState());
    const scheduledReceipt = await step("scheduled-sale", { to: scheduled.target,
      data: scheduled.interface.encodeFunctionData("buy", [1100n, id("pulse-sepolia-release/scheduled-sale")]),
      value: 1100n });
    const scheduledTimestamp = BigInt((await provider.getBlock(scheduledReceipt.blockNumber)).timestamp);
    const scheduledExpected = model.advance(config, scheduledState, scheduledTimestamp);
    assert.equal(events(scheduled, scheduledReceipt, "Sale")[0].price, scheduledExpected.ask);
    assert.deepEqual(state(await scheduled.getPulseState()), scheduledExpected.nextState);
    if (!scheduledPreviouslySent) {
      assert.equal(await provider.getBalance(actor.target) - scheduledBefore, scheduledExpected.ask);
    }
    assert.equal(await provider.getBalance(verifiedCore.address), 0n);

    progress.status = "verified";
    progress.result = { actor: actor.target, scheduled: scheduled.target, conditional: conditional.target,
      token: token.target, activationTime, conditionalAsk: conditionalExpected.ask,
      scheduledAsk: scheduledExpected.ask, conditionalSaleTx: conditionalReceipt.hash,
      scheduledSaleTx: scheduledReceipt.hash, coreRuntimeCodeHash: verifiedCore.runtimeCodeHash };
    save();
    console.log(json({ status: progress.status, chainId: progress.chainId, core: progress.core,
      result: progress.result, transactions: Object.keys(progress.steps).length,
      totalGas: Object.values(progress.steps).reduce((sum, entry) => sum + BigInt(entry.gasUsed), 0n) }));
  } finally {
    provider.destroy();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
