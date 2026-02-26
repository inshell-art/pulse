# pulse

Pulse is an on-chain implementation of DAA (Decentralized Automatic Auction).

## Active Implementation

The active implementation is Solidity for Ethereum:

- `evm/`
- Main contract: `evm/src/PulseAuction.sol`
- Adapter interface: `evm/src/interfaces/IPulseAdapter.sol`
- Tests: `evm/test/`

Quick start:

```bash
cd evm
npm install
npm test
```

Local ETH rehearsal:

```bash
cd evm
npm run node
# new terminal
cd evm
npm run deploy:local:eth
npm run smoke:local:eth
npm run scenario:local:eth
```

## Usage (How To Use Pulse Locally)

Pulse runs as serial auctions: each successful bid finalizes the current epoch and immediately starts the next epoch.

1. Install and test:

```bash
cd evm
npm install
npm test
```

2. Start local devnet (Terminal A):

```bash
cd evm
npm run node
```

3. Deploy and run baseline checks (Terminal B):

```bash
cd evm
npm run deploy:local:eth
npm run smoke:local:eth
npm run scenario:local:eth
```

4. Inspect scenario result:

```bash
jq '.summary' evm/deployments/reports/localhost-cascade-eth-report.json
```

Expected: `"allChecksPass": true`.

5. Manual interaction (optional):

```bash
cd evm
npx hardhat console --network localhost
```

Inside console:

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
- `maxPrice` is a slippage ceiling (`ask <= maxPrice`).
- `value` is the ETH attached to the tx (`msg.value >= ask`).
- In ETH mode, overpayment is refunded and treasury receives exactly `ask`.

## Legacy Cairo Archive

The Cairo/Starknet codebase is archived and not the default workflow anymore.

- `legacy/cairo/`
- Archived packages: `legacy/cairo/crates/`
- Archived deployment metadata: `legacy/cairo/deployments/`
- Archived runbook: `legacy/cairo/README.md`

## Concept

PulseAuction is NFT-agnostic: the auction core does not assume a specific minting system.
Delivery is delegated to a project-specific adapter.

High-level flow:

1. Buyer calls `bid(maxPrice)`.
2. Auction computes ask from current curve state.
3. Auction settles payment to treasury.
4. Auction calls adapter `settle(...)` to deliver/mint.

## License

MIT
