import base from "./hardhat.config.js";
import { coreReleaseSolidity } from "./config/core-build.js";

export default {
  ...base,
  networks: {
    ...base.networks,
    anvil: {
      type: "http",
      url: process.env.PULSE_ANVIL_RPC_URL ?? "http://127.0.0.1:8545"
    }
  },
  solidity: coreReleaseSolidity,
  paths: {
    ...base.paths,
    cache: "./cache-core-release",
    artifacts: "./artifacts-core-release"
  }
};
