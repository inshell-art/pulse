// -----------------------------------------------------------------------------
// Helper utilities and mock contracts used ONLY in the test-suite.
// Nothing here is compiled into production byte-code.
// -----------------------------------------------------------------------------

use starknet::ContractAddress;

/// -------------------------------------------------------------------------
/// Minimal helper contract that triggers re-entrancy
/// -------------------------------------------------------------------------
#[starknet::interface]
pub trait IReenteror<TContractState> {
    /// call auction.bid() twice in one execution frame.
    fn attack(ref self: TContractState, auction: ContractAddress, price: u256);
}


#[starknet::contract]
mod Reenteror {
    use core::integer::u256;
    use pulse::interfaces::i_pulse_auction_v1::{
        IPulseAuctionV1Dispatcher, IPulseAuctionV1DispatcherTrait,
    };
    use starknet::ContractAddress;
    use super::IReenteror;

    #[storage]
    struct Storage {}

    #[constructor]
    fn constructor(ref self: ContractState) {}

    #[abi(embed_v0)]
    impl ReenterorImpl of IReenteror<ContractState> {
        /// call auction.bid() twice in one execution frame.
        fn attack(ref self: ContractState, auction: ContractAddress, price: u256) {
            let d = IPulseAuctionV1Dispatcher { contract_address: auction };
            d.bid(price); // first entry – sets the re-entrancy lock
            d.bid(price); // nested entry – expected to revert
        }
    }
}
