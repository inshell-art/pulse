#[starknet::interface]
pub trait IPulseAuction<TContractState> {
    /// ------------- VIEW -------------
    /// Return current ask price of the auction.
    fn get_current_price(self: @TContractState) -> u256;
    /// Return whether the auction curve is active.
    fn curve_active(self: @TContractState) -> bool;
    /// Return the genesis price of the auction.
    fn get_genesis_floor(self: @TContractState) -> u256;

    /// ------------- ACTION -------------
    /// Place a bid in the auction.
    fn bid(ref self: TContractState, max_price: u256);
}
