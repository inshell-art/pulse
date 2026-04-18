import { expect } from "chai";
import hre from "hardhat";
import {
  FIRST_ID,
  GENESIS_FLOOR,
  GENESIS_PRICE,
  K,
  LARGE_MAX_PRICE,
  PTS
} from "./helpers/constants.js";
import { deployERC20Env, deployETHEnv } from "./helpers/fixtures.js";
import { setNextBlockTimestamp } from "./helpers/time.js";

describe("PulseAuction Hardening (Solidity)", function () {
  let conn;
  let ethers;
  let provider;

  beforeEach(async function () {
    conn = await hre.network.connect();
    ethers = conn.ethers;
    provider = conn.provider;
  });

  afterEach(async function () {
    await conn.close();
  });

  async function expectConstructorRevert(args, reason) {
    const [deployer] = await ethers.getSigners();
    const Auction = await ethers.getContractFactory("PulseAuction", deployer);

    await expect(
      (async () => {
        const c = await Auction.deploy(...args);
        await c.waitForDeployment();
      })()
    ).to.be.revertedWith(reason);
  }

  it("constructor rejects non-positive genesis gap", async function () {
    const [, , , treasury] = await ethers.getSigners();

    await expectConstructorRevert(
      [
        0n,
        K,
        GENESIS_FLOOR, // equal to floor
        GENESIS_FLOOR,
        PTS,
        ethers.ZeroAddress,
        treasury.address,
        ethers.ZeroAddress
      ],
      "GAP_ZERO_OR_NEGATIVE"
    );
  });

  it("constructor rejects zero pts", async function () {
    const [, , , treasury] = await ethers.getSigners();

    await expectConstructorRevert(
      [0n, K, GENESIS_PRICE, GENESIS_FLOOR, 0n, ethers.ZeroAddress, treasury.address, ethers.ZeroAddress],
      "PTS_ZERO_OR_NEGATIVE"
    );
  });

  it("constructor rejects pts above uint128", async function () {
    const [, , , treasury] = await ethers.getSigners();
    const tooLargePts = (1n << 128n) + 1n;

    await expectConstructorRevert(
      [
        0n,
        K,
        GENESIS_PRICE,
        GENESIS_FLOOR,
        tooLargePts,
        ethers.ZeroAddress,
        treasury.address,
        ethers.ZeroAddress
      ],
      "PTS_OUT_OF_RANGE"
    );
  });

  it("constructor rejects start ask gap above k", async function () {
    const [, , , treasury] = await ethers.getSigners();

    await expectConstructorRevert(
      [0n, 50n, 200n, 100n, 1n, ethers.ZeroAddress, treasury.address, ethers.ZeroAddress],
      "START_GAP_ABOVE_K"
    );
  });

  it("constructor rejects k/pts that exceeds uint64", async function () {
    const [, , , treasury] = await ethers.getSigners();

    await expectConstructorRevert(
      [0n, 1n << 65n, (1n << 65n) + 1n, 1n, 1n, ethers.ZeroAddress, treasury.address, ethers.ZeroAddress],
      "K_OVER_PTS_OVERFLOW"
    );
  });

  it("initializeMintAdapter is blocked when constructor already set adapter", async function () {
    const [deployer, alice, , treasury] = await ethers.getSigners();
    const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
    const adapter = await Adapter.deploy(alice.address, FIRST_ID);
    await adapter.waitForDeployment();
    const Auction = await ethers.getContractFactory("PulseAuction", deployer);

    const auction = await Auction.deploy(
      0n,
      K,
      GENESIS_PRICE,
      GENESIS_FLOOR,
      PTS,
      ethers.ZeroAddress,
      treasury.address,
      await adapter.getAddress()
    );
    await auction.waitForDeployment();

    await expect(auction.initializeMintAdapter(deployer.address)).to.be.revertedWith(
      "ADAPTER_ALREADY_SET"
    );
  });

  it("constructor rejects zero treasury", async function () {
    await expectConstructorRevert(
      [0n, K, GENESIS_PRICE, GENESIS_FLOOR, PTS, ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress],
      "ZERO_TREASURY"
    );
  });

  it("constructor rejects non-contract payment token", async function () {
    const [deployer, , , treasury] = await ethers.getSigners();

    await expectConstructorRevert(
      [0n, K, GENESIS_PRICE, GENESIS_FLOOR, PTS, deployer.address, treasury.address, ethers.ZeroAddress],
      "INVALID_PAYMENT_TOKEN"
    );
  });

  it("constructor rejects non-contract adapter when nonzero", async function () {
    const [deployer, , , treasury] = await ethers.getSigners();

    await expectConstructorRevert(
      [0n, K, GENESIS_PRICE, GENESIS_FLOOR, PTS, ethers.ZeroAddress, treasury.address, deployer.address],
      "INVALID_ADAPTER"
    );
  });

  it("reverts with ETH_TRANSFER_FAILED when treasury rejects ETH", async function () {
    const [deployer, alice] = await ethers.getSigners();

    const Treasury = await ethers.getContractFactory("RejectEtherReceiver", deployer);
    const rejectingTreasury = await Treasury.deploy();
    await rejectingTreasury.waitForDeployment();

    const Auction = await ethers.getContractFactory("PulseAuction", deployer);
    const auction = await Auction.deploy(
      0n,
      K,
      GENESIS_PRICE,
      GENESIS_FLOOR,
      PTS,
      ethers.ZeroAddress,
      await rejectingTreasury.getAddress(),
      ethers.ZeroAddress
    );
    await auction.waitForDeployment();

    const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
    const adapter = await Adapter.deploy(await auction.getAddress(), FIRST_ID);
    await adapter.waitForDeployment();
    await (await auction.initializeMintAdapter(await adapter.getAddress())).wait();

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);

    await expect(auction.connect(alice).bid(GENESIS_PRICE, { value: GENESIS_PRICE })).to.be.revertedWith(
      "ETH_TRANSFER_FAILED"
    );
    expect(await auction.epochIndex()).to.equal(0n);
    expect(await adapter.peekNext()).to.equal(FIRST_ID);
  });

  it("reverts with ETH_REFUND_FAILED when bidder rejects refunds", async function () {
    const [deployer] = await ethers.getSigners();
    const { auction, treasury, adapter } = await deployETHEnv(ethers, { startDelaySec: 0n });

    const RejectBidder = await ethers.getContractFactory("RefundRejectingBidder", deployer);
    const rejectBidder = await RejectBidder.deploy();
    await rejectBidder.waitForDeployment();

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);

    const ask = await auction.getCurrentPrice();
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);

    await expect(
      rejectBidder.bid(await auction.getAddress(), ask, { value: ask + 1n })
    ).to.be.revertedWith("ETH_REFUND_FAILED");

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryAfter - treasuryBefore).to.equal(0n);
    expect(await auction.epochIndex()).to.equal(0n);
    expect(await adapter.peekNext()).to.equal(FIRST_ID);
  });

  it("reverts with TRANSFER_FROM_FAILED when payment token transferFrom returns false", async function () {
    const [deployer, alice, , treasury] = await ethers.getSigners();

    const FalseToken = await ethers.getContractFactory("MockERC20FalseReturn", deployer);
    const token = await FalseToken.deploy();
    await token.waitForDeployment();

    const Auction = await ethers.getContractFactory("PulseAuction", deployer);
    const auction = await Auction.deploy(
      0n,
      K,
      GENESIS_PRICE,
      GENESIS_FLOOR,
      PTS,
      await token.getAddress(),
      treasury.address,
      ethers.ZeroAddress
    );
    await auction.waitForDeployment();

    const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
    const adapter = await Adapter.deploy(await auction.getAddress(), FIRST_ID);
    await adapter.waitForDeployment();
    await (await auction.initializeMintAdapter(await adapter.getAddress())).wait();

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);

    await expect(auction.connect(alice).bid(GENESIS_PRICE)).to.be.revertedWith("TRANSFER_FROM_FAILED");
    expect(await auction.epochIndex()).to.equal(0n);
    expect(await adapter.peekNext()).to.equal(FIRST_ID);
  });

  it("emits exactly one Sale and one Settled event per successful bid", async function () {
    const { auction, adapter, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);

    const receipt = await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    const saleLogs = await auction.queryFilter(auction.filters.Sale(), receipt.blockNumber, receipt.blockNumber);
    const settledLogs = await adapter.queryFilter(
      adapter.filters.Settled(),
      receipt.blockNumber,
      receipt.blockNumber
    );

    expect(saleLogs.length).to.equal(1);
    expect(settledLogs.length).to.equal(1);
    expect(settledLogs[0].args.epochIndex).to.equal(saleLogs[0].args.epochIndex);
  });

  it("maintains epoch/token invariants over 40 timed bids", async function () {
    const { auction, adapter, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    let t = (await auction.openTime()) + 1_000n;
    const iterations = 40;

    for (let i = 0; i < iterations; i += 1) {
      const gap = BigInt((i % 9) + 1); // 1..9 sec, deterministic but varied
      t += gap;
      await setNextBlockTimestamp(provider, t);

      const epochBefore = await auction.epochIndex();
      const nextIdBefore = await adapter.peekNext();

      const receipt = await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();
      const saleLogs = await auction.queryFilter(
        auction.filters.Sale(),
        receipt.blockNumber,
        receipt.blockNumber
      );
      const settledLogs = await adapter.queryFilter(
        adapter.filters.Settled(),
        receipt.blockNumber,
        receipt.blockNumber
      );

      expect(saleLogs.length).to.equal(1);
      expect(settledLogs.length).to.equal(1);

      const sale = saleLogs[0].args;
      const settled = settledLogs[0].args;

      expect(sale.epochIndex).to.equal(epochBefore + 1n);
      expect(settled.epochIndex).to.equal(sale.epochIndex);
      expect(settled.tokenId).to.equal(nextIdBefore);
      expect(sale.price).to.be.greaterThanOrEqual(sale.nextFloorB);
      expect(await auction.epochIndex()).to.equal(epochBefore + 1n);
      expect(await adapter.peekNext()).to.equal(nextIdBefore + 1n);
    }

    expect(await auction.epochIndex()).to.equal(BigInt(iterations));
    expect(await adapter.peekNext()).to.equal(FIRST_ID + BigInt(iterations));
  });
});
