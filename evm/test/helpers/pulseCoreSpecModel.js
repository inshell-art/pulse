// Executable V1 specification, not production code. Bounds are explicit because
// JavaScript BigInt does not model Solidity's fixed-width overflow by itself.
export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;
export const U256_MAX = (1n << 256n) - 1n;

export class CoreSpecError extends Error {
  constructor(name, ...args) {
    super(name);
    this.name = name;
    this.args = args;
  }
}

function fail(name, ...args) {
  throw new CoreSpecError(name, ...args);
}

function uint(value, maximum, label) {
  // Outside the typed ABI domain, not a Pulse custom error.
  if (typeof value !== "bigint" || value < 0n || value > maximum) {
    throw new TypeError(`${label} is outside its ABI uint range`);
  }
}

function checkConfigTypes(c) {
  for (const key of ["k", "genesisPrice", "genesisFloor", "pts"]) {
    uint(c[key], U256_MAX, key);
  }
}

function checkStateTypes(s) {
  for (const key of ["epochIndex", "openTime", "curveStartTime", "anchorTime"]) {
    uint(s[key], U64_MAX, key);
  }
  uint(s.floorPrice, U256_MAX, "floorPrice");
}

function validateConfig(c) {
  if (c.k === 0n) fail("InvalidCurveK");
  if (c.genesisPrice <= c.genesisFloor) fail("InvalidGenesisPrices");
  if (c.genesisPrice - c.genesisFloor > c.k) fail("GenesisGapExceedsK");
  if (c.pts === 0n || c.pts > U128_MAX) fail("InvalidPts");
  if (c.k / c.pts > U64_MAX) fail("TimeScaleOutOfRange");
}

function price(c, s, t) {
  const increment = t <= s.anchorTime ? c.k : c.k / (t - s.anchorTime);
  if (increment > U256_MAX - s.floorPrice) fail("PriceOverflow");
  return s.floorPrice + increment;
}

function launch(c, startTime) {
  validateConfig(c);
  const initialDistance = c.k / (c.genesisPrice - c.genesisFloor);
  const transitionDistance = c.k / c.pts;
  const minimumExclusive = initialDistance > transitionDistance
    ? initialDistance : transitionDistance;
  if (startTime <= minimumExclusive) {
    fail("StartTimeTooEarly", startTime, minimumExclusive);
  }
  const state = {
    epochIndex: 0n,
    openTime: startTime,
    curveStartTime: startTime,
    anchorTime: startTime - initialDistance,
    floorPrice: c.genesisFloor
  };
  price(c, state, startTime);
  return state;
}

function validateState(c, s) {
  const initial = launch(c, s.openTime);
  if (s.curveStartTime < s.openTime || s.anchorTime === 0n ||
      s.anchorTime > s.curveStartTime || s.floorPrice < c.genesisFloor) {
    fail("InvalidState");
  }
  if (s.epochIndex === 0n && (
    s.curveStartTime !== initial.curveStartTime ||
    s.anchorTime !== initial.anchorTime ||
    s.floorPrice !== initial.floorPrice
  )) {
    fail("InvalidState");
  }
  price(c, s, s.curveStartTime);
}

export function initialize(c, startTime) {
  checkConfigTypes(c);
  uint(startTime, U64_MAX, "startTime");
  return launch(c, startTime);
}

export function quote(c, s, timestamp) {
  checkConfigTypes(c);
  checkStateTypes(s);
  uint(timestamp, U64_MAX, "timestamp");
  validateState(c, s);
  if (s.epochIndex !== 0n && timestamp < s.curveStartTime) {
    fail("TimestampBeforeEpoch", timestamp, s.curveStartTime);
  }
  const effectiveTime = timestamp < s.openTime ? s.openTime : timestamp;
  return price(c, s, effectiveTime);
}

export function advance(c, s, timestamp) {
  checkConfigTypes(c);
  checkStateTypes(s);
  uint(timestamp, U64_MAX, "timestamp");
  validateState(c, s);
  if (timestamp < s.curveStartTime) {
    fail("TimestampBeforeEpoch", timestamp, s.curveStartTime);
  }
  if (s.epochIndex === U64_MAX) fail("EpochOverflow");
  const ask = price(c, s, timestamp);
  const elapsed = timestamp - s.curveStartTime;
  const premium = (elapsed === 0n ? 1n : elapsed) * c.pts;
  if (premium > U256_MAX - ask) fail("TargetPriceOverflow");
  const nextState = {
    epochIndex: s.epochIndex + 1n,
    openTime: s.openTime,
    curveStartTime: timestamp,
    anchorTime: timestamp - c.k / premium,
    floorPrice: ask
  };
  price(c, nextState, timestamp);
  return { ask, nextState };
}
