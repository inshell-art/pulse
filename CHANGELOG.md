# Changelog

All notable changes to this project will be documented in this file.  
The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.4] - 2005-4-18

### Added

- **Supporting structs** in `interfaces.cairo` for richer auction data:
  - `AuctionPricingConfig`
  - `AuctionConfig`
  - `CurrentBeat`
  - `BeatOutcome`
- **Expanded `IPulseAuction` interface** with new methods:
  - `bid(ref self, auction_id)`
  - `get_current_price(self, auction_id) -> u256`
  - `get_auction_info(self, auction_id) -> Option<AuctionConfig>`
  - `get_beat_outcome(self, beat_id) -> Option<BeatOutcome>`
  - `get_next_beat_id(self) -> u64`
  - `get_beat_winner(self, beat_id) -> ContractAddress`
- **Stub module** `PulseAuctionContract` in `src/lib.cairo` as a placeholder for:
  - on‑chain auction logic
  - bidding process
  - administrative controls

### Changed

- n/a

### Fixed

- n/a

---

## [0.1.3 and before] – 2025‑04‑17

### Added

- Switched to unified `[[target]]` syntax in `Scarb.toml`
- Declared explicit `[lib]` to expose `pulse::interfaces` for downstream crates

### Fixed

- Resolved TOML parse errors by migrating from `[target.lib]` to `[lib]`

---

[Unreleased]: https://github.com/inshell-art/pulse/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/inshell-art/pulse/releases/tag/v0.1.3...v0.1.4
[0.1.3]: https://github.com/inshell-art/pulse/releases/tag/v0.1.3
