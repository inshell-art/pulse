# Pulse Core V1 — Task 5B review and build freeze

Status: complete locally on 2026-09-23. This repository review covered the three core source files, the normative specification and vectors, reference-consumer lifecycle/payment boundaries, and the A/B benchmark. No core arithmetic or consumer safety defect was found in the reviewed scope. Two benchmark findings were corrected. No blocking finding remains for the local build freeze. This is an internal review, not an external audit or a formal verification of all inputs.

## Findings and resolution

### R1 — Unequal benchmark state and inputs (P2, fixed)

A and B used the same test ERC20 and treasury. A's first transfer populated the treasury's token balance before B's first transfer, so B received a cheaper storage write. The one-slot control could incorrectly appear cheaper under B; the initial-phase aggregate also understated B's cost. Different claim keys added small differences in calldata gas.

The corrected benchmark uses separate, identical token ledgers with equal starting balances and identical claim keys. Purchase and fulfillment transactions assert equal calldata gas. Each token's treasury receipt is verified independently. Both one-slot and 1,024-slot runs produce identical reports when A/B execution order is reversed. The optimized two-application deployment premium remains 199,549 gas and purchase premiums remain 7,146/6,804 gas. The initial-phase aggregate is corrected to **26,519 gas**; it includes minor dispatcher differences on calls that do not use Pulse. It must not be described as 1,024 core calls.

### R2 — Incomplete measurement and build provenance (P2, fixed)

The benchmark selected the first matching build-info file from a directory, which could describe an old build. Its execution hardfork and starting clock were implicit. The quote comparison subtracted two different transaction entrypoints, mixing call work with calldata, dispatch and return-encoding costs.

Build evidence now follows each deployed artifact's exact build ID, checks its bytecode against compiler output, checks its compiled sources against disk, and verifies equivalent compiler settings across controls. Both benchmark profiles pin a Shanghai L1 execution environment and a fixed initial date. The quote probe measures the first and second application calls inside the same transaction with `gasleft`; outer transaction costs are separately reported. The application call is cold on the first read and warm on the second; account warmth is scoped to a transaction. [EIP-2929](https://eips.ethereum.org/EIPS/eip-2929)

The release profile and manifest now pin the reviewed compiler settings, dependency lock, three core sources, ABI, creation/runtime bytecode and vectors. A standalone compiler rebuild of the three-source standard input reproduced both bytecodes exactly. The checker rejects the unoptimized development build.

## Numerical review

- All denominators are positive: config checks establish `k > 0`, a positive genesis gap and `pts > 0`; `premium = max(elapsed, 1) * pts`. The price rule divides only when `timestamp > anchorTime`.
- `floor(k / pts) <= U64` and `pts <= U128` imply `k < (U64 + 1) * pts < 2^192`. The premium is at most `U64 * U128 < 2^192`, so its multiplication fits `uint256`.
- Initialization compares full-width offsets before narrowing. Both offsets are strictly less than the accepted `uint64` open time. For advancement, `floor(k / premium) <= floor(k / pts) < openTime <= timestamp`, so the narrowing and anchor subtraction are safe and the anchor stays positive.
- State validation and timestamp rules make the effective quote timestamp at least the current curve start. Later quotes cannot exceed the validated opening ask. Explicit headroom checks cover each initial/current/next opening-price addition and preserve the legacy transition-target rejection.
- Epoch increment is guarded before adding one. A transition can enter epoch `U64`; its quote remains valid, while its next advance returns `EpochOverflow`.
- Rounding, the anchor-time clamp, error precedence and acceptance of structurally valid but unauthenticated later-epoch snapshots agree with the frozen specification. No division reordering or curve change was made.

Finite price and epoch headroom remain intentional API limits. A valid initialization or first-sale preflight does not guarantee all future sales can advance. Added ETH/ERC20 regressions verify that a later arithmetic-domain failure leaves application balances, allowance, issuance and curve state unchanged while a representable quote remains readable.

