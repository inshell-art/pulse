use core::array::ArrayTrait;
use pulse_adapter::interface::{
    IPulseAdapterDispatcher, IPulseAdapterDispatcherTrait, IPulseAdapterSafeDispatcher,
    IPulseAdapterSafeDispatcherTrait,
};
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
use crate::pulse_auction::validate_constructor_args;
use crate::tests::test_setup::*;

//
// Setup
//

#[derive(Drop)]
struct Env {
    auction_addr: ContractAddress,
    auction: IPulseAuctionDispatcher,
    auction_safe: IPulseAuctionSafeDispatcher,
    adapter_addr: ContractAddress,
    adapter: IPulseAdapterDispatcher,
    adapter_safe: IPulseAdapterSafeDispatcher,
    adapter_admin: IStubAdapterDispatcher,
}

//
// Helpers
//

#[starknet::interface]
trait IStubAdapter<T> {
    fn set_auction(ref self: T, auction: ContractAddress);
    fn set_should_revert(ref self: T, v: bool);
    fn peek_next(self: @T) -> u256;
}

#[starknet::contract]
mod StubAdapter {
    use pulse_adapter::interface::IPulseAdapter;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use super::IStubAdapter;

    #[storage]
    struct Storage {
        auction: ContractAddress,
        next: u256,
        should_revert: bool,
    }

    #[constructor]
    fn constructor(ref self: ContractState, auction: ContractAddress, first_id: u256) {
        self.auction.write(auction);
        self.next.write(first_id);
        self.should_revert.write(false);
    }

    // For testing only
    #[abi(embed_v0)]
    impl ImplIStubAdapter of IStubAdapter<ContractState> {
        fn set_auction(ref self: ContractState, auction: ContractAddress) {
            self.auction.write(auction);
        }
        fn set_should_revert(ref self: ContractState, v: bool) {
            self.should_revert.write(v);
        }
        fn peek_next(self: @ContractState) -> u256 {
            self.next.read()
        }
    }

    #[abi(embed_v0)]
    impl Adapter of IPulseAdapter<ContractState> {
        fn settle(ref self: ContractState, buyer: ContractAddress, data: Span<felt252>) -> u256 {
            assert(get_caller_address() == self.auction.read(), 'ONLY_AUCTION');
            assert(!self.should_revert.read(), 'ADAPTER_REVERT');
            let id = self.next.read();
            self.next.write(id + 1);
            id
        }
        fn target(self: @ContractState) -> ContractAddress {
            self.auction.read()
        }
    }
}

fn deploy_env(start_delay_sec: u64) -> Env {
    // Adapter first (auction unknown yet → placeholder, then set)
    let adapter_class = declare("StubAdapter").unwrap().contract_class();
    let (adapter_addr, _) = adapter_class
        .deploy(
            @{
                let mut cd = ArrayTrait::new();
                ZERO_CONTRACT_ADDRESS().serialize(ref cd);
                FIRST_ID.serialize(ref cd);
                cd
            },
        )
        .unwrap();
    let adapter = IPulseAdapterDispatcher { contract_address: adapter_addr };
    let adapter_safe = IPulseAdapterSafeDispatcher { contract_address: adapter_addr };
    let adapter_admin = IStubAdapterDispatcher { contract_address: adapter_addr };

    // Auction
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
                PAY_TOKEN().serialize(ref cd); // will mock it
                TREASURY().serialize(ref cd);
                adapter_addr.serialize(ref cd);
                cd
            },
        )
        .unwrap();
    let auction = IPulseAuctionDispatcher { contract_address: auction_addr };
    let auction_safe = IPulseAuctionSafeDispatcher { contract_address: auction_addr };

    // Finish wiring: adapter.auction = auction_addr
    cheat_caller_address(adapter_addr, ADMIN(), CheatSpan::TargetCalls(1));
    adapter_admin.set_auction(auction_addr);

    Env { auction_addr, auction, auction_safe, adapter_addr, adapter, adapter_safe, adapter_admin }
}

//
// gl_* (global / config)
//

#[test]
fn gl_constructor_config_and_initial_price() {
    let e = deploy_env(0);

    let (open_time, gp, gf, k, pts) = e.auction.get_config();
    assert!(open_time >= 0_u64);
    assert_eq!(gp, GENESIS_PRICE);
    assert_eq!(gf, GENESIS_FLOOR);
    assert_eq!(k, K);
    assert_eq!(pts, PTS);

    assert!(!e.auction.curve_active());
    assert_eq!(e.auction.get_current_price(), GENESIS_PRICE);
}

#[test]
fn gl_constructor_rejects_zero_k() {
    let res = validate_constructor_args(0_u256.into(), GENESIS_PRICE, GENESIS_FLOOR, PTS);
    match res {
        Result::Ok(()) => { panic!("expected K_ZERO_OR_NEGATIVE"); },
        Result::Err(err) => { assert(err == 'K_ZERO_OR_NEGATIVE', 'expected K_ZERO_OR_NEGATIVE'); },
    }
}

