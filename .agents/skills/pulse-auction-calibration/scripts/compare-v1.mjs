import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modelPath = process.argv[2];
if (!modelPath) throw new Error("Pass the trusted Pulse V1 specification module path");
const { CoreSpecError, U256_MAX, initialize, quote, advance } = await import(pathToFileURL(resolve(modelPath)).href);
const input = JSON.parse(readFileSync(0, "utf8"));

function integer(value, name) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${name} must be a nonnegative decimal integer string`);
  }
  return BigInt(value);
}

function candidates(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${name} must contain at least one candidate`);
  }
  return [...new Set(values)].map(value => integer(value, name));
}

function checkpoint(row) {
  if (typeof row.label !== "string" || row.label.trim() === "") {
    throw new TypeError("Each checkpoint needs a label");
  }
  const after = integer(row.afterSeconds, "afterSeconds");
  const min = row.minWei === undefined ? 0n : integer(row.minWei, "minWei");
  const max = row.maxWei === undefined ? undefined : integer(row.maxWei, "maxWei");
  if (max !== undefined && max < min) throw new RangeError(`${row.label}: maxWei < minWei`);
  return { label: row.label, after, min, max };
}

function measurement(kind, check, value) {
  const withinBounds = value >= check.min && (check.max === undefined || value <= check.max);
  return { kind, label: check.label, wei: value.toString(), withinBounds };
}

const genesisPrice = integer(input.genesisPrice, "genesisPrice");
const genesisFloor = integer(input.genesisFloor, "genesisFloor");
const start = integer(input.startTime, "startTime");
const kValues = candidates(input.kValues, "kValues");
const ptsValues = candidates(input.ptsValues, "ptsValues");
const opening = (input.opening ?? []).map(checkpoint);
const afterSale = (input.afterSale ?? []).map(row => ({
  ...checkpoint(row),
  wait: integer(row.priorWaitSeconds, "priorWaitSeconds"),
}));

const rows = [];
for (const k of kValues) {
  for (const pts of ptsValues) {
    const config = { genesisPrice, genesisFloor, k, pts };
    const coefficients = { k: k.toString(), pts: pts.toString() };
    if (k > U256_MAX || pts > U256_MAX) {
      rows.push({ ...coefficients, status: "invalid", reason: "CoefficientOutsideUint256" });
      continue;
    }
    try {
      const initial = initialize(config, start);
      const openingAskWei = quote(config, initial, start).toString();
      const checks = opening.map(check => measurement("opening-ask", check, quote(config, initial, start + check.after)));
      for (const check of afterSale) {
        const saleTime = start + check.wait;
        const sale = advance(config, initial, saleTime);
        const followingAsk = quote(config, sale.nextState, saleTime + check.after);
        checks.push(measurement("post-sale-premium", check, followingAsk - sale.ask));
      }
      const status = checks.every(check => check.withinBounds) ? "passes" : "misses-bounds";
      rows.push({ ...coefficients, status, openingAskWei, checks });
    } catch (error) {
      if (!(error instanceof CoreSpecError)) throw error;
      rows.push({ ...coefficients, status: "invalid", reason: error.name });
    }
  }
}

process.stdout.write(JSON.stringify({
  genesisPrice: genesisPrice.toString(),
  genesisFloor: genesisFloor.toString(),
  startTime: start.toString(),
  rows,
}, null, 2) + "\n");
