import { expect } from "chai";
import hre from "hardhat";
import {
  GENESIS_FLOOR,
  GENESIS_PRICE,
  K,
  LARGE_MAX_PRICE,
  PTS
} from "./helpers/constants.js";
import { deployERC20Env, getSaleEventFromReceipt } from "./helpers/fixtures.js";
import {
  deriveGenesisState,
  deriveNextState,
  expectedAsk
} from "./helpers/pulseModel.js";
import { mine, setNextBlockTimestamp } from "./helpers/time.js";

describe("PulseAuction Observability (Solidity)", function () {
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

  it("emits correct Sale payload at genesis and matches state", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);

    const receipt = await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();
    const sale = await getSaleEventFromReceipt(auction, receipt);

    const model = deriveGenesisState({
      t: t1,
      genesisPrice: GENESIS_PRICE,
      genesisFloor: GENESIS_FLOOR,
      k: K
    });

    expect(sale.buyer).to.equal(alice.address);
    expect(sale.price).to.equal(GENESIS_PRICE);
    expect(sale.timestamp).to.equal(t1);
    expect(sale.anchorA).to.equal(model.anchorTime);
    expect(sale.floorB).to.equal(model.floorPrice);
    expect(sale.epochIndex).to.equal(1n);

    const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();
    expect(active).to.equal(true);
    expect(epochIndex).to.equal(model.epochIndex);
    expect(startTime).to.equal(model.curveStartTime);
    expect(anchorTime).to.equal(model.anchorTime);
    expect(floorPrice).to.equal(model.floorPrice);
  });

  it("emits correct Sale payload on second sale and matches state", async function () {
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

    const askAtSecondSale = expectedAsk({
      now: t2,
      curveActive: true,
      genesisPrice: GENESIS_PRICE,
      k: K,
      anchorTime: genesisModel.anchorTime,
      floorPrice: genesisModel.floorPrice
    });

    await setNextBlockTimestamp(provider, t2);
    const receipt = await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();
    const sale = await getSaleEventFromReceipt(auction, receipt);

    const model = deriveNextState({
      now: t2,
      lastPrice: askAtSecondSale,
      previousStartTime: t1,
      k: K,
      pts: PTS,
      currentEpochIndex: 1n
    });

    expect(sale.buyer).to.equal(alice.address);
    expect(sale.price).to.equal(askAtSecondSale);
    expect(sale.timestamp).to.equal(t2);
    expect(sale.anchorA).to.equal(model.anchorTime);
    expect(sale.floorB).to.equal(model.floorPrice);
    expect(sale.epochIndex).to.equal(model.epochIndex);

    const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();
    expect(active).to.equal(true);
    expect(epochIndex).to.equal(model.epochIndex);
    expect(startTime).to.equal(model.curveStartTime);
    expect(anchorTime).to.equal(model.anchorTime);
    expect(floorPrice).to.equal(model.floorPrice);
  });

  it("replays multiple epochs from on-chain events without drift", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    const openTime = await auction.openTime();
    const saleTimes = [openTime + 1_000n, openTime + 1_010n, openTime + 1_030n, openTime + 1_075n];

    let model = {
      curveActive: false,
      epochIndex: 0n,
      curveStartTime: 0n,
      anchorTime: 0n,
      floorPrice: 0n
    };

    for (const t of saleTimes) {
      const expectedSalePrice = expectedAsk({
        now: t,
        curveActive: model.curveActive,
        genesisPrice: GENESIS_PRICE,
        k: K,
        anchorTime: model.anchorTime,
        floorPrice: model.floorPrice
      });

      await setNextBlockTimestamp(provider, t);
      const receipt = await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();
      const sale = await getSaleEventFromReceipt(auction, receipt);

      const nextModel = model.curveActive
        ? deriveNextState({
            now: t,
            lastPrice: expectedSalePrice,
            previousStartTime: model.curveStartTime,
            k: K,
            pts: PTS,
            currentEpochIndex: model.epochIndex
          })
        : deriveGenesisState({
            t,
            genesisPrice: GENESIS_PRICE,
            genesisFloor: GENESIS_FLOOR,
            k: K
          });

      expect(sale.price).to.equal(expectedSalePrice);
      expect(sale.epochIndex).to.equal(nextModel.epochIndex);
      expect(sale.anchorA).to.equal(nextModel.anchorTime);
      expect(sale.floorB).to.equal(nextModel.floorPrice);

      const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();
      expect(active).to.equal(true);
      expect(epochIndex).to.equal(nextModel.epochIndex);
      expect(startTime).to.equal(nextModel.curveStartTime);
      expect(anchorTime).to.equal(nextModel.anchorTime);
      expect(floorPrice).to.equal(nextModel.floorPrice);

      model = nextModel;
    }

    const tSample = saleTimes[saleTimes.length - 1] + 9n;
    await setNextBlockTimestamp(provider, tSample);
    await mine(provider);

    const expectedPrice = expectedAsk({
      now: tSample,
      curveActive: model.curveActive,
      genesisPrice: GENESIS_PRICE,
      k: K,
      anchorTime: model.anchorTime,
      floorPrice: model.floorPrice
    });
    expect(await auction.getCurrentPrice()).to.equal(expectedPrice);
  });
});
