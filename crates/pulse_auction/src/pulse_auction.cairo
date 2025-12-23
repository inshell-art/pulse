//! PulseAuction – Decentralized Automatic Auction (DAA)
//!
//! # Core idea
//! *Price is measured in time.*
//! Between sales, price `y` and elapsed time `x` obey the constant-product
//! relation `x · y = k`, rendered for pricing as
//!
//!   y = k / (x - anchor_time) + floor_price
//!
//! After each winning bid (the **pump**):
//!   • `floor_price  ← last price`
//!   • `anchor_time ← t_last - k / Δt`,  where `Δt = t_last - t_prev`
//!
//! Hence the immediate ask becomes `floor_price + Δt×PTS`, then decays back toward
//! the new floor as blocks elapse.
//!
//! # Interactive model
//! Full demo with sliders and data logger:
//! https://www.desmos.com/calculator/m86reeiost
//!
//! # Implementation notes
//! *This block records the non-obvious choices that make Pulse’s on-chain
//!  behavior match its economic narrative (“price is belief unfolding in
//!  time”).*
//
//! ## Genesis vs open gate
//! • `open_time` is the earliest block-timestamp a bid can pass the guard.
//! • The **genesis** bid (first call after `open_time`) mints the first token
//!   returned by the mint adapter (token numbering lives inside the adapter, not the auction)
//!   and initializes the curve in one shot.  Before this bid:
//!     – `curve_active  = false`  (so `get_current_price()` just echoes
//!       `genesis_price`)
//!   After the bid, `curve_active = true` and the hyperbola starts.
//
//! ## One-bid-per-block guard
//! • `last_block` caches the block number of the most recent settlement.
//! • `assert(get_block_number() > last_block)` prevents two fills in one
//!   Starknet block – protects against re-entrancy and sandwich bundles.
//
//! ## Price-time equivalence
//! • Pulse measures price in **seconds** to embed “price = time”.
//! • Conversion factor **PTS** (field `price_time_scale`) .
//!   Waiting Δt seconds raises the next ask by `Δp = PTS × Δt`.
//
//! ## Anchor calculus (curve reset)
//! • After each sale we set
//!       Δt      = t_last − t_prev
//!       anchor  = t_last − k / (Δt × PTS)
//!       floor   = floor_price
//!   This guarantees the new curve passes through
//!   `(t_last, floor + Δt×PTS)` and always stays ≥ `floor`.
//
//! • **Ask calculation**
//!   `get_current_price()` computes the ask directly from k, anchor_time and
//!   floor_price via `ask(now) = k / (now - anchor) + floor`.  No `ask_price` is stored, because:
//!     – the post-sale ask is `floor + Δt×PTS` and the rest of the curve is implied
//!     – view calls execute off-chain and pay no gas
//!     - bid() calls calculate the ask from the same parameters
//!   Edge case: if `now ≤ anchor_time` (approaching the vertical asymptote), the
//!   view clamps to `floor + k` to avoid underflow while reflecting a very high ask.
//!
//! ## Payment transfer
//! • After allowance check:
//!   STRK.transfer_from(buyer, treasury, ask);
//! • Only then emit `Sale`.
//
//! ## Math safety
//! • Uses core `u256`; panics on overflow.  Swap to a fixed-point / checked
//!   math library (e.g. Cairo Safe-Math) for production.
//
//! ## Parameter mutability
//! • `k` and `price_time_scale` are stored in upgrade-friendly storage
//!   slots so governance can slow decay (raise k) or shrink per-block
//!   pump (lower PTS) if network fees change or deep liquidity appears.
//!
//! ## Scope
//! This contract sells a single $PATH collection. It is *not* a factory;
//! if multiple Pulse auctions are required, deploy one instance per drop
//! or build a factory wrapper in a future upgrade.
//!
//! # Storage layout
//! | Field             | Meaning (updated each sale)                               |
//! |------------------ |-----------------------------------------------------------|
//! | `open_time`       | time when auction opens (the curve may not be active yet) |
//! | `genesis_price`   | initial price (immutable)                                 |
//! | `genesis_floor`   | floor price for the genesis mint (immutable)              |
//! | `genesis_time`    | time when the genesis is sold (the curve is active)       |
//! | `curve_active`    | true if curve is active (genesis sold)                    |
//! | `curve_k`         | curvature `k` (immutable)                                 |
//! | `floor_price`     | curve floor `b` (last hammer)                             |
//! | `curve_start_time`| timestamp of last hammer (for `Δt`)                       |
//! | `last_block`      | block number of last hammer (1-sale-per-block guard)      |
//! | `pts`             | price time scale                                          |
//! | `mint_adapter`    | mint adapter contract address                             |
//! | `treasury`        | treasury address for proceeds                             |
//!
//! # Events
//! `Sale(buyer, token_id, price, timestamp, anchor_a, floor_b)` – emitted on every
//! settlement. `anchor_a` is the current curve anchor (a) and `floor_b` is the
//! current floor price (b) after the sale. This lets the frontend use a single
//! source of truth for the curve parameters.
//!
//! # Security / TODO
//! • replace naïve `u256` math with overflow-checked library
//!
//! _Documented with `//!` so `cairo-doc` includes this overview; use `///` for
//! item-level docs and `//` for internal dev notes._