#[test]
fn gl_anchor_and_price_match_formula_after_second_sale() {
    let e = deploy_env(0);

    // For two sales
    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), array![1].span(), 2);

    // --- Genesis sale at t1 = 1000, block 1 --------------------------------------
    let t1: u64 = 1000;
    cheat_block_number(e.auction_addr, 1_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, t1, CheatSpan::TargetCalls(1));

    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(GENESIS_PRICE);
    assert!(e.auction.curve_active());

    // After genesis:
    let k: u256 = K;
    let gap1: u256 = GENESIS_PRICE - GENESIS_FLOOR;
    let a1_offset_u64: u64 = (k / gap1).try_into().expect('K_OVER_GAP_OVERFLOW');
    let a1: u64 = t1 - a1_offset_u64;
    let b1: u256 = GENESIS_FLOOR;

    // --- Second sale at t2 = 1010, block 2 ---------------------------------------
    let t2: u64 = 1010;
    cheat_block_number(e.auction_addr, 2_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, t2, CheatSpan::TargetCalls(1));

    // The ask just before the 2nd bid is:
    let denom_t2_minus_a1: u256 = (t2 - a1).into();
    let last_price_2: u256 = (k / denom_t2_minus_a1) + b1;

    // Place the second bid with a high ceiling to avoid price ceiling reverts.
    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(10_000_u128.into());

    // After second sale, the contract sets:
    let pts_u256: u256 = PTS.into(); // PTS is felt252 in your tests
    let delta_t: u64 = t2 - t1;
    let premium: u256 = delta_t.into() * pts_u256; // gap for the new curve
    let a2_offset_u64: u64 = (k / premium).try_into().expect('K_OVER_PREMIUM_OVERFLOW');
    let a2: u64 = t2 - a2_offset_u64;
    let b2: u256 = last_price_2;

    // --- Sample the new curve at t3 = 1020 ---------------------------------------
    let t3: u64 = 1020;
    cheat_block_timestamp(e.auction_addr, t3, CheatSpan::TargetCalls(1));

    let y: u256 = e.auction.get_current_price(); // on-chain view
    let denom_t3_minus_a2: u256 = (t3 - a2).into();
    let expected_y: u256 = (k / denom_t3_minus_a2) + b2;

    assert_eq!(y, expected_y);
}


//
// bid_* (bidding)
//

#[test]
#[feature("safe_dispatcher")]
fn bid_before_open_time_reverts() {
    let e = deploy_env(123); // opens in the future
    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    match e.auction_safe.bid(GENESIS_PRICE) {
        Result::Ok(_) => panic!("AUCTION_NOT_OPEN expected"),
        Result::Err(panic_data) => { assert_eq!(*panic_data.at(0), 'AUCTION_NOT_OPEN'); },
    }
}

#[test]
fn bid_at_open_time_and_at_exact_ask_succeeds() {
    let e = deploy_env(0);
    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), array![1].span(), 1);

    cheat_block_number(e.auction_addr, 1_u64, CheatSpan::TargetCalls(2));
    cheat_block_timestamp(e.auction_addr, 1_000_u64, CheatSpan::TargetCalls(2));

    let ask = e.auction.get_current_price(); // == genesis_price
    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(ask); // should pass because ask <= max_price
}

#[test]
fn bid_emits_sale_event() {
    let e = deploy_env(0);

    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), array![1].span(), 1);

    cheat_block_number(e.auction_addr, 1_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, 1_000_u64, CheatSpan::TargetCalls(1));

    let buyer = ALICE();
    cheat_caller_address(e.auction_addr, buyer, CheatSpan::TargetCalls(1));

    let mut spy = spy_events();
    e.auction.bid(GENESIS_PRICE);

    let events = spy.get_events().emitted_by(e.auction_addr);
    assert!(events.events.len() > 0, "expected at least one event (Sale)");
}


// -----------------------------------------------------------------------------
// Sale event payload checks (anchor_a and floor_b)
// -----------------------------------------------------------------------------

#[test]
fn st_state_includes_anchor_and_floor_genesis() {
    let e = deploy_env(0);

    // Mock payment for 1 settlement
    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), array![1].span(), 1);

    // Genesis at t1, block 1
    let t1: u64 = 1000;
    cheat_block_number(e.auction_addr, 1_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, t1, CheatSpan::TargetCalls(1));

    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(GENESIS_PRICE);

    // Compute expected anchor and floor after genesis
    let k: u256 = K;
    let gap1: u256 = GENESIS_PRICE - GENESIS_FLOOR;
    let a1_offset_u64: u64 = (k / gap1).try_into().expect('K_OVER_GAP_OVERFLOW');
    let a1: u64 = t1 - a1_offset_u64;
    let b1: u256 = GENESIS_FLOOR;

    // Read state and assert
    let (epoch, start, anchor, floor, active) = e.auction.get_state();
    assert!(active);
    assert_eq!(epoch, 1_u64);
    assert_eq!(start, t1);
    assert_eq!(anchor, a1);
    assert_eq!(floor, b1);
}

