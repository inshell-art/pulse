# pulse

**Pulse** is an on-chain implementation of **DAA — Decentralized Automatic Auction**.

It is designed to be **NFT-agnostic**: Pulse does not “know” PATH or any particular collection.
Instead, Pulse delegates project-specific minting / delivery logic to an **adapter contract**.

> DAA curve sketch / intuition was explored in Desmos:
> https://www.desmos.com/calculator/1d89f93d21

---

## What Pulse is (and what it isn’t)

### Pulse is
- A **universal auction core** (DAA) that can sell/mint *some asset* over time with a deterministic pricing curve.
- A contract you can deploy many times as **instances**, each configured by parameters (genesis price, floor, curve scale…).
- **Composable**: integrates with different NFT drops / mints via a `mint_adapter`.

### Pulse is not
- “An auction contract for PATH only.”  
  (Earlier drafts described it that way — but the intended architecture is adapter-driven and generic.)

---

## Architecture

Pulse is split into two layers:

### 1) PulseAuction (core)
- Owns the DAA state machine and pricing.
- Collects payment (ERC20-like token configured at deployment).
- Sends proceeds to a treasury address.
- At settlement, it calls an adapter to deliver the asset to the buyer.

### 2) Mint Adapter (integration layer)
A `mint_adapter` is a small contract that bridges Pulse to your actual asset logic.

It is responsible for “what does delivery mean?”
- mint an ERC721 token
- mint an ERC1155 edition
- transfer a pre-minted token held in custody
- enforce allowlists / project rules / gating
- map auction IDs → token IDs (or any other scheme)

Pulse stays clean and universal; adapters stay specific.

---

## Deploy

This repo provides the **PulseAuction** contract (package: `pulse_auction`, contract: `PulseAuction`).

### Declare (class hash)

```bash
# Option A: using a sncast profile (recommended)
sncast --profile <profile> --json declare   --package pulse_auction --contract-name PulseAuction   --url <RPC>

# Option B: explicit account
sncast --account <ACCOUNT_NAME> --accounts-file <OZ_ACCOUNTS_JSON> --json declare   --package pulse_auction --contract-name PulseAuction   --url <RPC>
```

Record the returned `class_hash` — it is used to deploy any new PulseAuction instance.

#### Sepolia (v0.10 RPC)
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
sncast --profile <profile> --json deploy   --class-hash <CLASS_HASH> --url <RPC>   --constructor-calldata   0 \                      # start_delay_sec
  <K_LOW> <K_HIGH>   <GENESIS_LOW> <GENESIS_HIGH>   <FLOOR_LOW> <FLOOR_HIGH>   <PTS>   <PAYTOKEN_ADDR>   <TREASURY_ADDR>   <MINT_ADAPTER_ADDR>
```

Notes:
- `k`, `genesis_price`, and `genesis_floor` are u256 split into `(low high)`.
- `start_delay_sec` is seconds; `initial_pts` is the price-time scale.

---

## Parameters (intuitive meanings)

Pulse exposes curve parameters as deployment-time constants so each instance can represent a distinct “drop.”

- **genesis_price**: starting reference price at the beginning of the auction curve.
- **genesis_floor**: minimum reference floor (prevents price from collapsing to zero).
- **k**: curve “stiffness” / sensitivity (how sharply price responds over time / demand).
- **initial_pts**: price-time scale (a unit that anchors “how fast” the curve breathes).
- **start_delay_sec**: delay to shift the start time without redeploying logic.

(For the curve intuition, see the Desmos model link above.)

---

## Why adapters?

Adapters make Pulse composable:

- **One Pulse core** can serve many collections and many mint styles.
- Projects can evolve their mint logic without touching the auction core.
- Auditors can review the auction mechanism independently from mint rules.

In other words: Pulse is a **universal DAA engine**, and adapters are **project skins**.

---

## License
MIT.