## Contract and integration review

The core has no storage, mutable binding, external calls, payment path, privileged entrypoint or sale events. Runtime opcode checks also exclude caller, chain, time, balance and other environment reads. Its nonpayable ABI guard may inspect attached call value. Core results depend on the supplied mathematical inputs; they are not proof of application state or sale history.

The reference consumer binds the reviewed code hash and chain, freezes config, supplies its own canonical timestamp/state, and checks the core result before payment. One reentrancy guard covers every lifecycle write route. State and issuance reservations precede callbacks; any payment, refund or delivery failure reverts the whole operation. Existing callback, mined rollback, two-app isolation, event replay and full 1,024-slot tests were rechecked. Actual NFT authorization and minting stay in downstream repos. The fixture's ERC20 handling is for nominal transfers; unusual token accounting requires a downstream policy.

## Compiler review

The current official [version-indexed bug list](https://raw.githubusercontent.com/ethereum/solidity/develop/docs/bugs_by_version.json) lists four issues for solc 0.8.24. The two mutual-recursion issues require `viaIR`, which is disabled. The remaining triggers are deleting a memory `bytes` element and array operations spanning the storage boundary; the core contains neither operation and has no storage. These trigger checks use the [current bug descriptions](https://raw.githubusercontent.com/ethereum/solidity/develop/docs/bugs.json), not only the historical 0.8.24 documentation. They apply to this exact source/settings combination and must be reconsidered after changes.

## Validation and frozen artifacts

- Default and release profiles: **223 tests passed** each. The strengthened opcode check subsequently passed against the release engine.
- Existing evidence retained: 67 frozen vectors, 512 model-backed deployed transitions, 48 legacy-Solidity comparisons and 1,536 specification/model transitions.
- New review coverage: 256 deterministic wide-integer scenarios, 192 corrupted-state/error comparisons, raw malformed-ABI cases, terminal-epoch closure, and ETH/ERC20 rollback at the finite price limit.
- Benchmark evidence: both compiler profiles rerun for all 1,024 slots; each full report is invariant under reversed transaction order. The optimized one-slot edge case was checked in both orders too.
- Build evidence: frozen ABI/version identity, no linking or immutable placeholders, exact source matches, release verification, rejection of the wrong compiler profile, and independent standard-JSON compilation matching creation and runtime bytes.

The [frozen manifest](../../evm/releases/pulse-core-v1/manifest.json) selects solc `0.8.24+commit.e11b9ed9`, optimizer 200 runs, `viaIR=false`, Shanghai, and IPFS CBOR metadata. Runtime size is **2,717 bytes**; creation size is **2,746 bytes**. Runtime code hash:

```text
0xfb48657163202d3cdb28060f1eb511fd1f5b93a6e0eb8657242b5632e2200a90
```

The bundle also includes the three-source standard input, interface/ABI, golden vectors and both bytecodes. It pins reviewed worktree content by hashes; no Git tag, committed revision or public deployment is asserted. Chain/address/transaction fields belong to Task 6.

From `evm/`, reproduce the release checks with:

```bash
npm ci
npm run test:core:release
npm run check:core:release
BENCH_ALLOCATION_SLOTS=1024 npm run benchmark:core:optimized
BENCH_ALLOCATION_SLOTS=1024 BENCH_SHARED_FIRST=1 npm run benchmark:core:optimized
```

`check:core:release` verifies rather than overwrites the freeze. Any change to frozen inputs requires review before deliberately regenerating it with `PULSE_WRITE_FREEZE=1`. A solc 0.8.24 executable can independently compile `releases/pulse-core-v1/standard-input.json` using `--standard-json`.

Next: **Task 6, Sol · high** — release tooling, target-chain estimates and testnet rehearsal using this frozen build, followed by the authorized production-release process. Application integrations remain independently scheduled in their own repositories.
