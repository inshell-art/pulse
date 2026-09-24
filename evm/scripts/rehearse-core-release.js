import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import hre from "hardhat";
import * as model from "../test/helpers/pulseCoreSpecModel.js";
import { frozenCore, verifyCore, verifyDeploymentReceipt } from "./lib/core-release.js";

const config = { k: 600n, genesisPrice: 1000n, genesisFloor: 900n, pts: 1n };
const json = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
const state = (s) => ({ epochIndex: s.epochIndex, openTime: s.openTime,
  curveStartTime: s.curveStartTime, anchorTime: s.anchorTime, floorPrice: s.floorPrice });
const key = (ethers, label) => ethers.id(`pulse-release/${label}`);
const events = (contract, receipt, name) => receipt.logs
  .filter((log) => log.address.toLowerCase() === contract.target.toLowerCase())
  .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
  .filter((log) => log?.name === name).map((log) => log.args);

async function main() {
  const conn = await hre.network.connect();
  try {
    assert(["edr-simulated", "http"].includes(conn.networkConfig.type), "Release rehearsal must be local");
    const { ethers, provider } = conn;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    assert.equal(chainId, 31337n, "Unexpected local chain");
    if (conn.networkConfig.type === "http") {
      const clientVersion = await provider.send("web3_clientVersion");
      assert.match(clientVersion, /anvil/i, "HTTP rehearsal requires Anvil");
    }
    const [deployer, scheduledBuyer, conditionalBuyer, scheduledTreasury, conditionalTreasury] = await ethers.getSigners();
    const frozen = frozenCore();
    const factory = new ethers.ContractFactory(frozen.abi, frozen.creationCode, deployer);
    const core = await factory.deploy();
    const deploymentTx = core.deploymentTransaction();
    await core.waitForDeployment();
    const coreAddress = await core.getAddress();
    const verifiedCore = await verifyCore(ethers.provider, coreAddress, chainId, frozen);
    const deployment = await verifyDeploymentReceipt(ethers.provider, coreAddress, deploymentTx.hash);
    await assert.rejects(verifyCore(ethers.provider, coreAddress, chainId + 1n, frozen), /Wrong chain/);
    await assert.rejects(verifyCore(ethers.provider, deployer.address, chainId, frozen), /no code/);

    const binding = { core: coreAddress, runtimeCodeHash: frozen.manifest.runtimeCodeHash, chainId };
    const Harness = await ethers.getContractFactory("PulseConsumerHarness");
    const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    const scheduledOpen = now + 10_000n;
    const scheduled = await Harness.deploy(binding, config, {
      paymentToken: ethers.ZeroAddress, treasury: scheduledTreasury.address, owner: deployer.address,
      scheduledOpenTime: scheduledOpen, allocationSlots: 0n, initialPrice: 0n, maxSupply: 100_000n
    });
    await scheduled.waitForDeployment();
    const token = await ethers.deployContract("PulseConsumerTestToken");
    await token.waitForDeployment();
    const conditional = await Harness.deploy(binding, config, {
      paymentToken: await token.getAddress(), treasury: conditionalTreasury.address, owner: deployer.address,
      scheduledOpenTime: 0n, allocationSlots: 1024n, initialPrice: 0n, maxSupply: 100_000n
    });
    await conditional.waitForDeployment();
    assert.equal(await scheduled.pulseCore(), coreAddress);
    assert.equal(await conditional.pulseCore(), coreAddress);
    assert.equal(await scheduled.getCurrentPrice(), model.quote(config, model.initialize(config, scheduledOpen), scheduledOpen));
    assert.equal(await conditional.initialized(), false);

    const actor = await ethers.deployContract("PulseConsumerActor");
    await actor.waitForDeployment();
    const keys = Array.from({ length: 1024 }, (_, i) => key(ethers, `initial-${i}`));
    for (let i = 0; i < keys.length; i += 128) {
      await (await conditional.allowInitial(keys.slice(i, i + 128), await actor.getAddress())).wait();
    }
    const conditionalAddress = await conditional.getAddress();
    for (let i = 0; i < 1023; i += 64) {
      const batch = keys.slice(i, Math.min(i + 64, 1023));
      const receipt = await (await actor.batch(
        batch.map(() => conditionalAddress),
        batch.map((slot) => conditional.interface.encodeFunctionData("fulfillInitial", [slot])),
        batch.map(() => 0n), { gasLimit: 12_000_000 }
      )).wait();
      const attempts = events(actor, receipt, "Attempt");
      assert.equal(attempts.every((a) => a.success), true,
        `Initial batch ${i} failed: ${attempts.filter((a) => !a.success).map((a) => a.result).join(",")}`);
      assert.equal(events(conditional, receipt, "Sale").length, 0);
    }
    assert.equal(await conditional.initialFulfilled(), 1023n);
    assert.equal(await conditional.initialized(), false);
    const activationReceipt = await (await actor.batch(
      [conditionalAddress], [conditional.interface.encodeFunctionData("fulfillInitial", [keys[1023]])], [0n],
      { gasLimit: 2_000_000 }
    )).wait();
    const [activationAttempt] = events(actor, activationReceipt, "Attempt");
    assert.equal(activationAttempt.success, true, `Activation failed: ${activationAttempt.result}`);
    assert.equal(events(conditional, activationReceipt, "Sale").length, 0);
    const activationTime = BigInt((await ethers.provider.getBlock(activationReceipt.blockNumber)).timestamp);
    assert.equal(events(conditional, activationReceipt, "LaunchConfigured")[0].openTime, activationTime);
    assert.equal(await conditional.initialFulfilled(), 1024n);
    assert.equal(await conditional.initialized(), true);
    assert.deepEqual(state(await conditional.getPulseState()), model.initialize(config, activationTime));

    await (await token.mint(conditionalBuyer.address, 10_000n)).wait();
    await (await token.connect(conditionalBuyer).approve(conditionalAddress, 10_000n)).wait();
    const conditionalState = state(await conditional.getPulseState());
    const conditionalBuyTime = BigInt((await ethers.provider.getBlock("latest")).timestamp) + 1n;
    const expectedConditional = model.advance(config, conditionalState, conditionalBuyTime);
    const conditionalTreasuryBefore = await token.balanceOf(conditionalTreasury.address);
    await provider.send("evm_setNextBlockTimestamp", [Number(conditionalBuyTime)]);
    const conditionalReceipt = await (await conditional.connect(conditionalBuyer).buy(
      expectedConditional.ask, key(ethers, "conditional-sale")
    )).wait();
    assert.equal(events(conditional, conditionalReceipt, "Sale")[0].price, expectedConditional.ask);
    assert.deepEqual(state(await conditional.getPulseState()), expectedConditional.nextState);
    assert.equal(await token.balanceOf(conditionalTreasury.address) - conditionalTreasuryBefore, expectedConditional.ask);
    assert.equal(await conditional.ownerOf(1025n), conditionalBuyer.address);

    assert.deepEqual(state(await scheduled.getPulseState()), model.initialize(config, scheduledOpen));
    const expectedScheduled = model.advance(config, state(await scheduled.getPulseState()), scheduledOpen);
    const scheduledTreasuryBefore = await ethers.provider.getBalance(scheduledTreasury.address);
    await provider.send("evm_setNextBlockTimestamp", [Number(scheduledOpen)]);
    const scheduledReceipt = await (await scheduled.connect(scheduledBuyer).buy(
      expectedScheduled.ask, key(ethers, "scheduled-sale"), { value: expectedScheduled.ask }
    )).wait();
    assert.equal(events(scheduled, scheduledReceipt, "Sale")[0].price, expectedScheduled.ask);
    assert.deepEqual(state(await scheduled.getPulseState()), expectedScheduled.nextState);
    assert.equal(await ethers.provider.getBalance(scheduledTreasury.address) - scheduledTreasuryBefore, expectedScheduled.ask);
    assert.equal(await scheduled.ownerOf(1n), scheduledBuyer.address);
    assert.equal(await ethers.provider.getBalance(coreAddress), 0n);

    const report = {
      schema: "pulse-core-local-release-rehearsal/v1", localOnly: true,
      backend: conn.networkConfig.type === "http" ? "anvil" : "hardhat-edr",
      build: { versionId: frozen.manifest.versionId, compiler: frozen.manifest.compiler,
        creationCodeHash: frozen.manifest.creationCodeHash, runtimeCodeHash: frozen.manifest.runtimeCodeHash },
      core: { ...verifiedCore, deployment },
      consumers: {
        scheduled: { address: await scheduled.getAddress(), payment: "ETH", openTime: scheduledOpen,
          saleTx: scheduledReceipt.hash, ask: expectedScheduled.ask, epoch: (await scheduled.getPulseState()).epochIndex },
        conditional: { address: conditionalAddress, payment: "ERC20", allocationSlots: 1024,
          activationTx: activationReceipt.hash, activationTime, saleTx: conditionalReceipt.hash,
          ask: expectedConditional.ask, epoch: (await conditional.getPulseState()).epochIndex }
      },
      assertions: ["frozen runtime/receipt/version", "wrong-chain and EOA rejection", "two consumers share core",
        "1024th fulfillment activates", "activation has no sale", "scheduled and conditional sales match model",
        "ETH and ERC20 treasury settlement", "independent application state", "core holds no ETH"]
    };
    mkdirSync(new URL("../deployments/reports/", import.meta.url), { recursive: true });
    writeFileSync(new URL(`../deployments/reports/pulse-core-v1-${report.backend}.json`, import.meta.url), json(report) + "\n");
    console.log(json(report));
  } finally {
    await conn.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
