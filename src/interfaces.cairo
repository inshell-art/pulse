use starknet::ContractAddress;

// --- Supporting Structs for Interface Return Types ---
// Auction pricing config for encapsulating the auction's pricing strategy for now
#[derive(Copy, Drop, Serde)]
struct AuctionPricingConfig {
    init_price: u256,
    k: u256,
    // Might add more, not figured out yet
}

// The config for a specific auction instance
// target_address is a universal address as the target of the auction, which combines the auction to
// an external contracts
#[derive(Copy, Drop, Serde)]
pub struct AuctionConfig {
    beneficiary: ContractAddress,
    bid_token: ContractAddress,
    pricing_config: AuctionPricingConfig,
    target_address: ContractAddress,
}

// Beats are cycles of bidding in the auction
// The current beat is the ongoing one, not yet completed
#[derive(Copy, Drop, Serde)]
pub struct CurrentBeat {
    current_beat_start_price: u256,
    current_beat_start_time: u64,
}

// The outcome of a beat done, including winner and price
#[derive(Copy, Drop, Serde)]
pub struct BeatOutcome {
    auction_id: u64, // Which auction instance this beat belongs to
    beat_start_price: u256, // Price at the start of this beat
    beat_start_time: u64, // Time at the start of this beat
    beat_end_time: u64, // Time at the end of this beat
    beat_end_price: u256, // Price at the end of this beat
    winner: ContractAddress,
}

// --- The Interface Trait ---
#[starknet::interface]
pub trait IPulseAuction<TContractState> {
    // --- Auction Creation --- //
    /// Creates and starts a new independent pulse auction instance.
    /// Requires caller to have approved this contract for the NFT.
    /// Returns the unique ID for the new auction instance.
    fn create_auction(
        ref self: TContractState,
        bid_token: ContractAddress,
        beneficiary: ContractAddress,
        pricing_config: AuctionPricingConfig,
        target_address: ContractAddress,
    ) -> u64;

    // --- Bidding --- //
    /// Places a bid equal to the current price for the specified auction instance,
    /// winning the current beat if successful.
    /// Requires prior ERC20 approval of bid_token for the current price.
    /// Emits BeatWon event on success. Resets beat cycle for the auction instance.
    fn bid(ref self: TContractState, auction_id: u64);

    // --- View Functions --- //
    /// Gets the dynamically calculated price for the current ongoing beat
    /// for a specific auction instance.
    fn get_current_price(self: @TContractState, auction_id: u64) -> u256;

    /// Gets the configuration parameters for a specific auction instance.
    /// Returns None if auction_id is invalid.
    fn get_auction_info(self: @TContractState, auction_id: u64) -> Option<AuctionConfig>;

    /// Gets the outcome details (winner, price, time) of a previously completed beat.
    /// Uses the GLOBAL beat_id. Returns None if beat_id is invalid or not yet won.
    fn get_beat_outcome(self: @TContractState, beat_id: u64) -> Option<BeatOutcome>;

    /// Gets the ID that will be assigned to the *next* beat winner globally across all auctions.
    fn get_next_beat_id(self: @TContractState) -> u64;

    // --- Verification Function (for PathMinter) --- //
    /// Returns the recorded winner address for a specific global beat_id.
    /// Returns zero address if beat_id is invalid or not yet won.
    /// PathMinter uses this + its internal claimed map to verify eligibility.
    fn get_beat_winner(self: @TContractState, beat_id: u64) -> ContractAddress;
    // --- Admin Functions (Optional - Requires OwnableComponent Impl) --- //
/// Returns the current admin owner of the platform contract.
// fn owner(self: @TContractState) -> ContractAddress;
/// Allows admin owner to update certain parameters (e.g., platform fees - not shown).
// fn set_platform_parameters(ref self: TContractState, ...);
/// Allows admin owner to pause/unpause specific auctions or the whole platform.
// fn set_auction_status(ref self: TContractState, auction_id: u64, new_status:
// AuctionInstanceStatus);
}
