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

## Legacy Cairo Archive

The Cairo/Starknet codebase is archived and not the default workflow anymore.

- `legacy/cairo/`
- Archived packages: `legacy/cairo/crates/`
- Archived deployment metadata: `legacy/cairo/deployments/`
- Archived runbook: `legacy/cairo/README.md`

## Concept

PulseAuction is NFT-agnostic: the auction core does not assume a specific minting system.
Delivery is delegated to a project-specific adapter.

High-level flow:

1. Buyer calls `bid(maxPrice)`.
2. Auction computes ask from current curve state.
3. Auction settles payment to treasury.
4. Auction calls adapter `settle(...)` to deliver/mint.

## License

MIT
