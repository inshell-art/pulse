# Pulse (EVM / Solidity)

This folder contains the active Solidity implementation of Pulse on Ethereum.

- `evm/src/PulseAuction.sol`
- `evm/src/interfaces/IPulseAdapter.sol`
- `evm/src/interfaces/IPulseAuction.sol`

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
jq '.summary' ~/Projects/pulse/evm/deployments/reports/localhost-cascade-eth-report.json
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

## Release Checks

Before a public deployment, run:

```bash
npm test
npm run estimate:deploy:cost
```

Manual launch checks:

- Confirm `openTime`, `genesisPrice`, `genesisFloor`, `k`, and `pts` from `getConfig()`.
- Confirm `curveActive()` is false before `openTime` and true at or after `openTime`.
- Confirm the adapter is nonzero before open and cannot be changed after it is set.
- Confirm ETH or ERC20 settlement mode matches the release plan.
- Confirm indexers/frontends read price from the contract, not from copied constructor constants.

## Publish-Ready Invariants

Constructor params:

- `openTime`: canonical launch timestamp. Bids before this timestamp revert; pre-open price reads are pinned to the opening ask.
- `k`: constant-product curve constant.
- `genesisPrice`: opening ask.
- `genesisFloor`: initial floor.
- `initialPts`: price-time scale used to pump the next curve after each sale.
- `paymentToken`: zero address for ETH settlement, ERC-20 contract for token settlement.
- `treasury`: payment recipient. In native ETH mode it receives exactly the ask.
- `mintAdapter`: downstream delivery adapter. It may be zero only if initialized by the deployer before `openTime`.

Role and freeze model:

- Pulse has no admin role after construction.
- `deployer` can call `initializeMintAdapter` exactly once, only before `openTime`, and only when constructor `mintAdapter` was zero.
- A nonzero constructor `mintAdapter` is effectively frozen.

Irreversible actions:

- Each successful `bid(maxPrice)` settles the current epoch, transfers the ask, calls the adapter, advances `epochIndex`, and starts the next curve.
- The first public bid is a normal epoch-0 sale, not a genesis sale.
- One bid per block is enforced by `lastBlock`.

Metadata/event/indexer expectations:

- Indexers reconstruct the auction from `Sale` events plus `getConfig()` and `getState()`.
- Stable `Sale` event fields: `buyer`, `epochIndex`, `price`, `timestamp`, `nextAnchorA`, `nextFloorB`.
- `LaunchConfigured(openTime,deployedAt)` anchors launch timing.

Deploy-time assumptions:

- Downstream projects own NFT-specific adapter behavior.
- For PATH, the adapter must be wired/frozen downstream before public open.
- For ETH mode, caller sends `msg.value >= ask`; overpayment is refunded and treasury receives exactly `ask`.
- For ERC-20 mode, caller sends `msg.value == 0`; Pulse transfers exactly `ask`.
