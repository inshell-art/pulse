# Pulse EVM Rehearsal Handbook (Local ETH)

This runbook is for learning and rehearsing `PulseAuction` behavior locally.

## 1. One-time setup

```bash
cd ~/Projects/pulse/evm
npm install
```

## 2. Start devnet

Terminal A:

```bash
cd ~/Projects/pulse/evm
npm run node
```

Expected:

- `Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/`

Quick health check (Terminal B):

```bash
curl -s -X POST http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Expected chain id: `0x7a69` (31337).

## 3. Deploy rehearsal contracts

Terminal B:

```bash
cd ~/Projects/pulse/evm
npm run deploy:local:eth
```

This writes:

- `evm/deployments/localhost-eth.json`

Stack deployed:

- `PulseAuction`
- `StubAdapter`

Payment token is ETH (`paymentToken = address(0)`).

## 4. Run baseline smoke test

```bash
cd ~/Projects/pulse/evm
npm run smoke:local:eth
```

What it does:

- Reads current ask.
- Sends one bid (`msg.value >= ask`; any surplus is refunded).
- Confirms treasury balance delta and epoch progression.

## 5. Run cascade scenario

```bash
cd ~/Projects/pulse/evm
npm run scenario:local:eth
```

This executes a timed bid schedule and writes:

- `evm/deployments/reports/localhost-cascade-eth-report.json`

Check summary quickly:

```bash
jq '.summary' ~/Projects/pulse/evm/deployments/reports/localhost-cascade-eth-report.json
```

Expected:

- `"allChecksPass": true`

## 6. Manual rehearsal (interactive)

Open Hardhat console:

```bash
cd ~/Projects/pulse/evm
npx hardhat console --network localhost
```

Run this inside console:

```javascript
const fs = await import("node:fs/promises");
const dep = JSON.parse(await fs.readFile("./deployments/localhost-eth.json", "utf8"));

const auction = await ethers.getContractAt("PulseAuction", dep.contracts.pulseAuction);
const adapter = await ethers.getContractAt("StubAdapter", dep.contracts.stubAdapter);
const [deployer, buyer] = await ethers.getSigners();

// Observe initial state
await auction.getConfig();
await auction.getState();
(await auction.curveActive());
(await auction.getCurrentPrice()).toString();

// First bid (safe mode: maxPrice/value above ask)
let maxPrice = 1_000_000n;
await (await auction.connect(buyer).bid(maxPrice, { value: maxPrice })).wait();

// Observe state transition
(await auction.curveActive());
(await auction.epochIndex()).toString();
(await adapter.peekNext()).toString();
(await auction.getCurrentPrice()).toString();

// Second bid with updated ask
await (await auction.connect(buyer).bid(maxPrice, { value: maxPrice })).wait();

(await auction.epochIndex()).toString();
(await adapter.peekNext()).toString();
```

## 7. Rehearsal loops you should practice

1. Genesis flow:

- Auction closed -> open -> first successful bid.
- Verify first sale ratchets floor to executed sale price (`getState()[3]` vs sale price).

2. Continuous bidding flow:

- Repeated bids by same buyer.
- Verify `epochIndex` increments and `adapter.peekNext()` increments.

3. Price observation:

- Read `getCurrentPrice()` between bids.
- Confirm time-based decay and post-sale pump behavior.
- You can intentionally overpay to verify surplus refund behavior.

4. Guardrail checks:

- Try a bid with too-low `maxPrice` to see revert.
- Try a second bid in same block (use `BidBatcher` tests as reference).

## 8. Reset cleanly

To restart from a fresh chain:

1. Stop Terminal A (`Ctrl+C`).
2. Start again with `npm run node`.
3. Re-run deploy/smoke/scenario.

## 9. Known-good command sequence

```bash
cd ~/Projects/pulse/evm
npm run node
# new terminal
cd ~/Projects/pulse/evm
npm run deploy:local:eth
npm run smoke:local:eth
npm run scenario:local:eth
```
