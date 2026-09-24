import { readFileSync } from "node:fs";
import { expect } from "chai";
import { Interface, id } from "ethers";
import hre from "hardhat";
import * as spec from "./helpers/pulseCoreSpecModel.js";
import {
  deriveInitialState,
  deriveNextState,
  expectedAsk
} from "./helpers/pulseModel.js";

const readFixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const snapshot = readFixture("pulseCore.v1.abi.json");
const vectors = readFixture("pulseCore.v1.vectors.json");

function integers(value) {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (Array.isArray(value)) return value.map(integers);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, integers(v)]));
  }
  return value;
}

function resolve(value, table) {
  return integers(typeof value === "string" ? table[value] : value);
}

describe("PulseCore V1 frozen specification (interface and model; no engine deployed)", function () {
  it("freezes the complete interface ABI, including tuple names/order and errors", async function () {
    const artifact = await hre.artifacts.readArtifact("IPulseCore");
    expect(artifact.abi).to.deep.equal(snapshot.abi);
    expect(artifact.bytecode).to.equal("0x");
    const funcs = artifact.abi.filter((f) => f.type === "function");
    expect(funcs.map((f) => f.name).sort()).to.deep.equal(["advance", "initialize", "quote", "version"]);
    for (const f of funcs) expect(f.stateMutability).to.equal("pure");
    expect(artifact.abi.every((f) => ["function", "error"].includes(f.type))).to.equal(true);
  });

  it("freezes selectors and the semantics version identifier", function () {
    const iface = new Interface(snapshot.abi);
    const selectors = iface.fragments
      .filter((f) => f.type === "function" || f.type === "error")
      .map((f) => ({ type: f.type, signature: f.format("sighash"), selector: f.selector }))
      .sort((a, b) => a.signature.localeCompare(b.signature));
    expect(selectors).to.deep.equal(snapshot.selectors);
    expect(new Set(selectors.map((s) => s.selector)).size).to.equal(selectors.length);
    expect(snapshot.semantics).to.equal("pulse-core/1.0.0");
    expect(vectors.semantics).to.equal(snapshot.semantics);
    expect(snapshot.versionId).to.equal(id("pulse-core/1.0.0"));
  });

  for (const vector of vectors.cases) {
    it(`golden vector: ${vector.id}`, function () {
      const config = Object.freeze(resolve(vector.config, vectors.configs));
      const state = vector.state === undefined ? undefined : Object.freeze(resolve(vector.state, vectors.states));
      const args = vector.method === "initialize"
        ? [config, BigInt(vector.startTime)]
        : [config, state, BigInt(vector.timestamp)];
      if (vector.error) {
        let error;
        try {
          spec[vector.method](...args);
        } catch (caught) {
          error = caught;
        }
        expect(error).to.be.instanceOf(spec.CoreSpecError);
        expect(error.name).to.equal(vector.error.name);
        expect(error.args).to.deep.equal(integers(vector.error.args));
        // Every promised domain error and argument list must be ABI-encodable.
        const iface = new Interface(snapshot.abi);
        const encoded = iface.encodeErrorResult(error.name, error.args);
        const decoded = iface.parseError(encoded);
        expect(decoded.name).to.equal(vector.error.name);
        expect(Array.from(decoded.args)).to.deep.equal(integers(vector.error.args));
      } else {
        const result = spec[vector.method](...args);
        expect(result).to.deep.equal(integers(vector.expected));
        expect(spec[vector.method](...args)).to.deep.equal(result);
        if (vector.method === "initialize") {
          expect(() => spec.quote(config, result, result.openTime)).not.to.throw();
        }
        if (vector.method === "advance") {
          expect(result.ask).to.equal(spec.quote(config, state, BigInt(vector.timestamp)));
          expect(() => spec.quote(config, result.nextState, BigInt(vector.timestamp))).not.to.throw();
        }
      }
    });
  }

  it("covers every specified custom error with a literal vector", function () {
    const actual = [...new Set(vectors.cases.filter((v) => v.error).map((v) => v.error.name))].sort();
    const expected = snapshot.abi.filter((f) => f.type === "error").map((f) => f.name).sort();
    expect(actual).to.deep.equal(expected);
    expect(new Set(vectors.cases.map((v) => v.id)).size).to.equal(vectors.cases.length);
  });

  it("matches the independent legacy model over 1,536 admitted transitions", function () {
    let seed = 0x50554c53n;
    const random = (limit) => {
      seed = (1664525n * seed + 1013904223n) & 0xffffffffn;
      return seed % limit;
    };

    for (let sample = 0; sample < 128; sample++) {
      const k = 1n + random(1000000n);
      const genesisFloor = random(1000000000n);
      const config = Object.freeze({
        k,
        genesisFloor,
        genesisPrice: genesisFloor + 1n + random(k),
        pts: 1n + random(2n * k)
      });
      const openTime = 10000000n + random(1000n);
      let state = spec.initialize(config, openTime);
      expect(state).to.deep.equal({ ...deriveInitialState({ ...config, openTime }), openTime });
      expect(spec.quote(config, state, 0n)).to.equal(spec.quote(config, state, openTime));

      for (let epoch = 0; epoch < 12; epoch++) {
        Object.freeze(state);
        const elapsed = epoch % 3 === 0 ? 0n : random(2000000n);
        const now = state.curveStartTime + elapsed;
        const ask = spec.quote(config, state, now);
        const legacyAsk = expectedAsk({ now, openTime, k, anchorTime: state.anchorTime, floorPrice: state.floorPrice });
        expect(ask).to.equal(legacyAsk);
        expect(ask >= state.floorPrice).to.equal(true);
        expect(ask <= spec.quote(config, state, state.curveStartTime)).to.equal(true);
        expect(spec.quote(config, state, now + 1n) <= ask).to.equal(true);

        const result = spec.advance(config, state, now);
        const legacy = deriveNextState({
          now,
          lastPrice: legacyAsk,
          previousStartTime: state.curveStartTime,
          k,
          pts: config.pts,
          currentEpochIndex: state.epochIndex
        });
        expect(result).to.deep.equal({
          ask,
          nextState: {
            epochIndex: legacy.epochIndex,
            openTime,
            curveStartTime: legacy.curveStartTime,
            anchorTime: legacy.anchorTime,
            floorPrice: legacy.floorPrice
          }
        });
        expect(result.nextState.epochIndex).to.equal(state.epochIndex + 1n);
        expect(result.nextState.floorPrice).to.equal(ask);
        expect(result.nextState.anchorTime > 0n).to.equal(true);
        expect(spec.quote(config, result.nextState, now) >= ask).to.equal(true);
        state = result.nextState;
      }
    }
  });

  it("distinguishes ABI type failures from mathematical-domain errors", function () {
    const config = integers(vectors.configs.base);
    const state = integers(vectors.states.initial);
    for (const value of [-1n, spec.U64_MAX + 1n]) {
      expect(() => spec.initialize(config, value)).to.throw(TypeError);
      expect(() => spec.quote(config, state, value)).to.throw(TypeError);
      expect(() => spec.advance(config, state, value)).to.throw(TypeError);
      expect(() => spec.quote(config, { ...state, epochIndex: value }, 1000n)).to.throw(TypeError);
    }
    expect(() => spec.initialize({ ...config, k: spec.U256_MAX + 1n }, 1000n)).to.throw(TypeError);
  });
});
