# Shared Pulse core: reference consumer integration

Status: Task 3 implemented and verified locally. The core API remains version 1.0.0. These consumers establish the Pulse integration contract. Production integrations are owned and scheduled by each downstream repository; they do not block Pulse's benchmark, review or release tasks.

## 1. Reference files and scope

- [PulseConsumerHarness.sol](../../evm/src/mocks/PulseConsumerHarness.sol): application state, activation, payment, issuance reservations and events.
- [PulseConsumerAdversaries.sol](../../evm/src/mocks/PulseConsumerAdversaries.sol): callback probes, rejecting receivers and ERC20 return/failure behavior.
- [Consumer conformance tests](../../evm/test/pulseCore.consumers.test.js).
- [Frozen core API](pulse-core-api.md) and [implementation plan](shared-pulse-core-plan.md).

The harness imports `IPulseCore` only. Two instances share a single `PulseCoreV1` address, and each stores its own config, curve state, initialization flag, block marker and issuance ledger. ETH and ERC20 are constructor-selected payment modes. There is no new core or linked arithmetic library deployed for a consumer.

This test application deliberately has a small issuance ledger, a global unique issuance key, and an ERC721 receiver callback. It is not a complete ERC721 implementation: transfers, approvals, metadata, signed authorizations and application-specific minting are outside the fixture. Downstream projects implement these concerns in their existing application code; inheritance from this harness is not required.

## 2. Core binding and configuration

The constructor takes a `Binding` containing an approved core address, runtime code hash and chain ID. It checks the current chain, nonempty code and exact runtime hash, then stores the binding immutably. There is no core replacement or config setter.

The expected hash must come from a trusted release artifact built with the reviewed compiler/settings. Computing a hash from an arbitrary live address and accepting it is not a release verification procedure. Tests derive the expected hash from the locally deployed, compiled core; production release tooling must use a published manifest. Chain validation is separate from code identity because identical code can exist on different chains.

The application freezes `Config` in its storage. Its payable entrypoints accept only the buyer's slippage ceiling and issuance key; config, state, timestamp, epoch and core address are never purchase arguments. It checks time and block values before narrowing to `uint64`.

At construction, the consumer calls `initialize` and simulates an immediate `advance` at the earliest start time. This rejects invalid parameters and an unrepresentable first transition before allocations are offered. The conditional application does not store this simulated state. Preflight does not promise unlimited future price headroom.

## 3. Activation and reads

Exactly one launch mode is selected:

| Mode | Constructor selection | Activation |
| --- | --- | --- |
| Scheduled | Nonzero `scheduledOpenTime`, zero `allocationSlots` | Store epoch 0 at construction; permit purchases at/after open time |
| Conditional | Zero `scheduledOpenTime`, positive `allocationSlots` | The final successful initial fulfillment initializes epoch 0 at its block timestamp |

Scheduled starts cannot be in the past. Before scheduled opening, `getCurrentPrice()` is pinned to the opening ask while `buy()` rejects. Before conditional initialization, `curveActive()` is false and `getCurrentPrice()` reverts with `NotInitialized()`.

The consumer exposes:

- `pulseCore()`, `coreRuntimeCodeHash()`, `boundChainId()` and `initialized()`.
- `getPulseConfig()` and `getPulseState()` with the core's typed structs.
- Existing-style `getConfig()` and `getState()` tuple shapes, plus `getEpochIndex()` and `curveActive()`.
- `getCurrentPrice()`, which supplies the stored config/state and current chain time to `core.quote`.

Before conditional initialization, state/open-time fields are zero placeholders; they are not a valid curve snapshot or a price. `paused` is separate from `curveActive()`. In this fixture, pause stops both initial fulfillment and public purchases; the clock continues and resume never resets an epoch or anchor. Each real application must record its own pause policy.

### Conditional slots

The fixture's owner allowlists unique slot keys to recipients. Each successful `fulfillInitial(key)` consumes exactly that slot, reserves an issuance, and charges the configured `initialPrice` in the selected payment asset. Rejected, duplicate and failed claims do not count. Slot count and Pulse epoch are separate values.

The final claim sets the initialized state before settlement/delivery callbacks, while keeping the common reentrancy guard active. The entire transaction must succeed for fulfillment and activation to persist. A failed treasury, refund, token transfer or delivery reverts reservations, payment and activation together.

Completion does not emit `Sale` or consume the Pulse block allowance. After the fulfillment call has completed, one Pulse purchase can succeed in that same block, including through a later call in a batch. Reentry during fulfillment is prohibited. The initial route and further slot enrollment are closed after activation.

