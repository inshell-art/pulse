# Pulse Core V1 release procedure and status

**Status (2026-09-23): the frozen core and both reference consumers passed Anvil first, then were deployed and rehearsed on Sepolia. Ethereum mainnet deployment is deferred and is not a gate for this release scope.** The frozen build, ABI, interface, vectors and integration guide are available in this repository. An address from a local network is temporary and must never be copied into a downstream production binding.

| Target | Chain ID | Purpose | Status |
| --- | ---: | --- | --- |
| Ethereum mainnet | 1 | Possible later production core | Deferred; no deployment planned now |
| Sepolia | 11155111 | Public testnet core and two-consumer rehearsal | Core deployed and on-chain verified; rehearsal passed; explorer source publication awaits approval |
| Anvil | 31337 | Local release rehearsal | Passed |

## Release identity

- Semantic version: `1.0.0`; `version()` ID: `0x2e01a46bd995ce90b010c47771e291edb941414ea8ef01f795dcca13fa4ced88`.
- Compiler: solc `0.8.24+commit.e11b9ed9`; optimizer 200; `viaIR=false`; Shanghai EVM target; IPFS CBOR metadata.
- Frozen creation code: 2,746 bytes, hash `0x784983cd261e3a7505011279969ee7b4e05ca2778ec0bd129d9221f9a2684de7`.
- Frozen runtime code: 2,717 bytes, hash `0xfb48657163202d3cdb28060f1eb511fd1f5b93a6e0eb8657242b5632e2200a90`.
- [Manifest](../../evm/releases/pulse-core-v1/manifest.json), [ABI](../../evm/releases/pulse-core-v1/IPulseCore.abi.json), [interface](../../evm/releases/pulse-core-v1/IPulseCore.sol), [vectors](../../evm/releases/pulse-core-v1/vectors.json), [standard compiler input](../../evm/releases/pulse-core-v1/standard-input.json), [integration guide](pulse-core-integration.md) and [numerical specification](pulse-core-api.md).

The manifest pins reviewed **worktree contents by hash**, not a committed source revision or Git tag. Before a public release, commit/review the complete artifact set and record its commit or tag in the chain-specific release record. Keep the frozen build unchanged unless a new review deliberately replaces it. V1 core is immutable: a revised implementation needs a new address and reviewed release identity.

## Local gates and evidence

From `evm/`:

```bash
npm ci
npm run check:core:release
npm run test:core:release
npm run rehearse:core:local
npm run rehearse:core:anvil
```

The local rehearsal deploys the exact frozen creation bytecode, checks the deployment transaction, runtime bytes/hash and `version()`, then binds two separate reference consumers to one core. One opens on a scheduled time and settles in ETH. The other fulfills 1,024 initial slots, activates on the final fulfillment without reporting it as a Pulse sale, and settles a subsequent Pulse purchase in a test ERC20. Both sale prices/states are compared with the independent BigInt model. The rehearsal checks each treasury, delivery, state isolation and that the core holds no ETH. Wrong-chain and no-code bindings are rejected. The in-process Hardhat run writes `evm/deployments/reports/pulse-core-v1-hardhat-edr.json`; the Anvil run writes `evm/deployments/reports/pulse-core-v1-anvil.json`. Both are **ignored, local-only** reports. Start Anvil separately on `127.0.0.1:8545` with chain ID 31337 and Shanghai before running the Anvil command; set `PULSE_ANVIL_RPC_URL` for a different local URL. This tests the Pulse core and reference consumers, not the actual PATH or signatures.gallery application contracts.

The local node RPC smoke check also exercised unsigned deployment preparation and post-deployment verification. On that temporary chain, frozen-core deployment used **640,793 gas**. Reference consumers are test fixtures; PATH and signatures.gallery integration and mint behavior remain their own release work.

## Sepolia result

The deployment and rehearsal commands are `npm run deploy:core:sepolia`, `npm run rehearse:core:sepolia`, and `npm run finalize:core:sepolia` from `evm/`. They default to the existing `~/.opsec/path/env/sepolia.env` configuration, require the approved public signer address, and record pending transaction hashes under ignored `evm/deployments/sepolia/` so an interrupted run can resume. `PULSE_SEPOLIA_ENV_FILE` can select another environment file with the same RPC/keystore/password-file keys. Signing material is read in memory and is never written to the repository. The explorer source command is separate and requires its own publication approval.

