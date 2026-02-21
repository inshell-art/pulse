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
  deriveGenesisState,
  deriveNextState,
  expectedAsk,
  priceAt
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

  it("constructor config and initial price", async function () {
    const { auction } = await deployERC20Env(ethers, { startDelaySec: 0n });

    const [openTime, gp, gf, k, pts] = await auction.getConfig();
    expect(openTime).to.be.greaterThan(0n);
    expect(gp).to.equal(GENESIS_PRICE);
    expect(gf).to.equal(GENESIS_FLOOR);
    expect(k).to.equal(K);
    expect(pts).to.equal(PTS);

    expect(await auction.curveActive()).to.equal(false);
    expect(await auction.getCurrentPrice()).to.equal(GENESIS_PRICE);
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

    const openTime = await auction.openTime();
    await setNextBlockTimestamp(provider, openTime);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();
  });

  it("keeps genesis price fixed before the first sale regardless of elapsed time", async function () {
    const { auction } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const latestBlock = await ethers.provider.getBlock("latest");
    const baseTime = BigInt(latestBlock.timestamp) + 1n;

    for (const offset of [0n, 5n, 120n, 5_000n]) {
      await setNextBlockTimestamp(provider, baseTime + offset);
      await mine(provider);
      expect(await auction.getCurrentPrice()).to.equal(GENESIS_PRICE);
      expect(await auction.curveActive()).to.equal(false);
    }
  });

  it("decays monotonically after genesis and stays above floor", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    const samples = [];
    for (const t of [t1 + 1n, t1 + 5n, t1 + 25n, t1 + 120n]) {
      await setNextBlockTimestamp(provider, t);
      await mine(provider);
      samples.push(await auction.getCurrentPrice());
    }

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i - 1]).to.be.greaterThanOrEqual(samples[i]);
      expect(samples[i]).to.be.greaterThanOrEqual(GENESIS_FLOOR);
    }
  });

  it("matches the hyperbolic formula after second sale", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    const t1 = (await auction.openTime()) + 1_000n;
    const t2 = t1 + 10n;
    const t3 = t2 + 10n;

    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    const anchor1 = calculateAnchorTime(GENESIS_PRICE, GENESIS_FLOOR, K, t1);
    const lastPriceAtT2 = priceAt(t2, K, anchor1, GENESIS_FLOOR);

    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const postSecondState = deriveNextState({
      now: t2,
      lastPrice: lastPriceAtT2,
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
      curveActive: true,
      genesisPrice: GENESIS_PRICE,
      k: K,
      anchorTime: postSecondState.anchorTime,
      floorPrice: postSecondState.floorPrice
    });

    expect(y).to.equal(expectedY);
  });

  it("updates state (anchor/floor/start/epoch) correctly after second sale", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    const t1 = (await auction.openTime()) + 1_000n;
    const t2 = t1 + 10n;

    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    const genesisModel = deriveGenesisState({
      t: t1,
      genesisPrice: GENESIS_PRICE,
      genesisFloor: GENESIS_FLOOR,
      k: K
    });

    const lastPriceAtT2 = expectedAsk({
      now: t2,
      curveActive: true,
      genesisPrice: GENESIS_PRICE,
      k: K,
      anchorTime: genesisModel.anchorTime,
      floorPrice: genesisModel.floorPrice
    });

    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const model = deriveNextState({
      now: t2,
      lastPrice: lastPriceAtT2,
      previousStartTime: t1,
      k: K,
      pts: PTS,
      currentEpochIndex: 1n
    });

    const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();

    expect(active).to.equal(true);
    expect(epochIndex).to.equal(model.epochIndex);
    expect(startTime).to.equal(model.curveStartTime);
    expect(anchorTime).to.equal(model.anchorTime);
    expect(floorPrice).to.equal(model.floorPrice);
  });

  it("increases the post-sale pump component when waiting longer between sales", async function () {
    const shortEnv = await deployERC20Env(ethers, { startDelaySec: 0n });
    const longEnv = await deployERC20Env(ethers, { startDelaySec: 0n });

    const t1Short = (await shortEnv.auction.openTime()) + 1_000n;
    const t1Long = (await longEnv.auction.openTime()) + 2_000n;
    const t2Short = t1Short + 5n;
    const t2Long = t1Long + 30n;

    await setNextBlockTimestamp(provider, t1Short);
    await (await shortEnv.auction.connect(shortEnv.alice).bid(GENESIS_PRICE)).wait();
    await setNextBlockTimestamp(provider, t2Short);
    await (await shortEnv.auction.connect(shortEnv.alice).bid(LARGE_MAX_PRICE)).wait();

    await setNextBlockTimestamp(provider, t1Long);
    await (await longEnv.auction.connect(longEnv.alice).bid(GENESIS_PRICE)).wait();
    await setNextBlockTimestamp(provider, t2Long);
    await (await longEnv.auction.connect(longEnv.alice).bid(LARGE_MAX_PRICE)).wait();

    const [, shortStart, shortAnchor, shortFloor] = await shortEnv.auction.getState();
    const [, longStart, longAnchor, longFloor] = await longEnv.auction.getState();

    const shortImmediateAsk = expectedAsk({
      now: shortStart,
      curveActive: true,
      genesisPrice: GENESIS_PRICE,
      k: K,
      anchorTime: shortAnchor,
      floorPrice: shortFloor
    });
    const longImmediateAsk = expectedAsk({
      now: longStart,
      curveActive: true,
      genesisPrice: GENESIS_PRICE,
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

    const t1 = (await auction.openTime()) + 1_000n;
    const t2 = t1 + 1_000n; // premium = 1000 > k = 600

    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    await setNextBlockTimestamp(provider, t2);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const [, startTime, anchorTime, floorPrice] = await auction.getState();
    expect(anchorTime).to.equal(startTime);

    // At the settlement timestamp, implementation clamps to floor + k when now <= anchor.
    expect(await auction.getCurrentPrice()).to.equal(floorPrice + K);

    await setNextBlockTimestamp(provider, t2 + 2n);
    await mine(provider);

    // One second after the asymptote zone, it follows k/(now-a)+floor.
    expect(await auction.getCurrentPrice()).to.equal(floorPrice + K / 2n);
  });
});