#[test]
fn st_state_includes_anchor_and_floor_second_sale() {
    let e = deploy_env(0);

    // Mock payments for two settlements
    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), array![1].span(), 2);

    // --- Genesis at t1, block 1 ---
    let t1: u64 = 1000;
    cheat_block_number(e.auction_addr, 1_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, t1, CheatSpan::TargetCalls(1));
    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(GENESIS_PRICE);

    // Compute a1 and b1 for second-sale expectations
    let k: u256 = K;
    let gap1: u256 = GENESIS_PRICE - GENESIS_FLOOR;
    let a1_offset_u64: u64 = (k / gap1).try_into().expect('K_OVER_GAP_OVERFLOW');
    let _a1: u64 = t1 - a1_offset_u64;
    let _b1: u256 = GENESIS_FLOOR;

    // --- Second sale at t2, block 2 ---
    let t2: u64 = 1010;
    cheat_block_number(e.auction_addr, 2_u64, CheatSpan::TargetCalls(2));
    cheat_block_timestamp(e.auction_addr, t2, CheatSpan::TargetCalls(2));

    // Ask just before second bid (becomes last_price) from on-chain view
    let last_price_2: u256 = e.auction.get_current_price();
    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(10_000_u128.into());

    // Expected new anchor and floor after 2nd sale
    let delta_t: u64 = t2 - t1;
    let premium: u256 = delta_t.into() * PTS.into();
    let a2_offset_u64: u64 = (k / premium).try_into().expect('K_OVER_PREMIUM_OVERFLOW');
    let a2: u64 = t2 - a2_offset_u64;
    let b2: u256 = last_price_2;

    // Read state and assert
    let (epoch, start, anchor, floor, active) = e.auction.get_state();
    assert!(active);
    assert_eq!(epoch, 2_u64);
    assert_eq!(start, t2);
    assert_eq!(anchor, a2);
    assert_eq!(floor, b2);
}

#[test]
#[feature("safe_dispatcher")]
fn bid_ask_above_max_reverts() {
    let e = deploy_env(0);
    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    match e.auction_safe.bid(GENESIS_PRICE - 1_u256) {
        Result::Ok(_) => panic!("ASK_ABOVE_MAX_PRICE expected"),
        Result::Err(panic_data) => { assert_eq!(*panic_data.at(0), 'ASK_ABOVE_MAX_PRICE'); },
    }
}

#[test]
#[feature("safe_dispatcher")]
fn bid_genesis_activates_curve() {
    let e = deploy_env(0);

    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), true, 1);

    cheat_block_timestamp(e.auction_addr, 1_000_u64, CheatSpan::TargetCalls(1));
    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(GENESIS_PRICE);

    assert!(e.auction.curve_active());
    assert_eq!(e.adapter_admin.peek_next(), FIRST_ID + 1_u128.into());
}

#[test]
#[feature("safe_dispatcher")]
fn bid_second_block_succeeds_and_adapter_advances_again() {
    let e = deploy_env(0);

    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), true, 2);

    cheat_block_number(e.auction_addr, 1_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, 1_000_u64, CheatSpan::TargetCalls(1));

    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(GENESIS_PRICE);
    assert!(e.auction.curve_active());
    assert_eq!(e.adapter_admin.peek_next(), FIRST_ID + 1_u128.into());

    cheat_block_number(e.auction_addr, 2_u64, CheatSpan::TargetCalls(1));
    cheat_block_timestamp(e.auction_addr, 1_010_u64, CheatSpan::TargetCalls(1));

    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    e.auction.bid(10_000_u128.into());

    assert_eq!(e.adapter_admin.peek_next(), FIRST_ID + 2_u128.into());
}

//
// adp_* (adapter)
//

#[test]
#[feature("safe_dispatcher")]
fn adp_only_auction_can_settle() {
    let e = deploy_env(0);
    cheat_caller_address(e.adapter_addr, ALICE(), CheatSpan::TargetCalls(1));
    match e.adapter_safe.settle(ALICE(), array![].span()) {
        Result::Ok(_) => panic!("adapter.settle by non-auction should revert"),
        Result::Err(panic_data) => { assert_eq!(*panic_data.at(0), 'ONLY_AUCTION'); },
    }
}

#[test]
fn adp_adapter_target_returns_auction() {
    let e = deploy_env(0);
    assert_eq!(e.adapter.target(), e.auction_addr);
}

#[test]
#[feature("safe_dispatcher")]
fn adp_bid_adapter_revert_rolls_back() {
    let e = deploy_env(0);

    mock_call(PAY_TOKEN(), SELECTOR_TRANSFER_FROM(), array![1].span(), 1);

    cheat_caller_address(e.adapter_addr, ADMIN(), CheatSpan::TargetCalls(1));
    e.adapter_admin.set_should_revert(true);

    cheat_caller_address(e.auction_addr, ALICE(), CheatSpan::TargetCalls(1));
    match e.auction_safe.bid(GENESIS_PRICE) {
        Result::Ok(_) => panic!("expected adapter revert"),
        Result::Err(panic_data) => { assert_eq!(*panic_data.at(0), 'ADAPTER_REVERT'); },
    }

    assert!(!e.auction.curve_active());
    assert_eq!(e.adapter_admin.peek_next(), FIRST_ID);
}
