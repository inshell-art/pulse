# pulse

Pulse Auction contract (DAA) for PATH.

## Declare (class hash)

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

Record the returned `class_hash` — it is used to deploy any new PulseAuction instance.

### Sepolia (v0.10 RPC)
- Class hash: `0x078e68bc1f02fdadb21bebfa5041b30a53c6e0245e69623a715dd5429934ac91`
- Declared tx: `0x07a47439c7f765f090d45aacae6de274146d9d56c526b5ca656f077b86932042`

## Deploy (instance)

Constructor args (order):
```
start_delay_sec (u64)
k (u256: low high)
genesis_price (u256: low high)
genesis_floor (u256: low high)
initial_pts (felt252)
payment_token (ContractAddress)
treasury (ContractAddress)
mint_adapter (ContractAddress)
```

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
