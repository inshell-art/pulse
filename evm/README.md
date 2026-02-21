# Pulse (EVM / Solidity)

This folder contains a Solidity port of the StarkNet Cairo contracts in this repo:

- `evm/src/PulseAuction.sol` ports `legacy/cairo/crates/pulse_auction/src/pulse_auction.cairo`
- `evm/src/interfaces/IPulseAdapter.sol` ports `legacy/cairo/crates/pulse_adapter/src/interface.cairo`
- `evm/src/interfaces/IPulseAuction.sol` ports `legacy/cairo/crates/pulse_auction/src/interface.cairo`

Mocks (for local testing/integration):

- `evm/src/mocks/StubAdapter.sol`
- `evm/src/mocks/EvilAdapter.sol`
- `evm/src/mocks/MockERC20.sol`

Full test strategy/spec:

- `docs/evm/pulse-cascade-testing-spec.md`
- `docs/evm/rehearsal-handbook.md`

## Hardhat

```bash
cd evm
npm install
npm test
npm run estimate:deploy:cost
```

Override assumptions (optional):

```bash
GAS_PRICE_GWEI=20 ETH_USD=3000 npm run estimate:deploy:cost
```

## Local Devnet (ETH Payment)

`PulseAuction` supports native ETH settlement when `paymentToken == address(0)`.

In one terminal:

```bash
cd evm
npm run node
```

In another terminal:

```bash
cd evm
npm run deploy:local:eth
npm run smoke:local:eth
npm run scenario:local:eth
```

`deploy:local:eth` writes deployment metadata to `evm/deployments/localhost-eth.json`.
`scenario:local:eth` writes a cascade report to `evm/deployments/reports/localhost-cascade-eth-report.json`.
