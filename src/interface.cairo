#[starknet::interface]
pub trait IPulseAuction<TContractState> {
    /// ------------- VIEW -------------
    /// Return current ask price of the auction.
    fn get_current_price(self: @TContractState) -> u256;
    /// Return whether the auction curve is active.
    fn curve_active(self: @TContractState) -> bool;
    /// Return the floor price of the auction.
    /// Mostly, it's for the first curve lacks of the floor set by the auction creator
    /// and not in any event.
    /// Calling it on the specified block (the first block of the auction).
    fn get_floor_price(self: @TContractState) -> u256;

    /// ------------- ACTION -------------
    /// Place a bid in the auction.
    fn bid(ref self: TContractState, max_price: u256);
}
