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
//! Hence the immediate ask becomes `floor_price` + Δt`, then decays back toward
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
//! • The **genesis** bid (first call after `open_time`) mints token #0 (presumably)
//!   and initializes the curve in one shot.  Before this bid:
//!     – `floor_price   = constructor.floor_price`
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
//!       anchor  = t_last − k / Δt
//!       floor   = floor_price
//!   This guarantees the new curve passes through
//!   `(t_last, floor + Δt)` and always stays ≥ `floor`.
//
//! • **Ask calculation**
//!   `get_current_price()` computes the ask directly from k, anchor_time and
//!   floor_price.  No `ask_price` is stored, because:
//!     – the ask is always `floor + Δt*PTS`
//!     – view calls execute off-chain and pay no gas
//!     - bid() calls calculate the ask from the same parameters
//!
//! ## Payment transfer
//! • After allowance check:
//!   STRK.transfer_from(buyer, treasury, floor_price);
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
//! `Sale(buyer, token_id, price, timestamp)` – emitted on every settlement.
//!
//! # Security / TODO
//! • replace naïve `u256` math with overflow-checked library
//! • integrate ERC-20 / STRK transfer before main-net deployment
//!
//! _Documented with `//!` so `cairo-doc` includes this overview; use `///` for
//! item-level docs and `//` for internal dev notes._

#[starknet::contract]
mod PulseAuction {
    use core::integer::{u256, u64};
    use openzeppelin::security::ReentrancyGuardComponent;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_block_number, get_block_timestamp, get_caller_address};
    use crate::adapter_interface::{IAuctionAdapterDispatcher, IAuctionAdapterDispatcherTrait};
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
    struct Sale {
        #[key]
        buyer: ContractAddress,
        #[key]
        token_id: u256,
        price: u256,
        timestamp: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
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
        assert(k > 0, 'K_ZERO_OR_NEGATIVE');
        assert(genesis_price - genesis_floor > 0, 'GAP_ZERO_OR_NEGATIVE');
        let now: u64 = get_block_timestamp();

        // - Auction life cycle
        self.open_time.write(now + start_delay_sec);
        self.curve_active.write(false);
        self.curve_k.write(k);
        self.genesis_price.write(genesis_price);
        self.genesis_floor.write(genesis_floor);
        self.pts.write(initial_pts);

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

            let adapter = IAuctionAdapterDispatcher { contract_address: self.mint_adapter.read() };
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

            self
                .emit(
                    Sale {
                        buyer: get_caller_address(),
                        token_id: minted_id,
                        price: ask,
                        timestamp: now,
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
        // a = curve_start_time - k / (initial_ask - floor_price)*pts
        assert(initial_ask > floor_price, 'ASK_LESS_THAN_FLOOR');

        let gap = (initial_ask - floor_price);
        assert(gap > 0, 'GAP_ZERO_OR_NEGATIVE');
        let k_over_gap_u64: u64 = (k / gap).try_into().expect('K_OVER_GAP_OVERFLOW');
        curve_start_time - k_over_gap_u64
    }

    // To get current price
    fn _get_current_price(self: @ContractState, now: u64) -> u256 {
        // If the curve has not been activated yet (genesis_time == 0),
        // the only valid price is the fixed opening ask (floor_price).
        // This is the case for the genesis bid.
        // After the genesis bid, the curve is active and the price is calculated
        // using the hyperbolic formula.
        if !self.curve_active.read() {
            return self.genesis_price.read();
        }

        let k: u256 = self.curve_k.read();
        let a: u64 = self.anchor_time.read();
        let b: u256 = self.floor_price.read();

        k / (now - a).into() + b
    }

    // -------------UNIT TESTS -------------
    #[cfg(test)]
    mod tests {
        use super::*;

        /// k = 600, gap = 10 ⇒ k / gap = 60 ⇒ a = 1_000 – 60 = 940
        #[test]
        fn anchor_time_basic() {
            let ask = 110_u128.into(); // initial ask price
            let floor = 100_u128.into(); // floor price
            let k = 600_u128.into(); // curvature constant
            let t: u64 = 1_000; // curve_start_time

            assert_eq!(_calculate_anchor_time(ask, floor, k, t), 940_u64);
        }
    }
}