use core::integer::u256;

pub fn validate_constructor_args(
    k: u256, genesis_price: u256, genesis_floor: u256, initial_pts: felt252,
) -> Result<(), felt252> {
    if k == 0_u256 {
        return Result::Err('K_ZERO_OR_NEGATIVE');
    }
    if genesis_price <= genesis_floor {
        return Result::Err('GAP_ZERO_OR_NEGATIVE');
    }

    match initial_pts.try_into() {
        Option::Some(pts_u128) => {
            if pts_u128 == 0_u128 {
                return Result::Err('PTS_ZERO_OR_NEGATIVE');
            }
        },
        Option::None => {
            return Result::Err('PTS_OUT_OF_RANGE');
        },
    };

    Result::Ok(())
}

#[starknet::contract]
mod PulseAuction {
    use core::integer::{u256, u64};
    use openzeppelin::security::ReentrancyGuardComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use pulse_adapter::interface::{IPulseAdapterDispatcher, IPulseAdapterDispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_block_number, get_block_timestamp, get_caller_address};
    use crate::interface::IPulseAuction;

    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    // ------------- STORAGE -------------
    #[storage]
    struct Storage {
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        // - Auction life cycle
        open_time: u64,
        genesis_time: u64,
        genesis_price: u256, // p₀
        genesis_floor: u256, // The dedicated floor price for the genesis mint only
        curve_active: bool,
        epoch_index: u64,
        // - Price curve
        curve_k: u256,
        anchor_time: u64, // a
        floor_price: u256, // b after the genesis mint
        curve_start_time: u64,
        last_block: u64,
        pts: felt252, // price-time scale (PTS), defined by constructor
        // - Settlement specifics
        payment_token: ContractAddress,
        mint_adapter: ContractAddress,
        treasury: ContractAddress,
    }

    // ------------- EVENTS -------------
    #[derive(Drop, starknet::Event)]
    pub struct Sale {
        #[key]
        buyer: ContractAddress,
        #[key]
        token_id: u256,
        price: u256,
        timestamp: u64,
        /// Current curve anchor "a" (as a block timestamp)
        anchor_a: u64,
        /// Current curve floor "b" (price at hammer)
        floor_b: u256,
        epoch_index: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Sale: Sale,
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
    }

    // ------------- CONSTRUCTOR -------------
    #[constructor]
    fn constructor(
        ref self: ContractState,
        start_delay_sec: u64, // delay before auction starts for iteration, convert to absolute timestamp for mainnet
        k: u256, // k
        genesis_price: u256, // p₀
        genesis_floor: u256, // b₀
        initial_pts: felt252, // PTS, price-time scale
        payment_token: ContractAddress,
        treasury: ContractAddress,
        mint_adapter: ContractAddress,
    ) {
        match super::validate_constructor_args(k, genesis_price, genesis_floor, initial_pts) {
            Result::Ok(()) => {},
            Result::Err(err) => {
                assert(false, err);
            },
        }
        let now: u64 = get_block_timestamp();

        // - Auction life cycle
        self.open_time.write(now + start_delay_sec);
        self.curve_active.write(false);
        self.curve_k.write(k);
        self.genesis_price.write(genesis_price);
        self.genesis_floor.write(genesis_floor);
        self.pts.write(initial_pts);
        self.epoch_index.write(0);

        // - Settlement specifics
        self.payment_token.write(payment_token);
        self.treasury.write(treasury);
        self.mint_adapter.write(mint_adapter);
    }


    /// Implementation of the public PulseAuction interface
    #[abi(embed_v0)]
    impl PulseAuctionInterfaceV1Impl of IPulseAuction<ContractState> {
        /// ------------- VIEW -------------

        /// Hyperbolic ask at the current block-timestamp.
        fn get_current_price(self: @ContractState) -> u256 {
            let now = get_block_timestamp();
            _get_current_price(self, now)
        }
        /// Whether the auction curve is active.
        fn curve_active(self: @ContractState) -> bool {
            self.curve_active.read()
        }
        /// NEW: all immutable parameters needed by the frontend.
        fn get_config(
            self: @ContractState,
        ) -> (
            u64, // open_time
            u256, // genesis_price
            u256, // genesis_floor
            u256, // k
            felt252 // pts     
        ) {
            (
                self.open_time.read(),
                self.genesis_price.read(),
                self.genesis_floor.read(),
                self.curve_k.read(),
                self.pts.read(),
            )
        }
        /// State parameters needed by the frontend.
        fn get_state(
            self: @ContractState,
        ) -> (
            u64, // epoch_index
            u64, // start_time
            u64, // anchor_time     
            u256, // floor_b
            bool // curve_active
        ) {
            (
                self.epoch_index.read(),
                self.curve_start_time.read(),
                self.anchor_time.read(),
                self.floor_price.read(),
                self.curve_active.read(),
            )
        }

        /// ------------- ACTION -------------

