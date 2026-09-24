// Reviewed V1 release settings. Changes require rerunning Task 5B and the freeze.
export const coreReleaseSolidity = {
  version: "0.8.24",
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    viaIR: false,
    metadata: { bytecodeHash: "ipfs", appendCBOR: true }
  }
};