The [chain-specific release record](../../evm/releases/pulse-core-v1/sepolia.json) pins chain **11155111**, core address **`0xfb1Cc26356b1b0361c414Ec1B5fB52c5FEDc3EAC`**, deployment transaction `0x898d37981ab2ab4a49545d89b9b66a79b21c3d79c1c069320f1d9b4b90ddd513` in block **11,764,730**, and the exact frozen runtime hash. The core deployment consumed **640,793 gas** and **0.000689495089133706 Sepolia ETH** in execution fees. Runtime bytes, deployment creation bytes, transaction receipt and `version()` were checked against the frozen bundle. The on-chain deployment journal and full rehearsal journal are ignored local files; the public record contains no RPC credential or signing material.

Two test-only consumers bound that same core. The scheduled ETH consumer made a sale at **901 wei**. The conditional ERC20 consumer registered and fulfilled **1,024 slots**; its final fulfillment established `openTime` and emitted no Pulse `Sale`. Its later purchase cleared at **914 token base units**. Both sales' asks and next states matched the independent model, and both treasuries received exactly the corresponding ask. The rehearsal comprised **33 transactions**, **98,200,154 gas**, and **0.109711458625612564 Sepolia ETH** in actual execution fees for reference infrastructure, registrations, fulfillments, activation and purchases. It is a testnet behavior proof, not an estimate of real PATH or signatures.gallery integration costs.

Source publication to Etherscan is a separate, currently unapproved external step. The on-chain bytecode/transaction identity is verified; the core deployment and all reference rehearsal transactions are below Sepolia's finalized block as of the latest recorded check. Explorer source verification is marked `not-published` until explicitly authorized and completed. The public record's `sourceRevision` is also unset because the current reviewed source remains uncommitted in the worktree.

## Target-chain sequence

1. Use Anvil (31337) for local core/reference-consumer tests, then Sepolia (11155111) for the public testnet rehearsal. Both are complete. The preparation and verification CLIs also recognize Ethereum mainnet (1) for a later, separately requested release.
2. **Completed on Sepolia:** deploy the exact frozen creation bytecode, verify its transaction and runtime identity, deploy two reference consumers bound to that address, and rehearse scheduled and 1,024-slot conditional launch, sales, settlement and event reconstruction. See the chain-specific record above. The testnet consumers are fixtures only.
3. If Ethereum mainnet deployment is requested later, prepare an unsigned transaction with `PULSE_RPC_URL`, `PULSE_EXPECTED_CHAIN_ID` and `PULSE_DEPLOYER_ADDRESS` set. Run `npm run prepare:core:deployment`. It checks the RPC chain, obtains pending nonce and fee data, estimates gas, and writes the full unsigned transaction under ignored `evm/deployments/prepared/`. It **does not sign or broadcast**. Review the current nonce, gas limit, fee policy and deployer balance before any separately authorized submission.
4. After a later approved production deployment, run `npm run verify:core:deployment` with the chain, address and transaction hash. Publish a chain-specific address record together with the ABI, interface, vectors, full manifest, source revision, compiler settings, runtime hash and integration guide. Downstream applications should pin the approved chain/address/hash; a frontend's direct `eth_call` to the core is only a calculation, never proof of a sale.

The RPC URL may contain an access token; supply it through the environment and keep it out of committed files. No signing key is needed by the preparation or verification scripts. The scripts do not update the frozen manifest with temporary network values.

## Deferred work and application boundary

The current Pulse release scope ends at the Anvil and Sepolia core/reference-consumer checks. The PATH and signatures.gallery contracts are separate downstream integrations; their actual mint, allowlist, payment, authorization and core-binding paths still need their own Anvil tests in those repositories. Their 1,024-slot condition must be checked against the real signatures.gallery contract after integration, not inferred from this fixture.

Ethereum mainnet deployment is deferred. A read-only mainnet RPC quote estimated **647,046 gas** for creating the frozen core on 2026-09-23, but this is only a volatile historical snapshot and no production deployer was selected. Explorer source publication and a source commit/tag are separate release hygiene steps; neither has been completed or silently treated as mainnet authorization.