        /// Can not bid before the auction opens
        /// The genesis mint is the first public bid with the initial price, it activates the curve.
        /// And then, one block = one bid, with the price determined by the curve.
        fn bid(ref self: ContractState, max_price: u256) {
            self.reentrancy_guard.start();

            let now: u64 = get_block_timestamp();
            let blk: u64 = get_block_number();
            let data = array![].span(); // placeholder for the NFT metadata, empty for now

            assert(now >= self.open_time.read(), 'AUCTION_NOT_OPEN');
            assert(blk > self.last_block.read(), 'ONE_BID_PER_BLOCK');

            let ask: u256 = if !self.curve_active.read() {
                self.genesis_price.read() // fixed p₀ before the genesis mint
            } else {
                _get_current_price(@self, now)
            };

            assert(ask <= max_price, 'ASK_ABOVE_MAX_PRICE');

            let erc20 = IERC20Dispatcher { contract_address: self.payment_token.read() };
            erc20.transfer_from(get_caller_address(), self.treasury.read(), ask);

            let adapter = IPulseAdapterDispatcher { contract_address: self.mint_adapter.read() };
            let minted_id: u256 = adapter.settle(get_caller_address(), data);

            if !self.curve_active.read() {
                // genesis activation
                let floor_price = self.genesis_floor.read();
                let curve_start_time = now;
                let anchor_time = _calculate_anchor_time(
                    self.genesis_price.read(), floor_price, self.curve_k.read(), curve_start_time,
                );

                self.anchor_time.write(anchor_time);
                self.genesis_time.write(curve_start_time);
                self.curve_active.write(true);
                self.floor_price.write(floor_price);
                self.curve_start_time.write(curve_start_time);
                self.last_block.write(blk);
            } else {
                // regular update
                let last_price: u256 = ask; // the ask is the last price by the bid 
                let premium: u256 = (now - self.curve_start_time.read()).into()
                    * self.pts.read().into();
                let initial_ask = last_price + premium; // initial ask for the new curve
                let floor_price = last_price; // the new floor price is the last price
                let curve_start_time = now; // the new curve starts now
                let anchor_time = _calculate_anchor_time(
                    initial_ask, floor_price, self.curve_k.read(), curve_start_time,
                );
                self.anchor_time.write(anchor_time); // a

                // update other states
                self.floor_price.write(floor_price); // b
                self.curve_start_time.write(curve_start_time);
                self.last_block.write(blk);
            }

            let idx = self.epoch_index.read() + 1;
            self.epoch_index.write(idx);

            self
                .emit(
                    Sale {
                        buyer: get_caller_address(),
                        token_id: minted_id,
                        price: ask,
                        timestamp: now,
                        anchor_a: self.anchor_time.read(),
                        floor_b: self.floor_price.read(),
                        epoch_index: idx,
                    },
                );

            self.reentrancy_guard.end();
            return;
        }
    }

    // ------------- HELPERS -------------

    // To calculate time anchor "a" for the curve
    fn _calculate_anchor_time(
        initial_ask: u256, floor_price: u256, k: u256, curve_start_time: u64,
    ) -> u64 {
        // The anchor time is calculated as:
        // a = curve_start_time - k / (initial_ask - floor_price)
        assert(initial_ask > floor_price, 'ASK_LESS_THAN_FLOOR');

        let gap = (initial_ask - floor_price);
        assert(gap > 0, 'GAP_ZERO_OR_NEGATIVE');
        let k_over_gap_u64: u64 = (k / gap).try_into().expect('K_OVER_GAP_OVERFLOW');
        assert(curve_start_time > k_over_gap_u64, 'ANCHOR_TIME_UNDERFLOW');
        curve_start_time - k_over_gap_u64
    }

    // To get current price
    fn _get_current_price(self: @ContractState, now: u64) -> u256 {
        // If the curve has not been activated yet (genesis_time == 0),
        // the only valid price is the fixed opening ask (genesis_price).
        // This is the case for the genesis bid.
        // After the genesis bid, the curve is active and the price is calculated
        // using the hyperbolic formula.
        if !self.curve_active.read() {
            return self.genesis_price.read();
        }

        let k: u256 = self.curve_k.read();
        let a: u64 = self.anchor_time.read();
        let b: u256 = self.floor_price.read();

        // Handle edge case where anchor time might be in the future
        // This can happen in edge cases due to precision or timing
        if now <= a {
            // Return a very high price (approaching infinity as time approaches anchor)
            // This is mathematically correct for the hyperbolic curve
            return b + k;
        }

        k / (now - a).into() + b
    }

    // -------------UNIT TESTS -------------
    #[cfg(test)]
    mod tests {
        use super::*;

        /// k = 600, gap = 10 ⇒ k / gap = 60 ⇒ a = 1_000 – 60 = 940
        #[test]
        fn anchor_time_basic() {
            let ask: u256 = 110_u256; // initial ask price
            let floor: u256 = 100_u256; // floor price
            let k: u256 = 600_u256; // curvature constant
            let t: u64 = 1_000; // curve_start_time

            assert_eq!(_calculate_anchor_time(ask, floor, k, t), 940_u64);
        }
    }
}
