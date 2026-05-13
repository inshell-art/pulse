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

## Publish-Ready Invariants

- `openTime` is the only launch clock. Before it, bids revert and `getCurrentPrice()` is pinned to the open-time ask.
- The first public bid is a normal epoch-0 sale, not a separate genesis mint path.
- `maxPrice` caps acceptable execution price; it is not the amount charged.
- In ETH mode, `msg.value` funds the bid. The treasury receives exactly the executed ask and any surplus is refunded.
- In ERC20 mode, ETH is rejected and the contract transfers exactly the executed ask.
- The adapter address is one-shot and must be finalized before open.
- `Sale` events plus `getConfig()` / `getState()` must be enough for frontends and indexers to reconstruct the serial auction.

## Concept

PulseAuction is NFT-agnostic: the auction core does not assume a specific minting system.
Delivery is delegated to a project-specific adapter.

High-level flow:

1. Buyer calls `bid(maxPrice)`.
2. Auction computes ask from current curve state.
3. Auction settles payment to treasury.
4. Auction calls adapter `settle(...)` to deliver/mint.

## DAA (Decentralized Automatic Auction): how it works

Pulse implements a serial auction: every successful bid finalizes the current epoch and immediately starts the next epoch.

At any moment the ask price is deterministic from on-chain state. There is no off-chain price schedule.

### Core math (hyperbola / constant-product form)

The ask is always curve-based, with pre-open time clamped to `openTime`.

Let:
- `t` = current block timestamp (seconds)
- `tEff = max(t, openTime)`
- `a` = `anchorTime` (seconds)
- `b` = `floorPrice` (price units, e.g. wei)
- `k` = `curveK` (price*seconds)

Then:
- For `tEff > a`:
  - `ask(t) = b + floor( k / (tEff - a) )`
- For `tEff <= a` (safety clamp near the vertical asymptote):
  - `ask(t) = b + k`

Equivalent constant-product view (ignoring integer rounding):
- `(tEff - a) * (ask(t) - b) ~= k`

So between sales, the ask decays monotonically toward `b` as time increases.

Epoch 0 is initialized at deployment:
- `curveStartTime = openTime`
- `floorPrice = genesisFloor`
- `anchorTime` chosen so `ask(openTime) = genesisPrice`

Before `openTime`, bids are blocked and `getCurrentPrice()` is pinned to the `openTime` ask.

### Epoch transition (the pump + reset)

Each successful bid at time `t_last` closes an epoch and sets parameters for the next epoch.

At sale time:
- `lastPrice = ask(t_last)` (the executed sale price)
- `deltaT = t_last - previousCurveStartTime`
- `effectiveDeltaT = max(1, deltaT)`
- `premium = effectiveDeltaT * pts`

(`pts` is price-time scale: price units per second)

Define the next epoch start price:
- `initialAsk = lastPrice + premium`
- `nextFloor = lastPrice`

This pure-ratchet rule applies to every completed sale, including the first one after open.

Now choose a new `anchorTime` so the next epoch curve satisfies:
- `ask(t_last) = initialAsk`

Using `ask(t) = b + k / (t - a)` with `b = nextFloor`, solve for `a`:
- `initialAsk = b + k / (t_last - a)`
- `initialAsk - b = k / (t_last - a)`
- `t_last - a = k / (initialAsk - b)`
- `a = t_last - floor( k / (initialAsk - b) )`

Because `initialAsk - b = premium`:
- `anchorTime = t_last - floor( k / premium )`

This creates the characteristic shape:
- Immediately after a sale, the ask jumps up by `premium = effectiveDeltaT * pts`.
- Then the ask decays hyperbolically back toward the new floor.

### Integer division and edge case

All divisions are integer divisions (`floor`), so small rounding effects are expected.

Important edge cases:
- If `premium > k`, then `floor(k / premium) = 0`, so `anchorTime == curveStartTime`.
- At exactly `t == anchorTime` the curve would be undefined, so the implementation clamps to `floor + k` when `t <= anchorTime`.
- One second later it follows `floor + floor(k / 1)`, then `floor + floor(k / 2)`, and so on.
- `effectiveDeltaT = max(1, deltaT)` applies to all sales, so same-timestamp sales cannot brick the auction.

### Why store (`anchorTime`, `floorPrice`) instead of the whole curve?

For each epoch, the entire curve is defined by small state:
- `k` (constant)
- `anchorTime` (`a`)
- `floorPrice` (`b`)
- `curveStartTime` (used to compute the next `premium`)

Frontends/indexers can reconstruct asks at any timestamp and replay state transitions from events.

### Provenance and references

- Solidity implementation: `evm/src/PulseAuction.sol`.
- Mechanism oracle and invariants: `docs/evm/pulse-cascade-testing-spec.md`.
- Interactive curve model (Desmos): https://www.desmos.com/calculator/1d89f93d21

## License

MIT
