# Pulse (EVM / Solidity)

This folder contains a Solidity port of the StarkNet Cairo contracts in this repo:

- `evm/src/PulseAuction.sol` ports `crates/pulse_auction/src/pulse_auction.cairo`
- `evm/src/interfaces/IPulseAdapter.sol` ports `crates/pulse_adapter/src/interface.cairo`
- `evm/src/interfaces/IPulseAuction.sol` ports `crates/pulse_auction/src/interface.cairo`

Mocks (for local testing/integration):

- `evm/src/mocks/StubAdapter.sol`
- `evm/src/mocks/EvilAdapter.sol`
- `evm/src/mocks/MockERC20.sol`

## Hardhat

```bash
cd evm
npm install
npm test
```
