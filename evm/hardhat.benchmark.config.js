import base from "./hardhat.config.js";

export default {
  ...base,
  networks: {
    default: {
      ...base.networks.default,
      chainType: "l1",
      hardfork: "shanghai",
      initialDate: "2026-09-23T00:00:00.000Z"
    }
  }
};
