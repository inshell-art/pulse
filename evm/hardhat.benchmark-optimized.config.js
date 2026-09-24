import base from "./hardhat.benchmark.config.js";
import { coreReleaseSolidity } from "./config/core-build.js";

// Benchmark the reviewed release settings without changing the development build.
export default {
  ...base,
  solidity: coreReleaseSolidity,
  paths: {
    ...base.paths,
    cache: "./cache-benchmark-optimized",
    artifacts: "./artifacts-benchmark-optimized"
  }
};
