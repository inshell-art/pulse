# pulse

**Pulse** is an on-chain implementation of **DAA - Decentralized Automatic Auction**.

Pulse is designed to be **NFT-agnostic**: the auction core does not assume any specific collection or minting style.
Instead, Pulse delegates delivery to a project-specific **adapter contract**.

Pricing curve intuition / sketch (Desmos):
https://www.desmos.com/calculator/1d89f93d21

---

## Concept

A **PulseAuction instance** is a deployed auction contract configured by parameters (curve constants, payment token, treasury, adapter).

High-level flow:

1. A buyer calls `bid(max_price)` on a PulseAuction instance.
2. Pulse computes the current ask using the DAA curve + state.
3. Pulse transfers payment (via `transfer_from`) to `treasury` using the configured `payment_token`.
4. Pulse calls `mint_adapter.settle(buyer, data)` to deliver the asset.

Behavior notes (per contract):
- The first bid is the **genesis** bid: price is fixed at `genesis_price`, and the curve activates after it.
- One bid per block is enforced.
- Subsequent bids use the active curve; the state is updated each sale.

---

## Architecture

Pulse is split into two layers:

### 1) PulseAuction (core)
- Owns the DAA state machine and pricing logic.
- Collects payment (ERC20-like token configured at deployment).
- Sends proceeds to a treasury address.
- Calls a mint/delivery adapter after purchase.

### 2) Mint Adapter (integration layer)
A `mint_adapter` is a small contract that bridges Pulse to your actual asset logic.

It defines what delivery means, for example:
- mint an ERC721 token
- mint an ERC1155 edition
- transfer a pre-minted token held in custody
- enforce project rules (allowlists, gating, supply caps)
- map auction purchases to token IDs (or any other scheme)

**Pulse stays universal; adapters stay specific.**

---

## Adapter guidance (recommended)

When writing an adapter, treat it as a security boundary:

- **Authenticate the caller**: only accept calls from the intended PulseAuction instance(s).
- **Validate limits**: supply caps, max per-wallet, allowlists, etc.
- **Keep state minimal**: store only what you must (e.g. next token id, receipts).
- **Fail loudly**: if delivery fails, revert so the purchase cannot complete silently.

(Exact adapter interface is defined in this repo's contracts; keep your adapter implementation aligned with it.)

---

## Deploy

This repo provides the **PulseAuction** contract (package: `pulse_auction`, contract: `PulseAuction`).

### Declare (class hash)

```bash
# Option A: using a sncast profile (recommended)
sncast --profile <profile> --json declare \
  --package pulse_auction --contract-name PulseAuction \
  --url <RPC>

# Option B: explicit account
sncast --account <ACCOUNT_NAME> --accounts-file <OZ_ACCOUNTS_JSON> --json declare \
  --package pulse_auction --contract-name PulseAuction \
  --url <RPC>
```

Record the returned `class_hash` - it is used to deploy any new PulseAuction instance.

Sepolia example:
- Class hash: `0x078e68bc1f02fdadb21bebfa5041b30a53c6e0245e69623a715dd5429934ac91`
- Declared tx: `0x07a47439c7f765f090d45aacae6de274146d9d56c526b5ca656f077b86932042`

---

### Deploy (instance)

Constructor args (order):

1. `start_delay_sec` (u64)
2. `k` (u256: low high)
3. `genesis_price` (u256: low high)
4. `genesis_floor` (u256: low high)
5. `initial_pts` (felt252)
6. `payment_token` (ContractAddress)
7. `treasury` (ContractAddress)
8. `mint_adapter` (ContractAddress)

Example:

```bash
sncast --profile <profile> --json deploy \
  --class-hash <CLASS_HASH> --url <RPC> \
  --constructor-calldata \
  0 \                      # start_delay_sec
  <K_LOW> <K_HIGH> \
  <GENESIS_LOW> <GENESIS_HIGH> \
  <FLOOR_LOW> <FLOOR_HIGH> \
  <PTS> \
  <PAYTOKEN_ADDR> \
  <TREASURY_ADDR> \
  <MINT_ADAPTER_ADDR>
```

Notes:
- `k`, `genesis_price`, and `genesis_floor` are u256 split into `(low high)`.
- `start_delay_sec` is seconds; `initial_pts` is the price-time scale.

---

## Parameters (intuitive meanings)

Pulse exposes curve parameters as deployment-time constants so each instance can represent a distinct auction configuration.

- `genesis_price`: starting reference price at the beginning of the curve.
- `genesis_floor`: minimum floor for the genesis mint only.
- `k`: curve stiffness / sensitivity (how sharply price responds).
- `initial_pts`: price-time scale (how fast the curve evolves in time).
- `start_delay_sec`: delay to shift the start time without redeploying logic.
- `payment_token`: the token used for settlement.
- `treasury`: receiver of proceeds.
- `mint_adapter`: delivery bridge into your asset logic.

---

## License
MIT.
