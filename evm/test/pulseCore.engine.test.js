import { readFileSync } from "node:fs";
import { expect } from "chai";
import hre from "hardhat";
import * as model from "./helpers/pulseCoreSpecModel.js";
import { setNextBlockTimestamp, mine } from "./helpers/time.js";

const snapshot = JSON.parse(readFileSync(new URL("./fixtures/pulseCore.v1.abi.json", import.meta.url)));
const vectors = JSON.parse(readFileSync(new URL("./fixtures/pulseCore.v1.vectors.json", import.meta.url)));

function integers(value) {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (Array.isArray(value)) return value.map(integers);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, integers(item)]));
  }
  return value;
}

function resolve(value, table) {
  return integers(typeof value === "string" ? table[value] : value);
}

function stateValue(value) {
  return {
    epochIndex: value.epochIndex,
    openTime: value.openTime,
    curveStartTime: value.curveStartTime,
    anchorTime: value.anchorTime,
    floorPrice: value.floorPrice
  };
}

function xorshift32(seed) {
  let x = seed >>> 0;
  return (limit) => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return BigInt(x >>> 0) % limit;
  };
}

function deployedOpcodes(bytecode) {
  const hex = bytecode.slice(2);
  const metadataLength = Number.parseInt(hex.slice(-4), 16);
  const code = hex.slice(0, hex.length - (metadataLength + 2) * 2);
  const opcodes = [];
  for (let i = 0; i < code.length; i += 2) {
    const opcode = Number.parseInt(code.slice(i, i + 2), 16);
    opcodes.push(opcode);
    if (opcode >= 0x60 && opcode <= 0x7f) i += 2 * (opcode - 0x5f);
  }
  return opcodes;
}

