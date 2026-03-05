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
import {
  deployERC20Env,
  getSaleEventFromReceipt,
  getSettledEventFromReceipt
} from "./helpers/fixtures.js";
import {
  deriveInitialState,
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

  it("emits correct Sale payload on first sale and matches state", async function () {
    const { auction, alice, adapter } = await deployERC20Env(ethers, { startDelaySec: 0n });
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
    const receipt = await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();
    const sale = await getSaleEventFromReceipt(auction, receipt);
    const settled = await getSettledEventFromReceipt(adapter, receipt);

    const model = deriveNextState({
      now: t1,
      lastPrice: firstSalePrice,
      previousStartTime: openTime,
      k: K,
      pts: PTS,
      currentEpochIndex: 0n,
      genesisFloor: GENESIS_FLOOR
    });

    expect(sale.buyer).to.equal(alice.address);
    expect(sale.price).to.equal(firstSalePrice);
    expect(sale.timestamp).to.equal(t1);
    expect(sale.nextAnchorA).to.equal(model.anchorTime);
    expect(sale.nextFloorB).to.equal(model.floorPrice);
    expect(sale.epochIndex).to.equal(model.epochIndex);
    expect(settled.epochIndex).to.equal(sale.epochIndex);
    expect(settled.tokenId).to.equal(FIRST_ID);

    const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();
    expect(active).to.equal(true);
    expect(epochIndex).to.equal(model.epochIndex);
    expect(startTime).to.equal(model.curveStartTime);
    expect(anchorTime).to.equal(model.anchorTime);
    expect(floorPrice).to.equal(model.floorPrice);
  });

  it("emits correct Sale payload on second sale and matches state", async function () {
    const { auction, alice, adapter } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const openTime = await auction.openTime();
    const initial = deriveInitialState({
      openTime,
      genesisPrice: GENESIS_PRICE,
      genesisFloor: GENESIS_FLOOR,
      k: K
    });

    const t1 = openTime + 1_000n;
    const t2 = t1 + 10n;

    const firstSalePrice = expectedAsk({
      now: t1,
      openTime,
      k: K,
      anchorTime: initial.anchorTime,
      floorPrice: initial.floorPrice
    });
    await setNextBlockTimestamp(provider, t1);
    await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();

    const firstModel = deriveNextState({
      now: t1,
      lastPrice: firstSalePrice,
      previousStartTime: openTime,
      k: K,
      pts: PTS,
      currentEpochIndex: 0n,
      genesisFloor: GENESIS_FLOOR
    });

    const secondSalePrice = expectedAsk({
      now: t2,
      openTime,
      k: K,
      anchorTime: firstModel.anchorTime,
      floorPrice: firstModel.floorPrice
    });
    await setNextBlockTimestamp(provider, t2);
    const receipt = await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();
    const sale = await getSaleEventFromReceipt(auction, receipt);
    const settled = await getSettledEventFromReceipt(adapter, receipt);

    const secondModel = deriveNextState({
      now: t2,
      lastPrice: secondSalePrice,
      previousStartTime: t1,
      k: K,
      pts: PTS,
      currentEpochIndex: 1n,
      genesisFloor: GENESIS_FLOOR
    });

    expect(sale.buyer).to.equal(alice.address);
    expect(sale.price).to.equal(secondSalePrice);
    expect(sale.timestamp).to.equal(t2);
    expect(sale.nextAnchorA).to.equal(secondModel.anchorTime);
    expect(sale.nextFloorB).to.equal(secondModel.floorPrice);
    expect(sale.epochIndex).to.equal(secondModel.epochIndex);
    expect(settled.epochIndex).to.equal(sale.epochIndex);
    expect(settled.tokenId).to.equal(FIRST_ID + 1n);

    const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();
    expect(active).to.equal(true);
    expect(epochIndex).to.equal(secondModel.epochIndex);
    expect(startTime).to.equal(secondModel.curveStartTime);
    expect(anchorTime).to.equal(secondModel.anchorTime);
    expect(floorPrice).to.equal(secondModel.floorPrice);
  });

  it("replays multiple epochs from on-chain events without drift", async function () {
    const { auction, alice, adapter } = await deployERC20Env(ethers, { startDelaySec: 0n });
    const openTime = await auction.openTime();
    const saleTimes = [openTime + 1_000n, openTime + 1_010n, openTime + 1_030n, openTime + 1_075n];

    let model = deriveInitialState({
      openTime,
      genesisPrice: GENESIS_PRICE,
      genesisFloor: GENESIS_FLOOR,
      k: K
    });
    let expectedTokenId = FIRST_ID;

    for (const t of saleTimes) {
      const expectedSalePrice = expectedAsk({
        now: t,
        openTime,
        k: K,
        anchorTime: model.anchorTime,
        floorPrice: model.floorPrice
      });

      await setNextBlockTimestamp(provider, t);
      const receipt = await (await auction.connect(alice).bid(LARGE_MAX_PRICE)).wait();
      const sale = await getSaleEventFromReceipt(auction, receipt);
      const settled = await getSettledEventFromReceipt(adapter, receipt);

      const nextModel = deriveNextState({
        now: t,
        lastPrice: expectedSalePrice,
        previousStartTime: model.curveStartTime,
        k: K,
        pts: PTS,
        currentEpochIndex: model.epochIndex,
        genesisFloor: GENESIS_FLOOR
      });

      expect(sale.price).to.equal(expectedSalePrice);
      expect(sale.epochIndex).to.equal(nextModel.epochIndex);
      expect(sale.nextAnchorA).to.equal(nextModel.anchorTime);
      expect(sale.nextFloorB).to.equal(nextModel.floorPrice);
      expect(settled.epochIndex).to.equal(nextModel.epochIndex);
      expect(settled.tokenId).to.equal(expectedTokenId);

      const [epochIndex, startTime, anchorTime, floorPrice, active] = await auction.getState();
      expect(active).to.equal(true);
      expect(epochIndex).to.equal(nextModel.epochIndex);
      expect(startTime).to.equal(nextModel.curveStartTime);
      expect(anchorTime).to.equal(nextModel.anchorTime);
      expect(floorPrice).to.equal(nextModel.floorPrice);

      model = nextModel;
      expectedTokenId += 1n;
    }

    const tSample = saleTimes[saleTimes.length - 1] + 9n;
    await setNextBlockTimestamp(provider, tSample);
    await mine(provider);

    const expectedPrice = expectedAsk({
      now: tSample,
      openTime,
      k: K,
      anchorTime: model.anchorTime,
      floorPrice: model.floorPrice
    });
    expect(await auction.getCurrentPrice()).to.equal(expectedPrice);
  });
});
