import assert from "node:assert/strict";
import { checkControls } from "./generate-embedded-control.js";
import { buildEvidence } from "./lib/build-evidence.js";
import hre from "hardhat";

checkControls();

const CONFIG = { k: 600n, genesisPrice: 1000n, genesisFloor: 900n, pts: 1n };
const key = (ethers, label) => ethers.id(`pulse-cost/${label}`);
const gas = async (tx) => {
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`Transaction reverted: ${receipt.hash}`);
  return receipt.gasUsed;
};
const state = (s) => [s.epochIndex, s.openTime, s.curveStartTime, s.anchorTime, s.floorPrice];
const stateValue = (s) => ({
  epochIndex: s.epochIndex, openTime: s.openTime, curveStartTime: s.curveStartTime,
  anchorTime: s.anchorTime, floorPrice: s.floorPrice
});
const decimal = (value) => typeof value === "bigint" ? value.toString() : value;

function matchingState(a, b, label) {
  if (JSON.stringify(state(a), (_, v) => decimal(v)) !== JSON.stringify(state(b), (_, v) => decimal(v))) {
    throw new Error(`${label}: embedded and shared states differ`);
  }
}

async function buildSettings() {
  const names = ["PulseCoreV1", "PulseConsumerHarness", "PulseEmbeddedConsumerBenchmark", "PulseCostQuoteProbe", "PulseConsumerTestToken"];
  const builds = await Promise.all(names.map(buildEvidence));
  const first = builds[0];
  for (const build of builds) {
    assert.equal(build.compiler, first.compiler);
    assert.deepEqual(build.settings, first.settings, "Mismatched comparison build settings");
  }
  return {
    compiler: first.compiler,
    evmVersion: first.settings.evmVersion,
    optimizer: first.settings.optimizer ?? { enabled: false },
    viaIR: first.settings.viaIR ?? false,
    sourceHashes: Object.assign({}, ...builds.map((b) => b.sourceHashes))
  };
}

async function sameBlock(conn, timestamp, tasks, allowDifferentCalldata = false) {
  await conn.provider.send("evm_setAutomine", [false]);
  try {
    await conn.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
    const txs = [];
    const reverse = process.env.BENCH_SHARED_FIRST === "1";
    for (const task of reverse ? [...tasks].reverse() : tasks) txs.push(await task());
    const calldataGas = (data) => data.slice(2).match(/../g).reduce((sum, b) => sum + (b === "00" ? 4 : 16), 0);
    if (!allowDifferentCalldata) {
      assert.equal(calldataGas(txs[0].data), calldataGas(txs[1].data), "Paired calls have different calldata gas");
    }
    await conn.provider.send("evm_mine");
    const receipts = await Promise.all(txs.map(gas));
    return reverse ? receipts.reverse() : receipts;
  } finally {
    await conn.provider.send("evm_setAutomine", [true]);
  }
}

