use core::array::ArrayTrait;
use snforge_std::cheatcodes::{CheatSpan, mock_call};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyTrait, EventsFilterTrait, cheat_block_number,
    cheat_block_timestamp, cheat_caller_address, declare, spy_events,
};
use starknet::ContractAddress;
use crate::interface::{
    IPulseAuctionDispatcher, IPulseAuctionDispatcherTrait, IPulseAuctionSafeDispatcher,
    IPulseAuctionSafeDispatcherTrait,
};
use crate::tests::test_setup::*;

//
// Helpers
//

#[starknet::interface]
trait IEvilAdapter<T> {
    fn set_auction(ref self: T, auction: ContractAddress);
}

#[starknet::contract]
mod EvilAdapter {
    use pulse_adapter::interface::IPulseAdapter;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use crate::interface::{IPulseAuctionDispatcher, IPulseAuctionDispatcherTrait};
    use super::IEvilAdapter;

    #[storage]
    struct Storage {
        auction: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, auction: ContractAddress) {
        self.auction.write(auction);
    }

    #[abi(embed_v0)]
    impl ImplIEvilAdapter of IEvilAdapter<ContractState> {
        fn set_auction(ref self: ContractState, auction: ContractAddress) {
            self.auction.write(auction);
        }
    }

    #[abi(embed_v0)]
    impl Adapter of IPulseAdapter<ContractState> {
        fn settle(ref self: ContractState, buyer: ContractAddress, data: Span<felt252>) -> u256 {
            assert(get_caller_address() == self.auction.read(), 'ONLY_AUCTION');

            let auc = IPulseAuctionDispatcher { contract_address: self.auction.read() };
            // Very large ceiling so price guards won’t mask the reentrancy guard
            auc.bid(10_000_000_u128.into());

            0_u128.into()
        }

        fn target(self: @ContractState) -> ContractAddress {
            self.auction.read()
        }
    }
}

#[derive(Drop)]
struct EvilEnv {
    auction_addr: ContractAddress,
    auction: IPulseAuctionDispatcher,
    auction_safe: IPulseAuctionSafeDispatcher,
    evil_addr: ContractAddress,
}

fn deploy_env_with_evil(start_delay_sec: u64) -> EvilEnv {
    let evil_class = declare("EvilAdapter").unwrap().contract_class();
    let (evil_addr, _) = evil_class
        .deploy(@{
            let mut cd = ArrayTrait::new();
            ZERO_CONTRACT_ADDRESS().serialize(ref cd);
            cd
        })
        .unwrap();

    let auction_class = declare("PulseAuction").unwrap().contract_class();
    let (auction_addr, _) = auction_class
        .deploy(
            @{
                let mut cd = ArrayTrait::new();
                start_delay_sec.serialize(ref cd);
                K.serialize(ref cd);
                GENESIS_PRICE.serialize(ref cd);
                GENESIS_FLOOR.serialize(ref cd);
                PTS.serialize(ref cd);
                PAY_TOKEN().serialize(ref cd); // your mocked ERC-20
                TREASURY().serialize(ref cd);
                evil_addr.serialize(ref cd); // <— the evil adapter
                cd
            },
        )
        .unwrap();

    cheat_caller_address(evil_addr, ADMIN(), CheatSpan::TargetCalls(1));
    let adapter_admin = IEvilAdapterDispatcher { contract_address: evil_addr };
    adapter_admin.set_auction(auction_addr);

    EvilEnv {
        auction_addr,
        auction: IPulseAuctionDispatcher { contract_address: auction_addr },
        auction_safe: IPulseAuctionSafeDispatcher { contract_address: auction_addr },
        evil_addr,
    }
}

//
// Tests
//

#[test]
#[feature("safe_dispatcher")]
fn reentrancy_is_blocked_genesis() {
    let e = deploy_env_with_evil(0);

    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), array![1].span(), 1);

    cheat_block_number(e.auction_addr, 1_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, 1_000_u64, CheatSpan::TargetCalls(1));

    let mut spy = spy_events();

    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    match e.auction_safe.bid(GENESIS_PRICE) {
        Result::Ok(_) => panic!("expected reentrancy guard revert"),
        Result::Err(_panic_data) => {},
    }

    let filtered = spy.get_events().emitted_by(e.auction_addr);
    assert_eq!(filtered.events.len(), 0);

    assert!(!e.auction.curve_active());
}
