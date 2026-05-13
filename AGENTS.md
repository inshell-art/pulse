# AGENTS

## Scope
- Pulse is the auction primitive. The active implementation is `evm/src/PulseAuction.sol`.
- The contract is NFT-agnostic; delivery is delegated through `IPulseAdapter`.
- Do not put project-specific minting assumptions into Pulse. Keep those in downstream repos such as `path`.

## Commands
- Install EVM deps: `cd evm && npm install`.
- Compile: `npm run compile:evm` or `cd evm && npm run compile`.
- Test: `npm test` or `cd evm && npm test`.
- Local ETH rehearsal: `cd evm && npm run node`, then `npm run deploy:local:eth && npm run smoke:local:eth && npm run scenario:local:eth`.

## Publish-Ready Contract Invariants
- `openTime` is canonical. Bids before `openTime` must revert, and pre-open price reads must be pinned to the open-time ask.
- The first public bid is not a genesis sale. It is a normal sale in epoch 0.
- Each successful bid closes the current epoch and starts the next epoch.
- `maxPrice` is a slippage ceiling only: the sale must satisfy `ask <= maxPrice`.
- In native ETH mode, `msg.value` is the attached payment: it must satisfy `msg.value >= ask`; the treasury receives exactly `ask`; excess ETH is refunded.
- In ERC20 mode, `msg.value` must be zero and the contract transfers exactly `ask`.
- The mint adapter is one-shot: constructor-set adapter cannot be replaced; zero-constructor adapter can only be initialized by the deployer before `openTime`.
- One bid per block is enforced by `lastBlock`.
- Sale reconstruction must be possible from `Sale` events plus `getConfig()` / `getState()`.
- Keep event field names and semantics stable: `price`, `timestamp`, `nextAnchorA`, `nextFloorB`, and `epochIndex` are frontend/indexer inputs.

## Test Expectations
- Any pricing, adapter, payment, or event change must update tests in `evm/test/`.
- Add model-backed tests for any curve math change; do not rely only on spot values.
- Add rollback tests when a downstream call can fail.
- Add ETH and ERC20 coverage when settlement semantics change.

## Security
- Do not add secrets, live RPC keys, private keys, mnemonics, or real operator material.
- Treat deployment outputs as local/generated unless deliberately reviewed.
- Before commit, inspect staged diff and run `gitleaks detect --no-git --redact` when available.
