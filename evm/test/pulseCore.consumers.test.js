import { expect } from "chai";
import hre from "hardhat";
import * as model from "./helpers/pulseCoreSpecModel.js";
import { mineAt, setNextBlockTimestamp } from "./helpers/time.js";

const CONFIG = { k: 600n, genesisPrice: 1000n, genesisFloor: 900n, pts: 1n };
const stateValue = (s) => ({
  epochIndex: s.epochIndex, openTime: s.openTime, curveStartTime: s.curveStartTime,
  anchorTime: s.anchorTime, floorPrice: s.floorPrice
});

describe("Shared Pulse core: application conformance", function () {
  let conn, ethers, provider, core, Harness, owner, alice, bob, treasury, otherTreasury, hash, chainId;

  beforeEach(async function () {
    conn = await hre.network.connect();
    ethers = conn.ethers;
    provider = conn.provider;
    [owner, alice, bob, treasury, otherTreasury] = await ethers.getSigners();
    core = await ethers.deployContract("PulseCoreV1");
    await core.waitForDeployment();
    Harness = await ethers.getContractFactory("PulseConsumerHarness");
    hash = ethers.keccak256(await ethers.provider.getCode(await core.getAddress()));
    chainId = (await ethers.provider.getNetwork()).chainId;
  });

  afterEach(async function () { await conn.close(); });

  const key = (label) => ethers.id(label);
  const address = (contract) => contract.getAddress();
  async function now() { return BigInt((await ethers.provider.getBlock("latest")).timestamp); }
  async function actor() {
    const result = await ethers.deployContract("PulseConsumerActor");
    await result.waitForDeployment();
    return result;
  }
  async function token(mode = 0) {
    const result = await ethers.deployContract("PulseConsumerTestToken");
    await result.waitForDeployment();
    await result.configure(mode, ethers.ZeroAddress);
    return result;
  }
  async function deployApp(options = {}) {
    const slots = options.slots ?? 0n;
    const app = await Harness.deploy(
      { core: await address(core), runtimeCodeHash: hash, chainId, ...options.binding },
      options.config ?? CONFIG,
      {
        paymentToken: options.token ? await address(options.token) : ethers.ZeroAddress,
        treasury: options.treasury ?? treasury.address,
        owner: options.owner ?? owner.address,
        scheduledOpenTime: options.openTime ?? (slots === 0n ? await now() + 120n : 0n),
        allocationSlots: slots,
        initialPrice: options.initialPrice ?? 17n,
        maxSupply: options.maxSupply ?? 100_000n,
        ...options.application
      }
    );
    await app.waitForDeployment();
    return app;
  }
  async function configOf(app) {
    const c = await app.getPulseConfig();
    return { k: c.k, genesisPrice: c.genesisPrice, genesisFloor: c.genesisFloor, pts: c.pts };
  }
  async function fund(t, buyer, app, amount = 1_000_000n) {
    await t.mint(buyer.address, amount);
    await t.connect(buyer).approve(await address(app), amount);
  }
  async function buy(app, label, options = {}) {
    const s = stateValue(await app.getPulseState());
    const timestamp = options.timestamp ?? (s.openTime > await now() ? s.openTime : await now() + 1n);
    const ask = await core.quote(await configOf(app), s, timestamp);
    const value = options.value ?? ((await app.paymentToken()) === ethers.ZeroAddress ? ask : 0n);
    await setNextBlockTimestamp(provider, timestamp);
    const tx = await app.connect(options.buyer ?? alice).buy(options.maxPrice ?? ask, key(label), { value, gasLimit: 2_000_000 });
    return { receipt: await tx.wait(), ask, timestamp };
  }
  function events(contract, receipt, name) {
    return receipt.logs.filter((l) => l.address.toLowerCase() === contract.target.toLowerCase())
      .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
      .filter((l) => l && l.name === name).map((l) => l.args);
  }
  async function snapshot(app, issuanceKey, t, buyer = alice.address) {
    const supply = await app.totalIssued();
    const appAddress = await address(app);
    const treasuryAddress = await app.treasury();
    const result = {
      config: await configOf(app), state: stateValue(await app.getPulseState()),
      initialized: await app.initialized(), paused: await app.paused(), supply,
      lastBlock: await app.lastBlock(), fulfilled: await app.initialFulfilled(),
      registered: await app.registeredSlots(), used: await app.usedKeys(issuanceKey),
      nextOwner: await app.ownerOf(supply + 1n),
      appBalance: await ethers.provider.getBalance(appAddress),
      coreBalance: await ethers.provider.getBalance(await address(core)),
      treasuryBalance: await ethers.provider.getBalance(treasuryAddress),
      logs: (await ethers.provider.getLogs({ address: appAddress, fromBlock: 0 })).map((l) => l.data + l.topics.join(""))
    };
    if (t) {
      result.tokens = [await t.balanceOf(buyer), await t.balanceOf(treasuryAddress), await t.allowance(buyer, appAddress)];
      result.tokenLogs = (await t.queryFilter(t.filters.Transfer())).length;
    }
    return result;
  }
  async function configureProbe(probe, app, kind, options = {}) {
    const attempts = [
      app.interface.encodeFunctionData("buy", [10_000n, key("nested-buy")]),
      app.interface.encodeFunctionData("fulfillInitial", [key("nested-initial")]),
      app.interface.encodeFunctionData("allowInitial", [[key("nested-allow")], alice.address]),
      app.interface.encodeFunctionData("setPaused", [true])
    ];
    await probe.configure(await address(app), attempts, kind === "ether", kind === "delivery",
      options.rejectEther ?? false, options.rejectDelivery ?? false, options.propagate ?? false);
  }
  async function expectMinedRevert(action, app, error) {
    const before = BigInt(await provider.send("eth_blockNumber"));
    await expect(action()).to.be.revertedWithCustomError(app, error);
    const after = BigInt(await provider.send("eth_blockNumber"));
    expect(after).to.equal(before + 1n);
    const block = await provider.send("eth_getBlockByNumber", [ethers.toQuantity(after), false]);
    expect(block.transactions).to.have.length(1);
    const receipt = await provider.send("eth_getTransactionReceipt", [block.transactions[0]]);
    expect(receipt.status).to.equal("0x0");
    expect(receipt.logs).to.have.length(0);
  }
  async function assertBlocked(probe, app, epoch, issued, initialized = true) {
    expect(await probe.observedEpoch()).to.equal(epoch);
    expect(await probe.observedIssued()).to.equal(issued);
    expect(await probe.observedInitialized()).to.equal(initialized);
    for (let i = 0; i < 4; i++) {
      expect(await probe.successes(i)).to.equal(false);
      expect(await probe.results(i)).to.equal(app.interface.encodeErrorResult("Reentrancy"));
    }
    expect(await app.paused()).to.equal(false);
  }

  it("pins the approved core and chain, and rejects missing or mismatched code", async function () {
    await expect(deployApp({ binding: { core: alice.address } })).to.be.revertedWithCustomError(Harness, "InvalidCore");
    await expect(deployApp({ binding: { runtimeCodeHash: ethers.ZeroHash } })).to.be.revertedWithCustomError(Harness, "InvalidCore");
    await expect(deployApp({ binding: { chainId: chainId + 1n } })).to.be.revertedWithCustomError(Harness, "WrongChain");
    const app = await deployApp();
    expect(await app.pulseCore()).to.equal(await address(core));
    expect(await app.coreRuntimeCodeHash()).to.equal(hash);
    expect(await app.boundChainId()).to.equal(chainId);
    expect(Harness.interface.fragments.filter((f) => f.type === "function" && /set.*(core|config)/i.test(f.name))).to.have.length(0);
  });

  it("validates launch policy, payment asset and the first transition before accepting allocations", async function () {
    await expect(deployApp({ treasury: ethers.ZeroAddress })).to.be.revertedWithCustomError(Harness, "InvalidApplication");
    await expect(deployApp({ application: { paymentToken: alice.address } })).to.be.revertedWithCustomError(Harness, "InvalidApplication");
    await expect(deployApp({ slots: 1n, openTime: await now() + 100n })).to.be.revertedWithCustomError(Harness, "InvalidApplication");
    await expect(deployApp({ openTime: await now() - 1n })).to.be.revertedWithCustomError(Harness, "StartInPast");
    const max = ethers.MaxUint256;
    await expect(deployApp({ slots: 1n, config: { k: 1n, pts: 2n, genesisPrice: max, genesisFloor: max - 1n } }))
      .to.be.revertedWithCustomError(core, "TargetPriceOverflow");
  });

  it("pins scheduled pre-open quotes and makes the first purchase a normal epoch-0 sale", async function () {
    const app = await deployApp();
    const s = stateValue(await app.getPulseState());
    expect(await app.initialized()).to.equal(true);
    expect(await app.curveActive()).to.equal(false);
    expect(await app.getCurrentPrice()).to.equal(1000n);
    await expect(app.connect(alice).buy(10_000n, key("early"), { value: 1000n })).to.be.revertedWithCustomError(app, "NotOpen");
    await mineAt(provider, s.openTime - 1n);
    expect(await app.getCurrentPrice()).to.equal(1000n);
    const { receipt, ask } = await buy(app, "first", { timestamp: s.openTime, maxPrice: 10_000n });
    const [sale] = events(app, receipt, "Sale");
    expect(sale.epochIndex).to.equal(1n);
    expect(sale.price).to.equal(ask);
    expect(await app.curveActive()).to.equal(true);
    expect(await app.totalIssued()).to.equal(1n);
    expect(await app.ownerOf(1n)).to.equal(alice.address);
  });

  it("uses stored canonical inputs even after consumers simulate arbitrary core states", async function () {
    const app = await deployApp();
    const before = await snapshot(app, key("sale"));
    const fake = model.initialize(CONFIG, 1000n);
    await core.initialize(CONFIG, 2000n);
    await core.advance(CONFIG, fake, 1601n);
    expect(await snapshot(app, key("sale"))).to.deep.equal(before);
    const { receipt, timestamp } = await buy(app, "sale");
    expect(events(app, receipt, "Sale")[0].timestamp).to.equal(timestamp);
    expect((await app.getPulseState()).openTime).to.equal(before.state.openTime);
  });

  it("keeps two applications' config, curve, payments, supply and block marker independent", async function () {
    const t = await token();
    const a = await deployApp();
    const b = await deployApp({ token: t, treasury: otherTreasury.address,
      config: { k: 100n, genesisPrice: 120n, genesisFloor: 100n, pts: 2n } });
    await fund(t, bob, b);
    const beforeB = await snapshot(b, key("b-sale"), t, bob.address);
    await buy(a, "a-sale");
    expect(await snapshot(b, key("b-sale"), t, bob.address)).to.deep.equal(beforeB);
    const beforeA = await snapshot(a, key("a-sale-2"));
    await buy(b, "b-sale", { buyer: bob });
    expect(await snapshot(a, key("a-sale-2"))).to.deep.equal(beforeA);
    await buy(a, "a-sale-2");
    expect(await a.getEpochIndex()).to.equal(2n);
    expect(await b.getEpochIndex()).to.equal(1n);
    expect(await a.pulseCore()).to.equal(await b.pulseCore());
  });

  it("allows both applications in one block while rejecting a second sale in one application", async function () {
    const start = await now() + 200n;
    const a = await deployApp({ openTime: start });
    const b = await deployApp({ openTime: start });
    const nonce = await alice.getNonce();
    let first, other, duplicate;
    await provider.send("evm_setAutomine", [false]);
    try {
      await setNextBlockTimestamp(provider, start);
      first = await a.connect(alice).buy(1000n, key("a"), { value: 1000n, nonce, gasLimit: 1_000_000 });
      other = await b.connect(bob).buy(1000n, key("b"), { value: 1000n, gasLimit: 1_000_000 });
      duplicate = await a.connect(alice).buy(10_000n, key("a-duplicate"), { value: 10_000n, nonce: nonce + 1, gasLimit: 1_000_000 });
      await provider.send("evm_mine");
    } finally { await provider.send("evm_setAutomine", [true]); }
    const receipts = await Promise.all([first, other, duplicate].map((tx) => ethers.provider.getTransactionReceipt(tx.hash)));
    expect(receipts.map((r) => r.status)).to.deep.equal([1, 1, 0]);
    expect(new Set(receipts.map((r) => r.blockNumber)).size).to.equal(1);
    expect(await a.lastBlock()).to.equal(await b.lastBlock());
    expect(await a.getEpochIndex()).to.equal(1n);
    expect(await b.getEpochIndex()).to.equal(1n);
    expect(await a.usedKeys(key("a-duplicate"))).to.equal(false);
  });

  it("pauses purchases while the curve clock continues, and restricts pause authority", async function () {
    const app = await deployApp();
    await buy(app, "first");
    const s = stateValue(await app.getPulseState());
    await expect(app.connect(alice).setPaused(true)).to.be.revertedWithCustomError(app, "OnlyOwner");
    await app.setPaused(true);
    await mineAt(provider, s.curveStartTime + 100n);
    expect(await app.curveActive()).to.equal(true);
    expect(await app.getCurrentPrice()).to.equal(model.quote(CONFIG, s, await now()));
    await expect(app.connect(alice).buy(10_000n, key("paused"), { value: 10_000n })).to.be.revertedWithCustomError(app, "Paused");
    await app.setPaused(false);
    expect(stateValue(await app.getPulseState())).to.deep.equal(s);
    await buy(app, "after-pause");
    expect(await app.getEpochIndex()).to.equal(2n);
  });

  it("rejects duplicate issuance keys and exhausted supply without advancing", async function () {
    const app = await deployApp({ maxSupply: 1n });
    await buy(app, "only");
    const before = await snapshot(app, key("extra"));
    await expect(app.connect(alice).buy(10_000n, key("only"), { value: 10_000n })).to.be.revertedWithCustomError(app, "InvalidKey");
    await expect(app.connect(alice).buy(10_000n, key("extra"), { value: 10_000n })).to.be.revertedWithCustomError(app, "SoldOut");
    expect(await snapshot(app, key("extra"))).to.deep.equal(before);
  });

  for (const overpay of [0n, 77n]) {
    it(`settles ETH exactly and refunds ${overpay} surplus without treating maxPrice as payment`, async function () {
      const app = await deployApp();
      const beforeBuyer = await ethers.provider.getBalance(alice.address);
      const beforeTreasury = await ethers.provider.getBalance(treasury.address);
      const { receipt, ask } = await buy(app, "eth", { maxPrice: 10_000n, value: 1000n + overpay });
      expect(await ethers.provider.getBalance(treasury.address) - beforeTreasury).to.equal(ask);
      expect(beforeBuyer - await ethers.provider.getBalance(alice.address)).to.equal(ask + receipt.gasUsed * receipt.gasPrice);
      expect(await ethers.provider.getBalance(await address(app))).to.equal(0n);
      expect(await ethers.provider.getBalance(await address(core))).to.equal(0n);
    });
  }

  it("rolls back slippage and underpayment, allowing the same key to succeed later", async function () {
    const app = await deployApp();
    const start = (await app.getPulseState()).openTime;
    await mineAt(provider, start);
    const before = await snapshot(app, key("retry"));
    await expect(app.connect(alice).buy(0n, key("retry"), { value: 1000n })).to.be.revertedWithCustomError(app, "AskAboveMaxPrice");
    await expect(app.connect(alice).buy(10_000n, key("retry"), { value: 1n })).to.be.revertedWithCustomError(app, "InsufficientPayment");
    expect(await snapshot(app, key("retry"))).to.deep.equal(before);
    await buy(app, "retry");
  });

  for (const failure of ["treasury", "refund", "delivery"]) {
    it(`rolls back native payment, reservations, state and events on ${failure} failure`, async function () {
      const probe = await actor();
      const app = await deployApp(failure === "treasury" ? { treasury: await address(probe) } : {});
      await configureProbe(probe, app, "none", { rejectEther: failure !== "delivery", rejectDelivery: failure === "delivery" });
      await mineAt(provider, (await app.getPulseState()).openTime);
      const before = await snapshot(app, key("failed"));
      const data = app.interface.encodeFunctionData("buy", [10_000n, key("failed")]);
      const appAddress = await address(app);
      const action = () => failure === "treasury"
        ? app.connect(alice).buy(10_000n, key("failed"), { value: 10_000n, gasLimit: 2_000_000 })
        : probe.execute(appAddress, data, { value: 10_000n, gasLimit: 2_000_000 });
      const error = { treasury: "TreasuryTransferFailed", refund: "RefundFailed", delivery: "DeliveryRejected" }[failure];
      await expectMinedRevert(action, app, error);
      expect(await snapshot(app, key("failed"))).to.deep.equal(before);
      expect(await ethers.provider.getBalance(await address(probe))).to.equal(0n);
      await configureProbe(probe, app, "none");
      await buy(app, "failed");
    });
  }

  for (const mode of [0, 1]) {
    it(`settles exact ERC20 amounts with ${mode === 0 ? "standard" : "no-return"} transferFrom`, async function () {
      const t = await token(mode);
      const app = await deployApp({ token: t });
      await fund(t, alice, app);
      const { ask } = await buy(app, "token");
      expect(await t.balanceOf(treasury.address)).to.equal(ask);
      expect(await t.balanceOf(alice.address)).to.equal(1_000_000n - ask);
      expect(await t.allowance(alice.address, await address(app))).to.equal(1_000_000n - ask);
      expect(await ethers.provider.getBalance(await address(app))).to.equal(0n);
    });
  }

  for (const mode of [2, 3, 4]) {
    it(`rolls back token balances, allowance, state and logs for ERC20 failure mode ${mode}`, async function () {
      const t = await token(mode);
      const app = await deployApp({ token: t });
      await fund(t, alice, app);
      await mineAt(provider, (await app.getPulseState()).openTime);
      const before = await snapshot(app, key("failed"), t);
      await expectMinedRevert(() => app.connect(alice).buy(10_000n, key("failed"), { gasLimit: 2_000_000 }), app, "TokenTransferFailed");
      expect(await snapshot(app, key("failed"), t)).to.deep.equal(before);
      await t.configure(0, ethers.ZeroAddress);
      await buy(app, "failed");
    });
  }

  it("rejects ERC20 ETH attachments, missing approval and insufficient balance", async function () {
    const t = await token();
    const app = await deployApp({ token: t });
    await t.mint(alice.address, 10_000n);
    await mineAt(provider, (await app.getPulseState()).openTime);
    const before = await snapshot(app, key("failed"), t);
    await expect(app.connect(alice).buy(10_000n, key("failed"), { value: 1n })).to.be.revertedWithCustomError(app, "UnexpectedETH");
    await expect(app.connect(alice).buy(10_000n, key("failed"))).to.be.revertedWithCustomError(app, "TokenTransferFailed");
    expect(await snapshot(app, key("failed"), t)).to.deep.equal(before);
    await t.connect(bob).approve(await address(app), 10_000n);
    await expect(app.connect(bob).buy(10_000n, key("failed"))).to.be.revertedWithCustomError(app, "TokenTransferFailed");
  });

  for (const useToken of [false, true]) {
    it(`leaves ${useToken ? "ERC20" : "ETH"} application state unchanged when a later core transition exceeds price headroom`, async function () {
      const t = useToken ? await token() : undefined;
      const app = await deployApp({ token: t, config: {
        k: 1n, pts: 1n, genesisFloor: ethers.MaxUint256 - 10n, genesisPrice: ethers.MaxUint256 - 9n
      } });
      await mineAt(provider, (await app.getPulseState()).openTime + 11n);
      const before = await snapshot(app, key("headroom"), t);
      await expectMinedRevert(() => app.connect(alice).buy(ethers.MaxUint256, key("headroom"), { gasLimit: 2_000_000 }),
        core, "TargetPriceOverflow");
      expect(await snapshot(app, key("headroom"), t)).to.deep.equal(before);
      expect(await app.getCurrentPrice()).to.equal(ethers.MaxUint256 - 10n);
    });
  }

  it("rolls back successful ERC20 transfers when delivery fails", async function () {
    const t = await token();
    const buyer = await actor();
    const app = await deployApp({ token: t });
    await t.mint(await address(buyer), 10_000n);
    await buyer.execute(await address(t), t.interface.encodeFunctionData("approve", [await address(app), 10_000n]));
    await configureProbe(buyer, app, "none", { rejectDelivery: true });
    await mineAt(provider, (await app.getPulseState()).openTime);
    const before = await snapshot(app, key("failed"), t, await address(buyer));
    const appAddress = await address(app);
    await expectMinedRevert(() => buyer.execute(appAddress, app.interface.encodeFunctionData("buy", [10_000n, key("failed")]), { gasLimit: 2_000_000 }),
      app, "DeliveryRejected");
    expect(await snapshot(app, key("failed"), t, await address(buyer))).to.deep.equal(before);
  });

  for (const hook of ["treasury", "refund", "token", "receiver"]) {
    it(`blocks all lifecycle write paths during ${hook} callbacks and exposes committed state`, async function () {
      const probe = await actor();
      const t = hook === "token" ? await token() : undefined;
      const app = await deployApp({ token: t,
        treasury: hook === "treasury" ? await address(probe) : treasury.address,
        owner: await address(probe) });
      await configureProbe(probe, app, hook === "receiver" ? "delivery" : (hook === "token" ? "none" : "ether"));
      if (t) {
        await fund(t, alice, app);
        await t.configure(0, await address(probe));
      }
      if (hook === "refund" || hook === "receiver") {
        await mineAt(provider, (await app.getPulseState()).openTime);
        await probe.execute(await address(app), app.interface.encodeFunctionData("buy", [10_000n, key("outer")]), { value: 10_000n });
      } else await buy(app, "outer");
      await assertBlocked(probe, app, 1n, 1n);
      expect(await app.usedKeys(key("nested-buy"))).to.equal(false);
      expect(await app.totalIssued()).to.equal(1n);
    });
  }

  it("fully rolls back when a receiver propagates a blocked reentry", async function () {
    const probe = await actor();
    const app = await deployApp();
    await configureProbe(probe, app, "delivery", { propagate: true });
    await mineAt(provider, (await app.getPulseState()).openTime);
    const before = await snapshot(app, key("outer"));
    const appAddress = await address(app);
    await expectMinedRevert(() => probe.execute(appAddress, app.interface.encodeFunctionData("buy", [10_000n, key("outer")]),
      { value: 10_000n, gasLimit: 2_000_000 }), app, "Reentrancy");
    expect(await snapshot(app, key("outer"))).to.deep.equal(before);
  });

  it("enforces eligibility and unique slots while conditional launch remains uninitialized", async function () {
    const app = await deployApp({ slots: 2n });
    expect(await app.curveActive()).to.equal(false);
    await expect(app.getCurrentPrice()).to.be.revertedWithCustomError(app, "NotInitialized");
    await expect(app.connect(alice).buy(10_000n, key("early"))).to.be.revertedWithCustomError(app, "NotInitialized");
    await expect(app.connect(alice).allowInitial([key("a")], alice.address)).to.be.revertedWithCustomError(app, "OnlyOwner");
    await app.allowInitial([key("a")], alice.address);
    await expect(app.allowInitial([key("a")], alice.address)).to.be.revertedWithCustomError(app, "InvalidKey");
    await expect(app.allowInitial([key("b"), key("c")], alice.address)).to.be.revertedWithCustomError(app, "NotEligible");
    await expect(app.connect(bob).fulfillInitial(key("a"), { value: 17n })).to.be.revertedWithCustomError(app, "NotEligible");
    await app.connect(alice).fulfillInitial(key("a"), { value: 17n });
    await expect(app.connect(alice).fulfillInitial(key("a"), { value: 17n })).to.be.revertedWithCustomError(app, "InvalidKey");
    expect(await app.initialFulfilled()).to.equal(1n);
    expect(await app.initialized()).to.equal(false);
    expect(await app.lastBlock()).to.equal(0n);
    expect(await ethers.provider.getBalance(treasury.address)).to.be.greaterThan(0n);
  });

  for (const useToken of [false, true]) {
    it(`restores the last slot and activation when ${useToken ? "ERC20" : "ETH"} final delivery fails`, async function () {
      const t = useToken ? await token() : undefined;
      const buyer = await actor();
      const app = await deployApp({ slots: 1n, token: t });
      await app.allowInitial([key("final")], await address(buyer));
      if (t) {
        await t.mint(await address(buyer), 100n);
        await buyer.execute(await address(t), t.interface.encodeFunctionData("approve", [await address(app), 100n]));
      }
      await configureProbe(buyer, app, "none", { rejectDelivery: true });
      const before = await snapshot(app, key("final"), t, await address(buyer));
      const data = app.interface.encodeFunctionData("fulfillInitial", [key("final")]);
      const appAddress = await address(app);
      await expectMinedRevert(() => buyer.execute(appAddress, data, { value: useToken ? 0n : 17n, gasLimit: 2_000_000 }),
        app, "DeliveryRejected");
      expect(await snapshot(app, key("final"), t, await address(buyer))).to.deep.equal(before);
      await configureProbe(buyer, app, "none");
      const receipt = await (await buyer.execute(await address(app), data, { value: useToken ? 0n : 17n })).wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const [launch] = events(app, receipt, "LaunchConfigured");
      expect(launch.openTime).to.equal(BigInt(block.timestamp));
      expect(launch.deployedAt).to.equal(await app.deployedAt());
      expect(events(app, receipt, "Sale")).to.have.length(0);
      expect(await app.initialFulfilled()).to.equal(1n);
      expect(await app.getEpochIndex()).to.equal(0n);
    });
  }

  it("blocks purchase, fulfillment and owner changes during the activating fulfillment callback", async function () {
    const probe = await actor();
    const app = await deployApp({ slots: 1n, owner: await address(probe) });
    await probe.execute(await address(app), app.interface.encodeFunctionData("allowInitial", [[key("final")], await address(probe)]));
    await configureProbe(probe, app, "delivery");
    await probe.execute(await address(app), app.interface.encodeFunctionData("fulfillInitial", [key("final")]), { value: 17n });
    await assertBlocked(probe, app, 0n, 1n);
    expect(await app.lastBlock()).to.equal(0n);
    expect(await app.initialFulfilled()).to.equal(1n);
  });

  it("activates exactly at slot 1024 and permits one subsequent Pulse purchase in that block", async function () {
    const buyer = await actor();
    const app = await deployApp({ slots: 1024n, initialPrice: 0n });
    const keys = Array.from({ length: 1024 }, (_, i) => key(`slot-${i}`));
    for (let i = 0; i < keys.length; i += 128) {
      await app.allowInitial(keys.slice(i, i + 128), await address(buyer));
    }
    const appAddress = await address(app);
    for (let i = 0; i < 1023; i += 64) {
      const batch = keys.slice(i, Math.min(i + 64, 1023));
      const receipt = await (await buyer.batch(batch.map(() => appAddress),
        batch.map((k) => app.interface.encodeFunctionData("fulfillInitial", [k])), batch.map(() => 0n), { gasLimit: 12_000_000 })).wait();
      expect(events(buyer, receipt, "Attempt").every((a) => a.success)).to.equal(true);
      expect(events(app, receipt, "InitialFulfilled")).to.have.length(batch.length);
      expect(events(app, receipt, "Sale")).to.have.length(0);
    }
    expect(await app.initialFulfilled()).to.equal(1023n);
    expect(await app.initialized()).to.equal(false);
    await expect(app.getCurrentPrice()).to.be.revertedWithCustomError(app, "NotInitialized");
    const receipt = await (await buyer.batch([appAddress, appAddress, appAddress], [
      app.interface.encodeFunctionData("fulfillInitial", [keys[1023]]),
      app.interface.encodeFunctionData("buy", [10_000n, key("first-paid")]),
      app.interface.encodeFunctionData("buy", [10_000n, key("second-paid")])
    ], [0n, 10_000n, 10_000n], { value: 20_000n, gasLimit: 2_000_000 })).wait();
    const attempts = events(buyer, receipt, "Attempt");
    expect(attempts.map((a) => a.success)).to.deep.equal([true, true, false]);
    expect(attempts[2].result).to.equal(app.interface.encodeErrorResult("OneSalePerBlock"));
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const [launch] = events(app, receipt, "LaunchConfigured");
    expect(launch.openTime).to.equal(BigInt(block.timestamp));
    expect(launch.deployedAt).to.equal(await app.deployedAt());
    expect(launch.deployedAt).to.be.lessThan(launch.openTime);
    const [sale] = events(app, receipt, "Sale");
    expect(sale.epochIndex).to.equal(1n);
    expect(sale.price).to.equal(1000n);
    expect(await app.initialFulfilled()).to.equal(1024n);
    expect(await app.totalIssued()).to.equal(1025n);
    expect(await app.usedKeys(key("second-paid"))).to.equal(false);
    await expect(buyer.execute(appAddress, app.interface.encodeFunctionData("fulfillInitial", [keys[0]])))
      .to.be.revertedWithCustomError(app, "InitialPhaseClosed");
    await expect(app.allowInitial([key("extra-slot")], alice.address)).to.be.revertedWithCustomError(app, "InitialPhaseClosed");
  });

  it("reconstructs every sold epoch from application events and configuration", async function () {
    const app = await deployApp();
    const launch = (await app.queryFilter(app.filters.LaunchConfigured()))[0].args;
    let expected = model.initialize(CONFIG, launch.openTime);
    const gaps = [0n, 3n, 0n, 600n, 1n, 900n];
    for (let i = 0; i < gaps.length; i++) {
      const timestamp = expected.curveStartTime + gaps[i];
      const { receipt } = await buy(app, `replay-${i}`, { timestamp });
      const [sale] = events(app, receipt, "Sale");
      const next = model.advance(CONFIG, expected, sale.timestamp);
      expect(sale.price).to.equal(next.ask);
      expect(sale.nextAnchorA).to.equal(next.nextState.anchorTime);
      expect(sale.nextFloorB).to.equal(next.nextState.floorPrice);
      expect(sale.epochIndex).to.equal(next.nextState.epochIndex);
      expected = next.nextState;
      expect(stateValue(await app.getPulseState())).to.deep.equal(expected);
      expect(await app.getCurrentPrice()).to.equal(model.quote(CONFIG, expected, timestamp));
    }
    const legacyConfig = await app.getConfig();
    expect(Array.from(legacyConfig)).to.deep.equal([launch.openTime, CONFIG.genesisPrice, CONFIG.genesisFloor, CONFIG.k, CONFIG.pts]);
    expect(Array.from(await app.getState())).to.deep.equal([
      expected.epochIndex, expected.curveStartTime, expected.anchorTime, expected.floorPrice, true
    ]);
  });
});
