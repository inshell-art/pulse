# Pulse Cascade Testing Spec (EVM / Local Devnet)

## Purpose
This document defines a deterministic, model-based test program for Pulse's time-cascading auction behavior on EVM.

Primary goal: verify that auction state and pricing evolution match the intended mechanism under realistic sale cadence, edge timing, and failure conditions.

## Scope
- Runtime: Hardhat localhost devnet (`chainId=31337`)
- Contracts under test:
  - `evm/src/PulseAuction.sol`
  - `evm/src/interfaces/IPulseAuction.sol`
  - `evm/src/interfaces/IPulseAdapter.sol`
- Test helpers/mocks:
  - `MockERC20`, `StubAdapter`, `EvilAdapter`, `BidBatcher`

Out of scope for this phase:
- Sepolia/mainnet deployment automation and monitoring
- Gas optimization work

## Mechanism Model (Reference Oracle)
State tuple per epoch:
- `curveActive`
- `epochIndex`
- `curveStartTime`
- `anchorTime`
- `floorPrice`

Static config:
- `k`
- `pts`
- `genesisPrice`
- `genesisFloor`
- `openTime`

Pricing function:
- Before genesis (`curveActive=false`):
  - `ask(t) = genesisPrice`
- After genesis:
  - `ask(t) = floorPrice + k / (t - anchorTime)` when `t > anchorTime`
  - `ask(t) = floorPrice + k` when `t <= anchorTime` (implementation clamp)

Reset math on sale at time `t`:
- `lastPrice = ask(t)`
- `premium = (t - previousCurveStartTime) * pts`
- `initialAsk = lastPrice + premium`
- `newFloor = lastPrice`
- `newAnchor = t - floor(k / (initialAsk - newFloor))`

Implementation note:
- Integer division floor effects are expected and validated.

## Payment Modes
Pulse supports two settlement modes:
- ERC20 mode: `paymentToken != address(0)`
  - settlement uses `transferFrom`
  - `msg.value` must be `0` (`ETH_NOT_ACCEPTED`)
- Native ETH mode: `paymentToken == address(0)`
  - settlement uses `msg.value`
  - requires `msg.value == ask` (`INVALID_MSG_VALUE`)

## Invariants
### Cascade Invariants
- Before first sale, ask is time-invariant at `genesisPrice`.
- Between two sales, ask is monotonic non-increasing with time.
- Ask remains `>= floorPrice`.
- After each sale, `floorPrice` equals executed sale price.
- `epochIndex` increments by exactly 1 per sale.

### Safety/Atomicity Invariants
- One bid per block is enforced.
- Reentrancy is blocked during settlement.
- Adapter revert causes full rollback of sale/state.
- Treasury balance delta equals sale price in ETH mode.

### Observability Invariants
- `Sale` event values match post-sale storage state (`anchorA`, `floorB`, `epochIndex`).
- Multi-epoch replay from events/state matches reference oracle with no drift.

## Automated Test Layout
- `evm/test/pulseAuction.cascade.test.js`
  - P0 mechanism tests (gates, formula, decay, reset, long-gap edge)
- `evm/test/pulseAuction.safety.test.js`
  - P1 safety + settlement correctness (ETH/ ERC20 / rollback / reentrancy)
- `evm/test/pulseAuction.observability.test.js`
  - P2 event semantics and replay correctness
- Shared helpers:
  - `evm/test/helpers/pulseModel.js`
  - `evm/test/helpers/time.js`
  - `evm/test/helpers/fixtures.js`
  - `evm/test/helpers/constants.js`

## Scenario Runner (Devnet)
Script:
- `evm/scripts/scenario-cascade-local-eth.js`

Behavior:
- Reads deployment metadata from `evm/deployments/localhost-eth.json` (or `DEPLOY_FILE`).
- Runs a fixed wait schedule between sales.
- Executes bids in native ETH mode.
- Produces a JSON report at:
  - `evm/deployments/reports/localhost-cascade-eth-report.json`

Report includes:
- per-step sale time, expected ask, sale price, treasury delta
- post-sale state snapshots (`epoch`, `start`, `anchor`, `floor`, `pump`)
- per-step invariant checks and overall pass/fail summary

## Acceptance Criteria
All of the following must pass:
1. `npm test` (all suites green)
2. local deploy smoke:
   - `npm run deploy:local:eth`
   - `npm run smoke:local:eth`
3. scenario run:
   - `npm run scenario:local:eth`
4. Scenario report summary indicates `allChecksPass: true`.

## Runbook
From `evm/`:

1. Install deps:
```bash
npm install --registry=https://registry.npmjs.org
```

2. Start devnet (terminal A):
```bash
npm run node
```

3. Deploy + smoke + scenario (terminal B):
```bash
npm run deploy:local:eth
npm run smoke:local:eth
npm run scenario:local:eth
```

4. Inspect report:
```bash
cat deployments/reports/localhost-cascade-eth-report.json
```

## Failure Triage Guide
- `AUCTION_NOT_OPEN`: bid timestamp is earlier than `openTime`.
- `ONE_BID_PER_BLOCK`: multiple fills attempted in same block/tx.
- `INVALID_MSG_VALUE`: ETH payment does not exactly match ask.
- `ETH_NOT_ACCEPTED`: non-zero `msg.value` used in ERC20 mode.
- `ADAPTER_REVERT`: adapter-level settlement failure.
- `REENTRANCY`: malicious or recursive settle path blocked.

## Assumptions and Defaults
- Localhost devnet is the canonical deterministic environment.
- Reference oracle mirrors contract integer arithmetic exactly.
- Test schedule is deterministic and intended to be replayable.
- Production monitoring and multi-network CI are deferred.
