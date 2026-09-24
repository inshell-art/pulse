# Pulse Core V1 A/B gas benchmark — Task 5A

Status: measured locally and corrected during [Task 5B review](pulse-core-review.md) on 2026-09-23. This is a reproducible cost comparison, not a target-chain fee quote. The optimized core build is now frozen for Task 6 release work.

## What was compared

- **A, embedded:** two generated copies of the Task 3 reference consumer with `PulseMath` compiled inside each application. The embedded control is generated mechanically from `PulseConsumerHarness` and `PulseMath`; the generator checks that the controls are current. Internal calls require `memory` in place of the core's `calldata` parameters.
- **B, shared:** one deployed `PulseCoreV1` plus two unmodified `PulseConsumerHarness` applications bound to its address, chain and runtime hash.
- The application profiles are a scheduled ETH launch and a conditional ERC20 launch. The latter registers and fulfills all **1,024** initial slots before opening Pulse. Each pair executes its matching quote or purchase in the same block at the same timestamp. Separate identical token ledgers prevent shared treasury balances from biasing results; paired claims use identical keys. The script checks matching curve states, issuance, settlement and delivery and rejects failed receipts.
- The test token, quote probe, initial token funding and ERC20 approvals are common test infrastructure and excluded from the two-application deployment totals. Slot registration and initial fulfillment gas are reported separately.

Reproduce from `evm/`:

```bash
BENCH_ALLOCATION_SLOTS=1024 npm run benchmark:core
BENCH_ALLOCATION_SLOTS=1024 npm run benchmark:core:optimized
```

The first command uses the repository's unoptimized compiler settings: solc `0.8.24`, Shanghai, optimizer **disabled**, `viaIR=false`. The second uses a separate artifact directory and the **reviewed release settings**, optimizer enabled with 200 runs; it does not change the normal development build. Both explicitly pin Shanghai L1 execution and the initial clock, and report machine-readable JSON with source hashes. The recorded runs are [default JSON](benchmarks/pulse-core-default-1024.json) and [optimized JSON](benchmarks/pulse-core-optimized-1024.json), both on local chain 31337. Add `BENCH_SHARED_FIRST=1` to reverse transaction order; the full report remains identical.

## Measured gas

The optimized build matches the [frozen release manifest](../../evm/releases/pulse-core-v1/manifest.json). `Δ` means B minus A; positive means the shared core costs more gas for that action.

| Optimized build, 200 runs | A embedded | B shared | Δ |
| --- | ---: | ---: | ---: |
| Pulse core deployment | — | 640,793 | +640,793 |
| Scheduled ETH application deployment | 2,052,899 | 1,832,277 | −220,622 |
| Conditional ERC20 application deployment | 1,987,624 | 1,767,002 | −220,622 |
| **Two applications, including one B core** | **4,040,523** | **4,240,072** | **+199,549** |
| First ETH purchase | 135,775 | 142,921 | +7,146 |
| Later ETH purchase | 115,684 | 122,488 | +6,804 |
| First ERC20 purchase | 135,960 | 143,106 | +7,146 |
| Later ERC20 purchase | 135,759 | 142,563 | +6,804 |
| Final slot fulfillment and activation, slot 1,024 | 170,027 | 174,312 | +4,285 |

The optimized shared consumer saves **1,015 runtime bytes** per application (8,189 → 7,174). Registering 1,024 slots costs 23,886,316 gas for A and 23,886,044 for B, across eight owner transactions per application. Fulfilling the first 1,023 slots costs 116,163,696 gas for A and 116,186,202 for B, across 1,023 buyer transactions per application. Including final activation, B costs **26,519 more gas across the entire initial phase**. The pre-final differences are dispatcher/compiler overhead: those claims make no Pulse calculation calls. These totals span many transactions.

The quote probe directly measures the first pre-open application call at 21,815 gas for A versus 27,645 for B, a **5,830 gas premium**. Its second call in the *same* transaction costs 5,312 gas for A and 8,642 for B, a **3,330 gas premium** with warm accounts. These include the application-call wrapper and exclude outer transaction intrinsic gas and probe logging. The JSON separately records full receipt gas. A direct RPC `eth_call` read sends no transaction and charges the reader no on-chain gas; the probe represents another contract reading the quote on-chain.

With the current unoptimized build, the two-application deployment totals are **6,323,163 A** versus **6,797,481 B**, or **+474,318 gas** for B. Core deployment is 914,546 gas. B adds 11,657 gas to a first purchase and 11,155 to a later purchase; the final 1,024th-slot activation adds 6,536 gas. Runtime code saved is 1,056 bytes per application. The raw JSON records all individual measurements.

For scale only, at an **assumed** 10 gwei gas price and $3,000/ETH, the optimized two-app deployment premium of 199,549 gas is 0.00199549 ETH (about $5.99), paid by the deployer. The 7,146-gas first-purchase premium is 0.00007146 ETH (about $0.21), paid by the transaction sender or sponsor. These assumptions are not live prices. At three *similarly sized* applications, the one-time core deployment would be approximately covered by the per-application deployment savings; the purchase premium still applies to every on-chain purchase.

## Limits and interpretation

This comparison isolates the selected shared-core design. The controls share the reference consumer's payment, slot, issuance and event flow, but the issuance ledger is not a production ERC721 and neither real PATH nor signatures.gallery code is benchmarked. `memory` conversion in A is a legitimate implementation choice for embedding this exact math, but a separately optimized embedded implementation could have different gas. The reference token does not represent every production ERC20. Compiler settings and future ABI or source changes can move these numbers and require rerunning the benchmark.

Measured gas uses the pinned local Shanghai execution rules. Other hardforks or chains may charge differently, and rollups can add data fees. No RPC subscription fees, verification costs, real NFT mint logic, signatures, allowlist proof validation, or downstream UI/indexer work are included. Those application costs are measured by the application repositories when they integrate.
