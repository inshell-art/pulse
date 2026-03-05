import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

/** @type {import("hardhat/config").HardhatUserConfig} */
export default {
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.24",
  networks: {
    default: {
      type: "edr-simulated",
      allowBlocksWithSameTimestamp: true
    },
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545"
    }
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
