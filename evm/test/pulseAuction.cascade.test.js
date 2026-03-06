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
import { deployERC20Env } from "./helpers/fixtures.js";
import {
  calculateAnchorTime,
  deriveInitialState,
  deriveNextState,
  expectedAsk
} from "./helpers/pulseModel.js";
import { mine, setNextBlockTimestamp } from "./helpers/time.js";

describe("PulseAuction Cascade (Solidity)", function () {
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

  it("constructor config and initial curve state", async function () {
    const { auction } = await deployERC20Env(ethers, { startDelaySec: 120n });

    const [openTime, gp, gf, k, pts] = await auction.getConfig();
    const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();
    const expectedAnchor = calculateAnchorTime(GENESIS_PRICE, GENESIS_FLOOR, K, openTime);
    const openAsk = expectedAsk({
      now: openTime,
      openTime,
      k: K,
      anchorTime: expectedAnchor,
      floorPrice: GENESIS_FLOOR
    });

    expect(openTime).to.be.greaterThan(0n);
    expect(gp).to.equal(GENESIS_PRICE);
    expect(gf).to.equal(GENESIS_FLOOR);
    expect(k).to.equal(K);
    expect(pts).to.equal(PTS);

    expect(epochIndex).to.equal(0n);
    expect(startTime).to.equal(openTime);
    expect(anchorTime).to.equal(expectedAnchor);
    expect(floorPrice).to.equal(GENESIS_FLOOR);
    expect(active).to.equal(false);
    expect(await auction.curveActive()).to.equal(false);
    expect(await auction.getCurrentPrice()).to.equal(openAsk);
  });

  it("constructor rejects zero k", async function () {
    const [deployer, , , treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20", deployer);
    const token = await Token.deploy("PayToken", "PAY", 18);
    await token.waitForDeployment();

    const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
    const adapter = await Adapter.deploy(ethers.ZeroAddress, FIRST_ID);
    await adapter.waitForDeployment();

    const Auction = await ethers.getContractFactory("PulseAuction", deployer);
    await expect(
      (async () => {
        const a = await Auction.deploy(
          0n,
          0n,
          GENESIS_PRICE,
          GENESIS_FLOOR,
          PTS,
          await token.getAddress(),
          treasury.address,
          await adapter.getAddress()
        );
        await a.waitForDeployment();
      })()
    ).to.be.revertedWith("K_ZERO_OR_NEGATIVE");
  });

  it("blocks bids before open time and allows at open time", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 123n });

    await expect(auction.connect(alice).bid(GENESIS_PRICE)).to.be.revertedWith("AUCTION_NOT_OPEN");
    expect(await auction.curveActive()).to.equal(false);

    const openTime = await auction.openTime();
    await setNextBlockTimestamp(provider, openTime);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();
    expect(await auction.curveActive()).to.equal(true);
  });

  it("keeps pre-open ask pinned to open-time curve price", async function () {
    const { auction } = await deployERC20Env(ethers, { startDelaySec: 500n });
    const openTime = await auction.openTime();

    const [, , anchorTime, floorPrice] = await auction.getState();
    const openAsk = expectedAsk({
      now: openTime,
      openTime,
      k: K,
      anchorTime,
      floorPrice
    });

    const sampleTimes = [openTime - 300n, openTime - 120n, openTime - 1n];
    for (const t of sampleTimes) {
      await setNextBlockTimestamp(provider, t);
      await mine(provider);
      expect(await auction.getCurrentPrice()).to.equal(openAsk);
      expect(await auction.curveActive()).to.equal(false);
    }
  });

  it("decays monotonically after open and stays above floor before first sale", async function () {
    const { auction } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const latestBlock = await ethers.provider.getBlock("latest");
    const baseTime = BigInt(latestBlock.timestamp) + 1n;

    const samples = [];
    for (const t of [baseTime, baseTime + 5n, baseTime + 25n, baseTime + 120n]) {
      await setNextBlockTimestamp(provider, t);
      await mine(provider);
      samples.push(await auction.getCurrentPrice());
    }

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i - 1]).to.be.greaterThanOrEqual(samples[i]);
      expect(samples[i]).to.be.greaterThanOrEqual(GENESIS_FLOOR);
    }
  });

  it("first sale at open pure-ratchets floor and uses minimum premium", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 50n });
    const openTime = await auction.openTime();

    await setNextBlockTimestamp(provider, openTime);
    const firstAsk = await auction.getCurrentPrice();
    await (await auction.connect(alice).bid(firstAsk)).wait();

    const [epochIndex, startTime, anchorTime, floorPrice] = await auction.getState();
    const immediateAsk = expectedAsk({
      now: startTime,
      openTime,
      k: K,
      anchorTime,
      floorPrice
    });

    expect(epochIndex).to.equal(1n);
    expect(startTime).to.equal(openTime);
    expect(floorPrice).to.equal(firstAsk);
    expect(immediateAsk - floorPrice).to.equal(PTS);
  });

  it("first sale pure-ratchets floor to executed sale price", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const openTime = await auction.openTime();
    const initial = deriveInitialState({
      openTime,
      genesisPrice: GENESIS_PRICE,
      genesisFloor: GENESIS_FLOOR,
      k: K
    });

    const t1 = openTime + 1_000n;
    const firstSalePrice = expectedAsk({
      now: t1,
      openTime,
      k: K,
      anchorTime: initial.anchorTime,
      floorPrice: initial.floorPrice
    });
    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const firstState = deriveNextState({
      now: t1,
      lastPrice: firstSalePrice,
      previousStartTime: openTime,
      k: K,
      pts: PTS,
      currentEpochIndex: 0n
    });

    const [, , , floorPrice] = await auction.getState();
    expect(floorPrice).to.equal(firstSalePrice);
    expect(firstState.floorPrice).to.equal(firstSalePrice);
  });

  it("second sale ratchets floor to previous sale price", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const openTime = await auction.openTime();
    const initial = deriveInitialState({
      openTime,
      genesisPrice: GENESIS_PRICE,
      genesisFloor: GENESIS_FLOOR,
      k: K
    });

    const t1 = openTime + 1_000n;
    const firstSalePrice = expectedAsk({
      now: t1,
      openTime,
      k: K,
      anchorTime: initial.anchorTime,
      floorPrice: initial.floorPrice
    });
    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const firstState = deriveNextState({
      now: t1,
      lastPrice: firstSalePrice,
      previousStartTime: openTime,
      k: K,
      pts: PTS,
      currentEpochIndex: 0n
    });

    const t2 = t1 + 10n;
    const secondSalePrice = expectedAsk({
      now: t2,
      openTime,
      k: K,
      anchorTime: firstState.anchorTime,
      floorPrice: firstState.floorPrice
    });
    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const [, , , floorPrice] = await auction.getState();
    expect(floorPrice).to.equal(secondSalePrice);
  });

  it("matches the hyperbolic formula after second sale", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const openTime = await auction.openTime();
    const initial = deriveInitialState({
      openTime,
      genesisPrice: GENESIS_PRICE,
      genesisFloor: GENESIS_FLOOR,
      k: K
    });

    const t1 = openTime + 1_000n;
    const t2 = t1 + 10n;
    const t3 = t2 + 10n;

    const firstSalePrice = expectedAsk({
      now: t1,
      openTime,
      k: K,
      anchorTime: initial.anchorTime,
      floorPrice: initial.floorPrice
    });
    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const firstState = deriveNextState({
      now: t1,
      lastPrice: firstSalePrice,
      previousStartTime: openTime,
      k: K,
      pts: PTS,
      currentEpochIndex: 0n
    });

    const secondSalePrice = expectedAsk({
      now: t2,
      openTime,
      k: K,
      anchorTime: firstState.anchorTime,
      floorPrice: firstState.floorPrice
    });
    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const secondState = deriveNextState({
      now: t2,
      lastPrice: secondSalePrice,
      previousStartTime: t1,
      k: K,
      pts: PTS,
      currentEpochIndex: 1n
    });

    await setNextBlockTimestamp(provider, t3);
    await mine(provider);

    const y = await auction.getCurrentPrice();
    const expectedY = expectedAsk({
      now: t3,
      openTime,
      k: K,
      anchorTime: secondState.anchorTime,
      floorPrice: secondState.floorPrice
    });

    expect(y).to.equal(expectedY);
  });

  it("increases post-sale pump when waiting longer between sales", async function () {
    const shortEnv = await deployERC20Env(ethers, { startDelaySec: 0n });
    const longEnv = await deployERC20Env(ethers, { startDelaySec: 0n });

    const openShort = await shortEnv.auction.openTime();
    const openLong = await longEnv.auction.openTime();

    const t1Short = openShort + 1_000n;
    const t1Long = openLong + 2_000n;
    const t2Short = t1Short + 5n;
    const t2Long = t1Long + 30n;

    await setNextBlockTimestamp(provider, t1Short);
    await (await shortEnv.auction.connect(shortEnv.alice).bid(LARGE_MAX_PRICE)).wait();
    await setNextBlockTimestamp(provider, t2Short);
    await (await shortEnv.auction.connect(shortEnv.alice).bid(LARGE_MAX_PRICE)).wait();

    await setNextBlockTimestamp(provider, t1Long);
    await (await longEnv.auction.connect(longEnv.alice).bid(LARGE_MAX_PRICE)).wait();
    await setNextBlockTimestamp(provider, t2Long);
    await (await longEnv.auction.connect(longEnv.alice).bid(LARGE_MAX_PRICE)).wait();

    const [, shortStart, shortAnchor, shortFloor] = await shortEnv.auction.getState();
    const [, longStart, longAnchor, longFloor] = await longEnv.auction.getState();

    const shortImmediateAsk = expectedAsk({
      now: shortStart,
      openTime: openShort,
      k: K,
      anchorTime: shortAnchor,
      floorPrice: shortFloor
    });
    const longImmediateAsk = expectedAsk({
      now: longStart,
      openTime: openLong,
      k: K,
      anchorTime: longAnchor,
      floorPrice: longFloor
    });

    const shortPump = shortImmediateAsk - shortFloor;
    const longPump = longImmediateAsk - longFloor;

    expect(shortPump).to.equal(5n);
    expect(longPump).to.equal(30n);
    expect(longPump).to.be.greaterThan(shortPump);
  });

  it("handles long-gap edge case where delta*pts > k", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const openTime = await auction.openTime();

    const t1 = openTime + 1_000n;
    const t2 = t1 + 1_000n; // premium = 1000 > k = 600

    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const [, startTime, anchorTime, floorPrice] = await auction.getState();
    expect(anchorTime).to.equal(startTime);
    expect(await auction.getCurrentPrice()).to.equal(floorPrice + K);

    await setNextBlockTimestamp(provider, t2 + 2n);
    await mine(provider);
    expect(await auction.getCurrentPrice()).to.equal(floorPrice + K / 2n);
  });

  it("does not brick when consecutive sales share the same timestamp", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const openTime = await auction.openTime();

    const t1 = openTime + 1_000n;
    const t2 = t1 + 10n;

    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    expect(await auction.epochIndex()).to.equal(3n);
  });
});
