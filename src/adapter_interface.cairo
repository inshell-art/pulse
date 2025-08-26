use starknet::ContractAddress;

#[starknet::interface]
pub trait IAuctionAdapter<TContractState> {
    fn settle(ref self: TContractState, buyer: ContractAddress, data: Span<felt252>) -> u256;

    /// Return target contract
    fn target(self: @TContractState) -> ContractAddress;
}
