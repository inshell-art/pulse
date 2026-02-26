# Pulse (EVM / Solidity)

This folder contains a Solidity port of the StarkNet Cairo contracts in this repo:

- `evm/src/PulseAuction.sol` ports `legacy/cairo/crates/pulse_auction/src/pulse_auction.cairo`
- `evm/src/interfaces/IPulseAdapter.sol` ports `legacy/cairo/crates/pulse_adapter/src/interface.cairo`
- `evm/src/interfaces/IPulseAuction.sol` ports `legacy/cairo/crates/pulse_auction/src/interface.cairo`

Mocks (for local testing/integration):

- `evm/src/mocks/StubAdapter.sol`
- `evm/src/mocks/EvilAdapter.sol`
- `evm/src/mocks/MockERC20.sol`

Full test strategy/spec:

- `docs/evm/pulse-cascade-testing-spec.md`
- `docs/evm/rehearsal-handbook.md`

## Hardhat

```bash
cd evm
npm install
npm test
npm run estimate:deploy:cost
```

Override assumptions (optional):

```bash
GAS_PRICE_GWEI=20 ETH_USD=3000 npm run estimate:deploy:cost
```

## Local Devnet (ETH Payment)

`PulseAuction` supports native ETH settlement when `paymentToken == address(0)`.

In one terminal:

```bash
cd evm
npm run node
```

In another terminal:

```bash
cd evm
npm run deploy:local:eth
npm run smoke:local:eth
npm run scenario:local:eth
```

`deploy:local:eth` writes deployment metadata to `evm/deployments/localhost-eth.json`.
`scenario:local:eth` writes a cascade report to `evm/deployments/reports/localhost-cascade-eth-report.json`.

## Quick Rehearsal

Verify scenario summary:

```bash
jq '.summary' /Users/bigu/Projects/pulse/evm/deployments/reports/localhost-cascade-eth-report.json
```

Expected: `"allChecksPass": true`.

Manual bid walkthrough:

```bash
cd evm
npx hardhat console --network localhost
```

```javascript
const conn = await network.connect();
const { ethers } = conn;
const fs = await import("node:fs/promises");
const dep = JSON.parse(await fs.readFile("./deployments/localhost-eth.json", "utf8"));

const auction = await ethers.getContractAt("PulseAuction", dep.contracts.pulseAuction);
const adapter = await ethers.getContractAt("StubAdapter", dep.contracts.stubAdapter);
const [, buyer] = await ethers.getSigners();

const tx = await auction.connect(buyer).bid(1_000_000n, { value: 1_000_000n });
const receipt = await tx.wait();

const sale = (await auction.queryFilter(auction.filters.Sale(), receipt.blockNumber, receipt.blockNumber))[0].args;
const settled = (await adapter.queryFilter(adapter.filters.Settled(), receipt.blockNumber, receipt.blockNumber))[0].args;

sale.epochIndex.toString();
settled.epochIndex.toString();
settled.tokenId.toString();
```

Notes:
- `maxPrice` is a slippage cap (`ask <= maxPrice`).
- `value` is attached ETH (`msg.value >= ask`).
- In ETH mode, overpayment is refunded and treasury receives exactly `ask`.
