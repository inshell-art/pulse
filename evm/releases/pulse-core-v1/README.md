# Pulse Core V1 release bundle

This directory pins the reviewed **1.0.0** source/build. The [manifest](manifest.json) records solc `0.8.24+commit.e11b9ed9`, Shanghai, optimizer 200, ABI, vector and bytecode hashes. Its `deployment` field remains `null` because that manifest is chain-neutral; [sepolia.json](sepolia.json) holds the verified Sepolia deployment and rehearsal. Local development addresses are not release addresses.

The repository release tag is [`pulse-core-v1.0.0`](https://github.com/inshell-art/pulse/releases/tag/pulse-core-v1.0.0). Sepolia consumers should pin chain ID **11155111**, core address **`0xfb1Cc26356b1b0361c414Ec1B5fB52c5FEDc3EAC`**, and the runtime hash below. This is a testnet release; no Ethereum mainnet core address is published.

Consumers need [IPulseCore.sol](IPulseCore.sol) or [the ABI](IPulseCore.abi.json), an approved chain/address pair, and the exact runtime hash:

```text
0xfb48657163202d3cdb28060f1eb511fd1f5b93a6e0eb8657242b5632e2200a90
```

The [golden vectors](vectors.json) and [standard compiler input](standard-input.json) support independent checks. The compiler-generated [creation](PulseCoreV1.creation.hex) and [runtime](PulseCoreV1.runtime.hex) bytecode are frozen. `npm run check:core:release` in `evm/` checks them against source and build settings without rewriting the bundle.

The [release procedure](../../../docs/evm/pulse-core-release.md) explains Anvil/Sepolia verification and records the optional, deferred Ethereum mainnet procedure. Application integration and real-application Anvil tests belong in each downstream repository.