describe("PulseCoreV1 deployed engine", function () {
  let conn;
  let ethers;
  let provider;
  let core;

  before(async function () {
    conn = await hre.network.connect();
    ethers = conn.ethers;
    provider = conn.provider;
    core = await ethers.deployContract("PulseCoreV1");
    await core.waitForDeployment();
  });

  after(async function () {
    await conn.close();
  });

  it("implements the frozen ABI and version without storage or interactions", async function () {
    const artifact = await hre.artifacts.readArtifact("PulseCoreV1");
    expect(artifact.abi).to.deep.equal(snapshot.abi);
    expect(await core.version()).to.equal(snapshot.versionId);
    expect(artifact.linkReferences).to.deep.equal({});
    expect(artifact.deployedLinkReferences).to.deep.equal({});

    const forbidden = new Map([
      [0x30, "ADDRESS"], [0x31, "BALANCE"], [0x32, "ORIGIN"], [0x33, "CALLER"],
      [0x3b, "EXTCODESIZE"], [0x3c, "EXTCODECOPY"], [0x3f, "EXTCODEHASH"],
      [0x40, "BLOCKHASH"], [0x41, "COINBASE"], [0x42, "TIMESTAMP"], [0x43, "NUMBER"],
      [0x44, "PREVRANDAO"], [0x45, "GASLIMIT"], [0x46, "CHAINID"], [0x47, "SELFBALANCE"],
      [0x48, "BASEFEE"], [0x49, "BLOBHASH"], [0x4a, "BLOBBASEFEE"],
      [0x5c, "TLOAD"], [0x5d, "TSTORE"],
      [0x54, "SLOAD"], [0x55, "SSTORE"], [0xf0, "CREATE"], [0xf1, "CALL"],
      [0xf2, "CALLCODE"], [0xf4, "DELEGATECALL"], [0xf5, "CREATE2"],
      [0xfa, "STATICCALL"], [0xff, "SELFDESTRUCT"]
    ]);
    for (let opcode = 0xa0; opcode <= 0xa4; opcode++) forbidden.set(opcode, `LOG${opcode - 0xa0}`);
    const opcodes = deployedOpcodes(await ethers.provider.getCode(await core.getAddress()));
    for (const [opcode, name] of forbidden) {
      expect(opcodes, `unexpected ${name} opcode`).not.to.include(opcode);
    }
  });

  for (const vector of vectors.cases) {
    it(`executes frozen vector: ${vector.id}`, async function () {
      const config = resolve(vector.config, vectors.configs);
      const state = vector.state === undefined ? undefined : resolve(vector.state, vectors.states);
      const args = vector.method === "initialize"
        ? [config, BigInt(vector.startTime)]
        : [config, state, BigInt(vector.timestamp)];
      const call = core[vector.method].staticCall(...args);
      if (vector.error) {
        await expect(call)
          .to.be.revertedWithCustomError(core, vector.error.name)
          .withArgs(...integers(vector.error.args));
        return;
      }

      const actual = await call;
      const expected = integers(vector.expected);
      if (vector.method === "initialize") {
        const state = stateValue(actual);
        expect(state).to.deep.equal(expected);
        expect(await core.quote(config, state, state.openTime)).to.equal(model.quote(config, expected, expected.openTime));
      } else if (vector.method === "quote") {
        expect(actual).to.equal(expected);
      } else {
        expect(actual.ask).to.equal(expected.ask);
        const next = stateValue(actual.nextState);
        expect(next).to.deep.equal(expected.nextState);
        expect(await core.quote(config, next, BigInt(vector.timestamp)))
          .to.equal(model.quote(config, expected.nextState, BigInt(vector.timestamp)));
      }
    });
  }

  it("matches the independent bounded model across 512 multi-epoch transitions", async function () {
    const random = xorshift32(0x50554c53);
    for (let sample = 0; sample < 64; sample++) {
      const k = 1n + random(1_000_000n);
      const floor = random(1_000_000_000n);
      const config = {
        k,
        genesisPrice: floor + 1n + random(k),
        genesisFloor: floor,
        pts: 1n + random(2n * k)
      };
      const openTime = 1_000_000n + random(10_000n);
      let state = stateValue(await core.initialize(config, openTime));
      expect(state).to.deep.equal(model.initialize(config, openTime));
      expect(await core.quote(config, state, 0n)).to.equal(await core.quote(config, state, openTime));

      for (let epoch = 0; epoch < 8; epoch++) {
        const elapsed = epoch % 4 === 0 ? 0n : random(50_000n);
        const timestamp = state.curveStartTime + elapsed;
        const ask = await core.quote(config, state, timestamp);
        expect(ask).to.equal(model.quote(config, state, timestamp));
        expect(ask).to.equal((await core.advance(config, state, timestamp)).ask);
        expect(ask).to.be.at.least(state.floorPrice);
        expect(await core.quote(config, state, timestamp + 1n)).to.be.at.most(ask);

        const actual = await core.advance(config, state, timestamp);
        const next = stateValue(actual.nextState);
        expect({ ask: actual.ask, nextState: next })
          .to.deep.equal(model.advance(config, state, timestamp));
        expect(next.epochIndex).to.equal(state.epochIndex + 1n);
        expect(next.openTime).to.equal(state.openTime);
        expect(next.curveStartTime).to.equal(timestamp);
        expect(next.floorPrice).to.equal(ask);
        expect(await core.quote(config, next, timestamp)).to.be.at.least(ask);
        state = next;
      }
    }
  });

  it("is independent of caller and leaves no balance, logs or stored state", async function () {
    const [, alice, bob] = await ethers.getSigners();
    const config = resolve(vectors.configs.base, vectors.configs);
    const state = resolve(vectors.states.initial, vectors.states);
    const address = await core.getAddress();
    expect(await core.connect(alice).quote(config, state, 1001n))
      .to.equal(await core.connect(bob).quote(config, state, 1001n));
    expect(await core.connect(alice).advance(config, state, 1010n))
      .to.deep.equal(await core.connect(bob).advance(config, state, 1010n));

    const data = core.interface.encodeFunctionData("advance", [config, state, 1010n]);
    const receipt = await (await alice.sendTransaction({ to: address, data })).wait();
    expect(receipt.logs).to.have.length(0);
    expect(await ethers.provider.getBalance(address)).to.equal(0n);
    for (let slot = 0; slot < 5; slot++) {
      expect(await ethers.provider.getStorage(address, slot)).to.equal(ethers.ZeroHash);
    }
    expect(await core.quote(config, state, 1001n)).to.equal(985n);
    await expect(alice.sendTransaction({ to: address, data, value: 1n })).to.revert(ethers);
  });

  it("agrees with legacy Solidity on sales and stored curve states in the common domain", async function () {
    const random = xorshift32(0x41b0057);
    const [deployer, , , treasury] = await ethers.getSigners();
    const Auction = await ethers.getContractFactory("PulseAuction", deployer);
    const Adapter = await ethers.getContractFactory("StubAdapter", deployer);

    for (let sample = 0; sample < 12; sample++) {
      const k = 1n + random(1000n);
      const floor = random(1000n);
      const config = {
        k,
        genesisPrice: floor + 1n + random(k),
        genesisFloor: floor,
        pts: 1n + random(2n * k)
      };
      const latest = await ethers.provider.getBlock("latest");
      const openTime = BigInt(latest.timestamp) + 100n;
      const auction = await Auction.deploy(
        openTime, k, config.genesisPrice, floor, config.pts,
        ethers.ZeroAddress, treasury.address, ethers.ZeroAddress
      );
      await auction.waitForDeployment();
      const adapter = await Adapter.deploy(await auction.getAddress(), 1n);
      await adapter.waitForDeployment();
      await (await auction.initializeMintAdapter(await adapter.getAddress())).wait();

      let state = stateValue(await core.initialize(config, openTime));
      const beforeOpen = await auction.getCurrentPrice();
      expect(beforeOpen).to.equal(await core.quote(config, state, openTime - 1n));
      expect(state.epochIndex).to.equal(await auction.epochIndex());
      expect(state.anchorTime).to.equal(await auction.anchorTime());
      expect(state.floorPrice).to.equal(await auction.floorPrice());

      for (let epoch = 0; epoch < 4; epoch++) {
        const elapsed = epoch === 0 ? 0n : (epoch === 1 ? 0n : 1n + random(100n));
        const timestamp = state.curveStartTime + elapsed;
        await setNextBlockTimestamp(provider, timestamp);
        await mine(provider);

        const legacyAsk = await auction.getCurrentPrice();
        const coreAsk = await core.quote(config, state, timestamp);
        expect(coreAsk).to.equal(legacyAsk);
        const expected = await core.advance(config, state, timestamp);
        await setNextBlockTimestamp(provider, timestamp);
        const receipt = await (await auction.bid(coreAsk, { value: coreAsk })).wait();
        const sales = await auction.queryFilter(auction.filters.Sale(), receipt.blockNumber, receipt.blockNumber);
        expect(sales).to.have.length(1);
        expect(sales[0].args.price).to.equal(coreAsk);
        expect(sales[0].args.epochIndex).to.equal(expected.nextState.epochIndex);
        state = stateValue(expected.nextState);
        expect(state.epochIndex).to.equal(await auction.epochIndex());
        expect(state.curveStartTime).to.equal(await auction.curveStartTime());
        expect(state.anchorTime).to.equal(await auction.anchorTime());
        expect(state.floorPrice).to.equal(await auction.floorPrice());
      }
    }
  });
});
