export const fields = ["epochIndex", "openTime", "curveStartTime", "anchorTime", "floorPrice"];
export const errorNames = new Set([
  "InvalidCurveK", "InvalidGenesisPrices", "GenesisGapExceedsK", "InvalidPts",
  "TimeScaleOutOfRange", "StartTimeTooEarly", "InvalidState", "TimestampBeforeEpoch",
  "PriceOverflow", "TargetPriceOverflow", "EpochOverflow"
]);


export function uint(value, bits) {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) throw new Error("Invalid unsigned integer input");
  const parsed = BigInt(value);
  if (parsed >= 1n << BigInt(bits)) throw new Error("Input exceeds its ABI width");
  return parsed;
}

export function config(value) {
  if (!value || typeof value !== "object") throw new Error("Missing curve settings");
  return {
    k: uint(value.k, 256),
    genesisPrice: uint(value.genesisPrice, 256),
    genesisFloor: uint(value.genesisFloor, 256),
    pts: uint(value.pts, 256)
  };
}

export function state(value) {
  if (!value || typeof value !== "object") throw new Error("Missing curve state");
  return {
    epochIndex: uint(value.epochIndex, 64),
    openTime: uint(value.openTime, 64),
    curveStartTime: uint(value.curveStartTime, 64),
    anchorTime: uint(value.anchorTime, 64),
    floorPrice: uint(value.floorPrice, 256)
  };
}

export function wireState(value) {
  return Object.fromEntries(fields.map((field) => [field, value[field].toString()]));
}