async function main() {
  const conn = await hre.network.connect();
  try {
    assert.equal(conn.networkConfig.type, "edr-simulated", "Benchmark is local-only");
    assert.equal(conn.networkConfig.hardfork, "shanghai", "Use a benchmark config to pin execution rules");
    const build = await buildSettings();
    const { ethers } = conn;
    const [owner, embeddedBuyer, sharedBuyer, treasury] = await ethers.getSigners();
    const latest = async () => BigInt((await ethers.provider.getBlock("latest")).timestamp);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const allocationSlots = BigInt(process.env.BENCH_ALLOCATION_SLOTS ?? "1");
    if (allocationSlots < 1n || allocationSlots > 1024n) {
      throw new Error("BENCH_ALLOCATION_SLOTS must be an integer from 1 through 1024");
    }
    const core = await ethers.deployContract("PulseCoreV1");
    const coreDeployGas = gas(core.deploymentTransaction());
    await core.waitForDeployment();
    const coreAddress = await core.getAddress();
    const coreCode = await ethers.provider.getCode(coreAddress);
    const coreHash = ethers.keccak256(coreCode);
    const binding = { core: coreAddress, runtimeCodeHash: coreHash, chainId };
    // Separate identical token ledgers prevent the A payment from changing B's
    // zero/nonzero treasury storage cost. Both start with the same balances.
    const tokens = [await ethers.deployContract("PulseConsumerTestToken"), await ethers.deployContract("PulseConsumerTestToken")];
    await Promise.all(tokens.map((t) => t.waitForDeployment()));
    const quoteProbe = await ethers.deployContract("PulseCostQuoteProbe");
    await quoteProbe.waitForDeployment();
    const Embedded = await ethers.getContractFactory("PulseEmbeddedConsumerBenchmark");
    const Shared = await ethers.getContractFactory("PulseConsumerHarness");

    async function deployPair(profile, paymentTokens, openTime, slots) {
      const app = {
        paymentToken: paymentTokens[0],
        treasury: treasury.address,
        owner: owner.address,
        scheduledOpenTime: openTime,
        allocationSlots: slots,
        initialPrice: 17n,
        maxSupply: 100_000n
      };
      const embedded = await Embedded.deploy(CONFIG, app);
      const embeddedDeployGas = await gas(embedded.deploymentTransaction());
      const shared = await Shared.deploy(binding, CONFIG, { ...app, paymentToken: paymentTokens[1] });
      const sharedDeployGas = await gas(shared.deploymentTransaction());
      await Promise.all([embedded.waitForDeployment(), shared.waitForDeployment()]);
      matchingState(await embedded.getPulseState(), await shared.getPulseState(), `${profile} deployment`);
      return {
        embedded, shared,
        deployment: { embedded: embeddedDeployGas, shared: sharedDeployGas },
        runtimeBytes: {
          embedded: (await ethers.provider.getCode(await embedded.getAddress())).length / 2 - 1,
          shared: (await ethers.provider.getCode(await shared.getAddress())).length / 2 - 1
        }
      };
    }

    async function quotes(pair, label) {
      const embeddedAddress = await pair.embedded.getAddress();
      const sharedAddress = await pair.shared.getAddress();
      const probeAddress = await quoteProbe.getAddress();
      const send = (signer, address) => signer.sendTransaction({
        to: probeAddress,
        data: quoteProbe.interface.encodeFunctionData("measure", [address]),
        gasLimit: 300_000
      });
      const [embeddedTx, sharedTx] = await sameBlock(conn, await latest() + 1n, [
        () => send(embeddedBuyer, embeddedAddress),
        () => send(sharedBuyer, sharedAddress)
      ], true);
      const block = await ethers.provider.getBlockNumber();
      const logs = await quoteProbe.queryFilter(quoteProbe.filters.QuoteMeasured(), block, block);
      assert.equal(logs.length, 2);
      const measurement = (address, transactionGas) => {
        const { args } = logs.find((log) => log.args.consumer === address);
        assert.equal(args.firstAsk, args.secondAsk);
        return { transactionGas, ask: args.firstAsk, firstCallGas: args.firstGas, secondCallGas: args.secondGas };
      };
      if (await pair.embedded.getCurrentPrice() !== await pair.shared.getCurrentPrice()) {
        throw new Error(`${label}: quotes differ`);
      }
      return {
        embedded: measurement(embeddedAddress, embeddedTx),
        shared: measurement(sharedAddress, sharedTx)
      };
    }

    async function purchase(pair, label, timestamp, tokenPayment) {
      const initial = await pair.shared.getPulseState();
      matchingState(await pair.embedded.getPulseState(), initial, `${label} before purchase`);
      const ask = await core.quote(CONFIG, stateValue(initial), timestamp);
      const value = tokenPayment ? 0n : ask;
      const treasuryBefore = tokenPayment
        ? await Promise.all(tokens.map((t) => t.balanceOf(treasury.address))) : [await ethers.provider.getBalance(treasury.address)];
      const [embeddedGas, sharedGas] = await sameBlock(conn, timestamp, [
        () => pair.embedded.connect(embeddedBuyer).buy(ask, key(ethers, label), { value, gasLimit: 2_000_000 }),
        () => pair.shared.connect(sharedBuyer).buy(ask, key(ethers, label), { value, gasLimit: 2_000_000 })
      ]);
      matchingState(await pair.embedded.getPulseState(), await pair.shared.getPulseState(), `${label} after purchase`);
      if (await pair.embedded.totalIssued() !== await pair.shared.totalIssued()) {
        throw new Error(`${label}: issuance differs`);
      }
      if (tokenPayment) {
        for (let i = 0; i < tokens.length; i++) {
          assert.equal(await tokens[i].balanceOf(treasury.address) - treasuryBefore[i], ask, `${label}: settlement differs`);
        }
      } else {
        assert.equal(await ethers.provider.getBalance(treasury.address) - treasuryBefore[0], 2n * ask);
      }
      const tokenId = await pair.embedded.totalIssued();
      if (await pair.embedded.ownerOf(tokenId) !== embeddedBuyer.address
          || await pair.shared.ownerOf(tokenId) !== sharedBuyer.address) {
        throw new Error(`${label}: delivery differs`);
      }
      return { ask, embedded: embeddedGas, shared: sharedGas };
    }

    const scheduledOpen = await latest() + allocationSlots * 3n + 1000n;
    const scheduled = await deployPair("scheduled", [ethers.ZeroAddress, ethers.ZeroAddress], scheduledOpen, 0n);
    const conditional = await deployPair("conditional", await Promise.all(tokens.map((t) => t.getAddress())), 0n, allocationSlots);
    const embeddedKeys = Array.from({ length: Number(allocationSlots) }, (_, i) => key(ethers, `activation/${i}`));
    const sharedKeys = embeddedKeys;
    let allowEmbedded = 0n;
    let allowShared = 0n;
    for (let offset = 0; offset < embeddedKeys.length; offset += 128) {
      allowEmbedded += await gas(await conditional.embedded.allowInitial(
        embeddedKeys.slice(offset, offset + 128), embeddedBuyer.address));
      allowShared += await gas(await conditional.shared.allowInitial(
        sharedKeys.slice(offset, offset + 128), sharedBuyer.address));
    }
    await gas(await tokens[0].mint(embeddedBuyer.address, 1_000_000n));
    await gas(await tokens[1].mint(sharedBuyer.address, 1_000_000n));
    await gas(await tokens[0].connect(embeddedBuyer).approve(await conditional.embedded.getAddress(), 1_000_000n));
    await gas(await tokens[1].connect(sharedBuyer).approve(await conditional.shared.getAddress(), 1_000_000n));

    let preFinalEmbedded = 0n;
    let preFinalShared = 0n;
    for (let i = 0; i < embeddedKeys.length - 1; i++) {
      const [a, b] = await sameBlock(conn, await latest() + 1n, [
        () => conditional.embedded.connect(embeddedBuyer).fulfillInitial(embeddedKeys[i], { gasLimit: 2_000_000 }),
        () => conditional.shared.connect(sharedBuyer).fulfillInitial(sharedKeys[i], { gasLimit: 2_000_000 })
      ]);
      preFinalEmbedded += a;
      preFinalShared += b;
    }
    const finalIndex = embeddedKeys.length - 1;
    const [activationEmbedded, activationShared] = await sameBlock(conn, await latest() + 1n, [
      () => conditional.embedded.connect(embeddedBuyer).fulfillInitial(embeddedKeys[finalIndex], { gasLimit: 2_000_000 }),
      () => conditional.shared.connect(sharedBuyer).fulfillInitial(sharedKeys[finalIndex], { gasLimit: 2_000_000 })
    ]);
    matchingState(await conditional.embedded.getPulseState(), await conditional.shared.getPulseState(), "activation");
    if (await conditional.embedded.initialFulfilled() !== allocationSlots
        || await conditional.shared.initialFulfilled() !== allocationSlots) {
      throw new Error("Initial slot count differs");
    }
    const conditionalQuote = await quotes(conditional, "conditional");
    const conditionalFirst = await purchase(conditional, "conditional first", await latest() + 1n, true);
    const conditionalNext = await purchase(conditional, "conditional next", await latest() + 30n, true);

    const scheduledPreopenQuote = await quotes(scheduled, "scheduled pre-open");
    const scheduledFirst = await purchase(scheduled, "scheduled first", scheduledOpen, false);
    const scheduledNext = await purchase(scheduled, "scheduled next", scheduledOpen + 30n, false);
    const scheduledPostSaleQuote = await quotes(scheduled, "scheduled post-sale");

    const report = {
      format: "pulse-core-a-b-benchmark/v2",
      network: conn.networkName,
      chainId,
      execution: { hardfork: conn.networkConfig.hardfork, initialDate: conn.networkConfig.initialDate },
      build,
      core: { deployment: await coreDeployGas, runtimeBytes: coreCode.length / 2 - 1, runtimeCodeHash: coreHash },
      controls: "Embedded control is generated from PulseConsumerHarness and PulseMath; calldata becomes memory only where an internal call requires it.",
      excludedFromTotals: "Test tokens, quote probe, token funding and ERC20 approvals. Slot registration and fulfillment are reported separately.",
      scheduledEth: {
        deployment: scheduled.deployment,
        runtimeBytes: scheduled.runtimeBytes,
        preopenQuoteTx: scheduledPreopenQuote,
        firstPurchase: scheduledFirst,
        nextPurchase: scheduledNext,
        postSaleQuoteTx: scheduledPostSaleQuote
      },
      conditionalErc20: {
        allocationSlots,
        deployment: conditional.deployment,
        runtimeBytes: conditional.runtimeBytes,
        registration: { embedded: allowEmbedded, shared: allowShared },
        preFinalFulfillment: { embedded: preFinalEmbedded, shared: preFinalShared },
        finalSlotActivation: { embedded: activationEmbedded, shared: activationShared },
        quoteTx: conditionalQuote,
        firstPurchase: conditionalFirst,
        nextPurchase: conditionalNext
      }
    };
    const aDeployment = scheduled.deployment.embedded + conditional.deployment.embedded;
    const bDeployment = await coreDeployGas + scheduled.deployment.shared + conditional.deployment.shared;
    report.twoApplicationDeployment = { embedded: aDeployment, shared: bDeployment, sharedMinusEmbedded: bDeployment - aDeployment };
    console.log(JSON.stringify(report, (_, value) => decimal(value), 2));
  } finally {
    await conn.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
