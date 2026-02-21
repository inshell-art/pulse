# Cairo Archive

This directory contains the archived Cairo/Starknet version of Pulse.

Status:

- Legacy/archived
- Not the default workflow for this repository
- Active implementation is Solidity under `evm/`

## Contents

- Workspace manifest: `legacy/cairo/Scarb.toml`
- Contracts/packages: `legacy/cairo/crates/`
- Legacy deployment metadata: `legacy/cairo/deployments/`
- Legacy snfoundry config: `legacy/cairo/snfoundry.toml`

## Legacy Commands

Run from this directory if you need to inspect or replay historical Cairo flows:

```bash
cd legacy/cairo
snforge test
```

Declare/deploy examples (legacy `sncast` flow) should be treated as historical references.
