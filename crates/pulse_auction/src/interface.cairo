#[starknet::interface]
pub trait IPulseAuction<TContractState> {
    /// ------------- VIEW -------------
    /// Return current ask price of the auction.
    fn get_current_price(self: @TContractState) -> u256;
    /// Return whether the auction curve is active.
    fn curve_active(self: @TContractState) -> bool;
    /// NEW: all immutable parameters needed by the frontend.
    fn get_config(
        self: @TContractState,
    ) -> (
        u64, // open_time 
        u256, // genesis_price
        u256, // genesis_floor
        u256, // k
        felt252 // pts
    );

    /// ------------- ACTION -------------
    /// Place a bid in the auction.
    fn bid(ref self: TContractState, max_price: u256);
}
