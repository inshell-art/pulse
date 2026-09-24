import { expect } from "chai";
import hre from "hardhat";
import * as model from "./helpers/pulseCoreSpecModel.js";

const { U64_MAX: U64, U128_MAX: U128, U256_MAX: U256 } = model;
const asState = (s) => ({
  epochIndex: s.epochIndex, openTime: s.openTime, curveStartTime: s.curveStartTime,
  anchorTime: s.anchorTime, floorPrice: s.floorPrice
});

describe("PulseCoreV1 review regressions", function () {
  let conn, ethers, core;
  before(async function () {
    conn = await hre.network.connect();
    ethers = conn.ethers;
    core = await ethers.deployContract("PulseCoreV1");
    await core.waitForDeployment();
  });
  after(async function () { await conn.close(); });

  async function agrees(method, args) {
    let expected;
    try { expected = model[method](...args); }
    catch (error) {
      if (!(error instanceof model.CoreSpecError)) throw error;
      await expect(core[method](...args)).to.be.revertedWithCustomError(core, error.name).withArgs(...error.args);
      return null;
    }
    const actual = await core[method](...args);
    if (method === "quote") expect(actual).to.equal(expected);
    else if (method === "initialize") expect(asState(actual)).to.deep.equal(expected);
    else expect({ ask: actual.ask, nextState: asState(actual.nextState) }).to.deep.equal(expected);
    return expected;
  }

  it("matches the bounded model across wide integers, near-max prices and terminal timestamps", async function () {
    let seed = 0;
    const random = (bound) => BigInt(ethers.keccak256(ethers.toUtf8Bytes(`pulse-review/${seed++}`))) % bound;
    let transitions = 0, rejected = 0;
    for (let sample = 0; sample < 256; sample++) {
      const width = [1, 8, 64, 96, 127, 128][sample % 6];
      const pts = 1n + random((1n << BigInt(width)) - 1n);
      expect(pts).to.be.at.most(U128);
      const distance = 1n + random(1n << 62n);
      const k = distance * pts + random(pts);
      const gap = pts; // Admits a launch while exercising up to 190-bit k.
      const floor = sample % 3 === 0 ? U256 - gap - random(k + 1n) : random(U256 - gap);
      const config = { k, pts, genesisFloor: floor, genesisPrice: floor + gap };
      const start = distance + 1n + random(U64 - distance - 1n);
      let s = await agrees("initialize", [config, start]);
      if (!s) { rejected++; continue; }
      await agrees("quote", [config, s, 0n]);
      for (const timestamp of [start, start + (U64 - start) / 2n, U64]) {
        const before = model.quote(config, s, timestamp);
        await agrees("quote", [config, s, timestamp]);
        expect(before).to.be.at.least(s.floorPrice);
        expect(model.quote(config, s, U64)).to.be.at.most(before);
        const result = await agrees("advance", [config, s, timestamp]);
        if (!result) { rejected++; break; }
        transitions++;
        expect(result.ask).to.equal(before);
        expect(result.nextState.floorPrice).to.equal(before);
        expect(result.nextState.openTime).to.equal(start);
        expect(result.nextState.epochIndex).to.equal(s.epochIndex + 1n);
        expect(result.nextState.anchorTime).to.be.greaterThan(0n).and.at.most(timestamp);
        s = result.nextState;
        await agrees("quote", [config, s, timestamp]);
      }
    }
    expect(transitions).to.be.greaterThan(400);
    expect(rejected).to.be.greaterThan(0);
  });

  it("rejects corrupted snapshots and coexisting faults with model-defined errors, never arithmetic panics", async function () {
    const configs = [
      { k: 600n, pts: 1n, genesisPrice: 1000n, genesisFloor: 900n },
      { k: U128 * (1n << 60n), pts: U128, genesisPrice: U128, genesisFloor: 0n }
    ];
    for (const config of configs) {
      const start = config.k / config.pts + 100n;
      const initial = model.initialize(config, start);
      const mutations = [
        { anchorTime: 0n }, { anchorTime: U64 }, { curveStartTime: start - 1n },
        { openTime: 0n }, { floorPrice: U256 }, { epochIndex: U64 },
        { epochIndex: U64, anchorTime: 0n }, { floorPrice: U256, curveStartTime: 0n }
      ];
      for (const mutation of mutations) {
        for (const epochIndex of [0n, 1n]) {
          const s = { ...initial, epochIndex, ...mutation };
          for (const timestamp of [0n, start, U64]) {
            await agrees("quote", [config, s, timestamp]);
            await agrees("advance", [config, s, timestamp]);
          }
        }
      }
    }
  });

  it("can enter the terminal epoch, quote it, and reject only its next advancement", async function () {
    const config = { k: 1n, pts: 1n, genesisPrice: 1n, genesisFloor: 0n };
    const s = { ...model.initialize(config, 100n), epochIndex: U64 - 1n };
    const { nextState } = await agrees("advance", [config, s, U64]);
    expect(nextState.epochIndex).to.equal(U64);
    await agrees("quote", [config, nextState, U64]);
    await agrees("advance", [config, nextState, U64]);
  });

  it("rejects truncated calldata and noncanonical uint64 words at the deployed ABI boundary", async function () {
    const config = { k: 600n, pts: 1n, genesisPrice: 1000n, genesisFloor: 900n };
    const s = model.initialize(config, 1000n);
    const address = await core.getAddress();
    for (const method of ["initialize", "quote", "advance"]) {
      const data = core.interface.encodeFunctionData(method, method === "initialize" ? [config, 1000n] : [config, s, 1000n]);
      await expect(ethers.provider.call({ to: address, data: data.slice(0, -2) })).to.revert(ethers);
      const slots = method === "initialize" ? [4] : [4, 5, 6, 7, 9];
      for (const slot of slots) {
        const offset = 10 + slot * 64;
        const dirty = data.slice(0, offset) + ethers.toBeHex(1n << 64n, 32).slice(2) + data.slice(offset + 64);
        await expect(ethers.provider.call({ to: address, data: dirty })).to.revert(ethers);
      }
    }
  });
});
