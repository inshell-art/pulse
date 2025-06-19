#[starknet::interface]
pub trait IPulseAuctionV1<TContractState> {
    /// ------------- VIEW -------------
    /// Return current ask price of the auction.
    fn get_current_price(self: @TContractState) -> u256;

    /// ------------- ACTION -------------
    /// Place a bid in the auction.
    fn bid(ref self: TContractState, max_price: u256);
}