Tests use 1,024 slots to exercise the signatures.gallery boundary. The configurable fixture permits several slots for one recipient and batched calls through the test actor. These are testing choices, not signatures.gallery wallet/eligibility decisions. Actual slot meaning, signatures, fees and recipient policy must be applied in that repository. No 1,024 constant or allowlist rule is added to the core.

## 4. Purchase and callback rules

The reference `buy(maxPrice, key)` does the following under one reentrancy guard:

1. Check pause, initialization, open time, one-sale-per-block, key uniqueness and available supply.
2. Call `core.advance` once with the canonical stored config/state and current timestamp.
3. Check `ask <= maxPrice` and the attached payment requirements.
4. Store the returned curve, record the current block, reserve the key, increment supply and assign the issuance recipient.
5. Pay the treasury, refund excess ETH if present, then deliver through the receiver callback.
6. Emit issuance and sale events.

Any failure reverts the entire transaction. There is no catch-and-continue path in the application. Callback reads can observe the provisional committed epoch/issuance; callbacks cannot use any guarded entrypoint to make a nested purchase, fulfill a slot, enroll slots or change pause state. The guard covers owner methods too, since an owner may itself be a contract receiving a callback.

The core call is made through the `external pure` interface and receives no payment. All currency and asset interactions belong to the application.

| Payment mode | Requirement and settlement |
| --- | --- |
| Native ETH | Attach at least the ask; treasury receives exactly the ask; sender receives the surplus before delivery |
| ERC20 | Attach zero ETH; transfer exactly the nominal ask from the sender to treasury |

The ERC20 fixture accepts an empty return or a 32-byte integer equal to one, and rejects false, reverted or malformed results. Fee-on-transfer, rebasing and dishonest tokens require an explicit application policy; this fixture's assertions use ordinary nominal transfers.

One-sale-per-block enforcement is local to each application. Both consumers may complete purchases in one block. A second purchase in one consumer fails without consuming a key or changing its epoch; the other consumer's storage and ability to sell are unaffected.

## 5. Events and reconstruction

Each application emits `CoreBound` once and `LaunchConfigured(openTime, deployedAt)` upon initialization. `deployedAt` always means original application deployment, including a delayed conditional launch.

The `Sale` signature and meanings match the existing auction:

```solidity
event Sale(
    address indexed buyer,
    uint64 indexed epochIndex,
    uint256 price,
    uint64 timestamp,
    uint64 nextAnchorA,
    uint256 nextFloorB
);
```

`epochIndex` is the newly entered epoch; the first public purchase closes epoch 0 and emits 1. Its price is the executed ask. `nextAnchorA` and `nextFloorB` describe the next curve. Initial fulfillments emit their own events and do not alter the Pulse epoch.

Replay the launch/config through the independent model and advance it for each `Sale`. Filter logs by application address. Frontends must read config/state/time at a consistent block tag and treat read quotes as previews. The core cannot supply an application's authoritative current state or authenticate arbitrary supplied history.

## 6. Verification completed

On 2026-09-23, `cd evm && npx hardhat test test/pulseCore.consumers.test.js` passed all 32 conformance tests. `cd evm && npm test` passed all 217 tests with Solidity 0.8.24. The fixtures deploy only to Hardhat's local EVM.

The conformance suite covers:

- Approved code/chain binding, configuration and initial-transition preflight.
- Independent ETH/ERC20 consumers, interleaved purchases and three actual transactions mined in one block (both apps succeed, second sale in one app fails).
- Scheduled opening, price pinning, pause/resume, canonical inputs, key uniqueness and supply limits.
- Exact ETH settlement/refunds, slippage, underpayment, standard/no-return ERC20, approvals/balance failures, ETH rejection and false/reverted/malformed token returns.
- Mined failed transactions with status zero and no logs, plus unchanged curve, issuance reservation, balances and token allowance after settlement/delivery failure.
- Reentry through treasury, refunds, token transfer and delivery; callbacks see reserved state but all application write routes reject reentry.
- Conditional read behavior, eligibility, duplicate claims, failed final activation in ETH/ERC20 mode, and guarded final-fulfillment callbacks.
- All 1,024 initial slots: uninitialized at 1,023, activation at the final fulfillment timestamp, one subsequent same-block paid purchase, and closure of the initial route.
- Reconstruction of each sold epoch from application events and frozen config.

The harness's unique key demonstrates reservation/rollback. Real signature nonces, handles, token ID domains, mint authority and existing UI/backend behavior belong to downstream Task 4 work in the application repositories when they choose to integrate. [Benchmarking](pulse-core-benchmark.md) and [Task 5B review/build freeze](pulse-core-review.md) are complete; Pulse's next work is Task 6 core release and integration artifact publication. These steps can proceed before either real application integrates.
