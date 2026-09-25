# AGENTS

## Scope
- This repository owns the stateless Pulse Core V1 calculator in `evm/src/core/PulseCoreV1.sol`, its release artifacts and integration documentation, and the first-party Pulse site in `evm/playground/`.
- Pulse Core stores no application configuration or auction state. Downstream application contracts own activation, state, payments, minting, and sale events. PATH and signatures.gallery integrate Core in their own repositories.
- The site is a product maintained here. Its lab makes read-only Core calculations and keeps hypothetical scenarios in the user's browser; it does not run a live auction. Its project directory is optional, off-chain, and manually curated, not an auction registry.
- `evm/src/PulseAuction.sol` and `IPulseAdapter` remain as legacy standalone-auction/reference code. Do not treat them as the shared Core integration surface.
- Do not put project-specific minting or allowlist assumptions into Pulse Core.

## Commands
- Install EVM deps: `cd evm && npm install`.
- Compile: `npm run compile:evm` or `cd evm && npm run compile`.
- Test: `npm test` or `cd evm && npm test`.
- Site and lab: `npm run playground` after installing EVM dependencies.
- Local ETH rehearsal: `cd evm && npm run node`, then `npm run deploy:local:eth && npm run smoke:local:eth && npm run scenario:local:eth`.

## Core V1 Release Invariants
- `initialize`, `quote`, `advance`, and `version` are pure calculations. The core keeps no auction state, collects no payment, and emits no sale events.
- Preserve the frozen V1 ABI, numerical behavior, and release hashes. A changed implementation requires a newly reviewed release identity and deployment address.
- Consumers pin an approved chain ID, Core address, and runtime code hash. The lab labels every simulated purchase as hypothetical. Project cards must not claim live auctions without public application-level evidence.

## Legacy PulseAuction Invariants
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
- Any pricing change must update model-backed Core tests in `evm/test/`; do not rely only on spot values.
- Legacy adapter, payment, or event changes must update their related tests in `evm/test/`.
- Playground changes should verify the read-only Sepolia call path and desktop/mobile chart behavior.
- Add rollback tests when a downstream call can fail.
- Add ETH and ERC20 coverage when settlement semantics change.

## Security
- Do not add secrets, live RPC keys, private keys, mnemonics, or real operator material.
- Treat deployment outputs as local/generated unless deliberately reviewed.
- Before commit, inspect staged diff and run `gitleaks detect --no-git --redact` when available.
