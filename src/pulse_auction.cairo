//! PulseAuction – Decentralized Automatic Auction
//!
//! # Core idea
//! *Price is measured in time.*
//! Between sales, price `y` and elapsed time `x` obey the constant-product
//! relation `x · y = k`, rendered for pricing as
//!
//!   y = k / (x - anchor_time) + floor_price
//!
//! After each winning bid (the **pump**):
//!   • `floor_price  ← hammer_price`
//!   • `anchor_time ← t_last - k / Δt`,  where `Δt = t_last - t_prev`
//!
//! Hence the immediate ask becomes `hammer_price + Δt`, then decays back toward
//! the new floor as blocks elapse.
//!
//! # Interactive model
//! Full demo with sliders and data logger:
//! https://www.desmos.com/calculator/m86reeiost
//!
//! # Implementation notes
//! *This section records design choices that are not obvious from the bare
//!  maths but are critical for a correct on-chain implementation.*
//!
//! • **Genesis vs. open gate**
//!   `open_time` is the *earliest* block-timestamp at which any bid may be
//!   processed.  The **genesis** bid is simply the first call that passes the
//!   open-time guard; it sets all curve state (`floor_price`, `anchor_time`,
//!   `last_time`, `last_block`) in one shot.  No artificial “pre-mint” token
//!   exists.
//
//! • **One-bid-per-block safety**
//!   The field `last_block` stores the block number of the most-recent sale;
//!   a guard `assert(block > last_block)` prevents re-entrancy and accidental
//!   double mints in the same Starknet block.
//
//! • **Price–time equivalence scale**
//!   Pulse expresses price in the **same numeric units** as elapsed time
//!   (seconds).  This “price = time” convention means that adding a waiting
//!   interval Δt seconds literally adds Δt *price-units* to the next ask.
//!   Internally we store all amounts as `u256` to keep head-room, but the
//!   conceptual scale factor is **1 second ≙ 1 price-unit** which is
//!   `price_time_scale (PTS) in the code.
//
//! • **Anchor calculus**
//!   After every sale we solve
//!   `anchor_time := t_last − k / Δt`,
//!   where `Δt = t_last − t_prev`.  This guarantees that the new hyperbola
//!   passes through `(t_last , floor_price + Δt)` and maintains the invariant
//!   `price ≥ floor_price` for all future blocks.
//
//! • **Ask cache (`ask_price`)**
//!   The current ask is *derived* from the curve but cached in `ask_price` so
//!   off-chain callers can fetch it with one storage read instead of running
//!   the division.  The value is refreshed at every bid and on any external
//!   call that would observe a lower decay than the cached figure.
//
//! • **Treasury transfer stub**
//!   The contract presently omits ERC-20/STRK transfer logic; a future upgrade
//!   or wrapper must credit `recipient` with the `hammer_price` before the
//!   mint is finalised.
//
//! • **Math safety**
//!   All math uses Cairo’s core `u256` ops and panics on overflow.  Replace
//!   with a checked fixed-point library (e.g., Cairo-Safe-Math) prior to
//!   production deployment.
//

//! # Storage layout
//! | Field            | Meaning (updated each sale)                               |
//! |------------------|-----------------------------------------------------------|
//! | `open_time`      | first block-timestamp when bids are accepted              |
//! | `anchor_time`    | horizontal shift `a`                                      |
//! | `floor_price`    | curve floor `b` (last hammer)                             |
//! | `curve_k`        | curvature `k` (immutable)                                 |
//! | `last_time`      | timestamp of last hammer (for `Δt`)                       |
//! | `last_block`     | block number of last hammer (1-sale-per-block guard)      |
//! | `next_token_id`  | sequential NFT id                                         |
//! | `target_contract`| PathNFT collection address                                |
//! | `recipient`      | treasury address for proceeds                             |
//!
//! # Events
//! `Sale(buyer, price, timestamp)` – emitted on every settlement.
//!
//! # Security / TODO
//! • replace naïve `u256` math with overflow-checked library
//! • add re-entrancy guard around `safe_mint`
//! • integrate ERC-20 / STRK transfer before main-net deployment
//!
//! _Documented with `//!` so `cairo-doc` includes this overview; use `///` for
//! item-level docs and `//` for internal dev notes._

#[starknet::contract]
mod PulseAuction {
    use core::integer::{u256, u64};
    use path_nft::i_path_nft::{IPathNFTDispatcher, IPathNFTDispatcherTrait};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_block_number, get_block_timestamp, get_caller_address};
    use crate::interfaces::i_pulse_auction_v1::IPulseAuctionV1;

    // ------------- STORAGE -------------
    #[storage]
    struct Storage {
        // - Auction life cycle
        open_time: u64, // time when auction opens (the curve may not be active yet)
        genesis_time: u64, // time when the genesis is sold (the curve is active)
        curve_active: bool, // true if curve is active
        // - Price curve
        curve_k: u256, // curvature "k" (hyperbolic's)
        time_anchor: u64, // absolute timestamp "a" in the formula (always < now)
        last_price: u256, // price paid in previous sale, identical to current price floor
        ask_price: u256, // ask price currently 
        last_time: u64, // block-timestamp of previous sale, absolute too
        last_block: u64, // block-number of previous sale
        // - Settlement specifics
        target_contract: ContractAddress, // NFT contract to settle sale (e.g. ERC-721)
        recipient: ContractAddress, // recipient of the auction proceeds 
        next_token_id: u64 // next token ID to be sold
    }

    // ------------- EVENTS -------------
    #[derive(Drop, starknet::Event)]
    struct Sale {
        #[key]
        buyer: ContractAddress, // address of the buyer
        price: u256, // price paid in the sale
        timestamp: u64 // timestamp of the sale
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        Sale: Sale,
    }

    // ------------- CONSTRUCTOR -------------
    #[constructor]
    fn constructor(
        ref self: ContractState,
        start_delay_sec: u64, // delay before auction starts for iteration, convert to absolute timestamp for mainnet
        k: u256, // k
        initial_price: u256, // p₀
        price_floor_b: u256, // b
        recipient: ContractAddress,
        target_contract: ContractAddress,
        genesis_id: u64,
    ) {
        assert(k > 0, 'K_ZERO_OR_NEGATIVE');
        let now: u64 = get_block_timestamp();

        // life cycle flags
        self.open_time.write(now + start_delay_sec);
        self.curve_active.write(false);

        // constant curve parameters
        self.curve_k.write(k);
        self.last_price.write(price_floor_b);
        self.ask_price.write(initial_price);

        // settlement specifics
        self.next_token_id.write(genesis_id);
        self.recipient.write(recipient);
        self.target_contract.write(target_contract);

        // a₀ = now - k/(p₀-b)
        let gap = initial_price - price_floor_b;
        assert(gap > 0, 'GAP_ZERO_OR_NEGATIVE');
        let k_over_gap_u64: u64 = (k / gap).try_into().expect('K_OVER_GAP_OVERFLOW');
        let a0 = now - k_over_gap_u64;
        self.time_anchor.write(a0);
    }


    /// Implementation of the public PulseAuction interface
    #[abi(embed_v0)]
    impl PulseAuctionInterfaceV1Impl of IPulseAuctionV1<ContractState> {
        /// ------------- VIEW -------------

        /// Hyperbolic ask at the current block-timestamp.
        fn get_current_price(self: @ContractState) -> u256 {
            /// If the curve has not been activated yet (genesis_time == 0),
            /// the only valid price is the fixed opening ask (last_price).
            if !self.curve_active.read() {
                return self.last_price.read();
            }

            // Standard curve:  k / (x - a) + b
            let now: u64 = get_block_timestamp();
            let a: u64 = self.time_anchor.read();

            let k: u256 = self.curve_k.read();
            let b: u256 = self.price_floor_b.read();

            k / (now - a).into() + b
        }

        /// ------------- ACTION -------------

        /// Can not bid before the auction opens
        /// The genesis mint is the first public bid with the initial price, it activates the curve.
        /// And then, one block = one bid, with the price determined by the curve.
        fn bid(ref self: ContractState, max_price: u256) {
            let now: u64 = get_block_timestamp();
            let blk: u64 = get_block_number();
            let genesis_id: u256 = self
                .next_token_id
                .read()
                .into(); // convert to u256 for the NFT mint
            let data = array![].span(); // placeholder for the NFT metadata, empty for now

            // 1) global guards
            assert(now >= self.open_time.read(), 'AUCTION_NOT_OPEN');
            assert(blk > self.last_block.read(), 'ONE_BID_PER_BLOCK');

            // 2) first public bid (genesis mint)
            if !self.curve_active.read() {
                let ask: u256 = self
                    .last_price
                    .read(); // fixed p₀, the initial_price while constructing passed here
                assert(ask <= max_price, 'ASK_ABOVE_MAX_PRICE');

                // mint first public token, the Genesis
                let nft = IPathNFTDispatcher { contract_address: self.target_contract.read() };
                nft.safe_mint(get_caller_address(), genesis_id, data);

                // anchor curve
                self.genesis_time.write(now);
                self.last_time.write(now);
                self.curve_active.write(true);
                self.last_block.write(blk);
                self.last_price.write(ask);

                let gap: u256 = ask - self.price_floor_b.read();
                let shift: u64 = (self.curve_k.read() / gap).try_into().expect('SHIFT_OVERFLOW');
                self.time_anchor.write(now - shift);

                // bookkeeping
                self.next_token_id.write(self.next_token_id.read() + 1);

                emit!(Sale { buyer: get_caller_address(), price: ask, timestamp: now });
                return;
            }

            // 3) regular-auction path
            // ──────────────────────────────────
            let elapsed: u64 = now - self.genesis_time.read();
            let a: u64 = self.time_anchor.read();
            let k: u256 = self.curve_k.read();
            let b: u256 = self.price_floor_b.read();

            let price: u256 = k / (elapsed - a).into() + b;
            assert(price <= max_price, 'PRICE_TOO_HIGH');

            // mint next token and update state
            let nft = IPathNFTDispatcher { contract_address: self.target_contract.read() };
            nft.safe_mint(get_caller_address());

            self.last_price.write(price);
            self.last_time.write(now);
            self.last_block.write(blk);
            self.next_token_id.write(self.next_token_id.read() + 1);

            emit!(Sale { buyer: get_caller_address(), price: price, timestamp: now });
        }
    }

    // ------------- HELPERS -------------

    // To calculate time anchor "a" for the curve
    fn calculate_time_anchor(
        now: u64, k: u256, last_price: u256, ask_price: u256, last_time: u64,
    ) -> u64 {
        let floor_price: u256 = last_price; // price floor is the last price
        let gap = ask_price - floor_price;
        assert(gap > 0, 'GAP_ZERO_OR_NEGATIVE');
        let k_over_gap_u64: u64 = (k / gap).try_into().expect('K_OVER_GAP_OVERFLOW');
        last_time - k_over_gap_u64
    }
}
