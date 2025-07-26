#[cfg(test)]
mod tests {
    use core::integer::u256;
    use core::traits::Into;
    use pulse::interface::{IPulseAuctionDispatcher, IPulseAuctionDispatcherTrait};
    use snforge_std::{
        CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_block_number,
        cheat_block_timestamp, declare, mock_call, start_cheat_caller_address,
        stop_cheat_caller_address,
    };
    use starknet::ContractAddress;
    use crate::tests::helpers::{IReenterorSafeDispatcher, IReenterorSafeDispatcherTrait};

    // ---------- constants ----------
    const K_WEI: u128 = 1_000_000_000_000_000_000_000_000; // 1e24
    const GENESIS_WEI: u128 = 1_000_000_000_000_000_000_000; // 1e21
    const GENESIS_FLOOR: u128 = 900_000_000_000_000_000_000; // 9e20
    const GENESIS_HAMMER_TIME: u64 = 1_700_000_000; // to avoid overflow on anchor time a

    const CURVE_K: u256 = K_WEI.into();
    const GENESIS: u256 = GENESIS_WEI.into();
    const FLOOR: u256 = GENESIS_FLOOR.into();
    const INITIAL_PTS: felt252 = 100_000_000_000_000_000_u128.into(); // 1e17


    // ---------- deploy helper ----------
    fn deploy_reenteror() -> ContractAddress {
        let class = declare("Reenteror").unwrap().contract_class();
        let (addr, _) = class.deploy(@array![]).unwrap();
        addr
    }

    // deploys a pulse auction with a 10s delay before it opens
    fn deploy_pulse_after_10s() -> (
        IPulseAuctionDispatcher, ContractAddress, ContractAddress, ContractAddress,
    ) {
        let admin: ContractAddress = 1.try_into().unwrap();
        let buyer: ContractAddress = 2.try_into().unwrap();
        let path_nft: ContractAddress = 3.try_into().unwrap(); // dummy NFT

        let class = declare("PulseAuction").unwrap().contract_class();
        let calldata = array![
            10_u64.into(), // start_delay_sec
            K_WEI.into(),
            0, // k.low , k.high
            GENESIS_WEI.into(),
            0, // genesis.low, high
            GENESIS_FLOOR.into(),
            0, // floor.low , high
            INITIAL_PTS, // price-time scale
            admin.into(), // treasury
            path_nft.into(), // PATH NFT
            0_u64.into() // genesis_id
        ];
        let (addr, _) = class.deploy(@calldata).unwrap();
        (IPulseAuctionDispatcher { contract_address: addr }, buyer, admin, path_nft)
    }

    #[test]
    fn constructor_sets_initial_state() {
        let (auction, _, _, _) = deploy_pulse_after_10s();
        assert(auction.get_current_price() == GENESIS, 'wrong opening ask');
        assert(!auction.curve_active(), 'curve should be inactive');
    }

    #[test]
    #[should_panic(expected: 'AUCTION_NOT_OPEN')]
    fn cannot_bid_before_open() {
        let (auction, buyer, admin, path_nft) = deploy_pulse_after_10s();
        start_cheat_caller_address(auction.contract_address, buyer);

        mock_call(admin, selector!("transfer_from"), array![1], 1);
        mock_call(path_nft, selector!("safe_mint"), array![1], 1);

        auction.bid(GENESIS);
    }

    #[test]
    fn get_current_price_returns_genesis_at_not_open() {
        let (auction, _, _, _) = deploy_pulse_after_10s();
        assert(auction.get_current_price() == GENESIS, 'wrong genesis price');
    }

    #[test]
    fn first_three_bids_curve_integrity() {
        // ---0. Deploy the auction and mock the NFT transfer for all bids
        let (auction, buyer, admin, path_nft) = deploy_pulse_after_10s();
        mock_call(admin, selector!("transfer_from"), array![1], 3);
        mock_call(path_nft, selector!("safe_mint"), array![1], 3);

        // ---1. Genesis bid at GENESIS_HAMMER_TIME, on blk = 1
        let FIRST_BID_TIME: u64 = GENESIS_HAMMER_TIME; // 10_010
        cheat_block_timestamp(auction.contract_address, FIRST_BID_TIME, CheatSpan::TargetCalls(1));
        cheat_block_number(auction.contract_address, 1, CheatSpan::TargetCalls(1));
        start_cheat_caller_address(auction.contract_address, buyer);
        auction.bid(GENESIS);
        stop_cheat_caller_address(auction.contract_address);
        assert(auction.curve_active(), 'curve NOT active');
        // Anchor a of the first curve, for the second bid:
        let anchor_time_a = calculate_anchor_a(GENESIS, FLOOR, CURVE_K, GENESIS_HAMMER_TIME);

        // ----2. Second bid after 100 seconds, on blk = 2, on the first curve
        let SECOND_BID_TIME: u64 = GENESIS_HAMMER_TIME + 100; // 10_110
        cheat_block_timestamp(auction.contract_address, SECOND_BID_TIME, CheatSpan::TargetCalls(2));
        cheat_block_number(auction.contract_address, 2, CheatSpan::TargetCalls(2));
        let ask = auction.get_current_price();
        auction.bid(ask); // should succeed

        // The price at the second bid time is calculated as:
        let floor_price = FLOOR; // floor price is the genesis price 
        let expected = CURVE_K / (SECOND_BID_TIME - anchor_time_a).into() + floor_price.into();
        assert_eq!(ask, expected, "price mismatch on second bid");
        // Switch to assert in prod:
        // assert(current_price == expected, 'price mismatch after delta_t');

        // calculate anchor a of the second curve at SECOND_BID_TIME, for the third bid:
        let premium = (SECOND_BID_TIME - FIRST_BID_TIME).into() * INITIAL_PTS.into();
        let initial_ask = ask + premium; // initial ask for the new curve
        let floor_price = ask; // floor price is the last price
        let curve_start_time = SECOND_BID_TIME; // the start time of the new curve
        let anchor_time_a = calculate_anchor_a(initial_ask, floor_price, CURVE_K, curve_start_time);

        // ----3. Third bid after 200 seconds, on blk = 3
        let THIRD_BID_TIME: u64 = SECOND_BID_TIME + 200; // 10_310
        cheat_block_timestamp(auction.contract_address, THIRD_BID_TIME, CheatSpan::TargetCalls(2));
        cheat_block_number(auction.contract_address, 3, CheatSpan::TargetCalls(2));
        let ask = auction.get_current_price(); // the new price 
        auction.bid(ask); // should succeed

        // The price at the third bid time is calculated:
        // floor price is the last ask, assigned above to `floor_price`
        let expected = CURVE_K / (THIRD_BID_TIME - anchor_time_a).into() + floor_price.into();
        assert_eq!(ask, expected, "price mismatch on third bid");
        // Switch to assert in prod:
        // assert(current_price == expected, 'price mismatch after delta_t');}

        // ----4. Get genesis floor price
        let genesis_floor = auction.get_genesis_floor();
        assert_eq!(genesis_floor, FLOOR, "wrong genesis floor price");
    }

    #[test]
    #[should_panic(expected: 'ONE_BID_PER_BLOCK')]
    fn second_bid_same_block_fails() {
        let (auction, buyer, admin, path_nft) = deploy_pulse_after_10s();

        mock_call(admin, selector!("transfer_from"), array![1], 1);
        mock_call(path_nft, selector!("safe_mint"), array![1], 1);
        start_cheat_caller_address(auction.contract_address, buyer);
        cheat_block_timestamp(
            auction.contract_address, GENESIS_HAMMER_TIME, CheatSpan::TargetCalls(2),
        );
        auction.bid(GENESIS);
        // attempt another bid in same block
        auction.bid(GENESIS + 1_u128.into());
    }

    #[test]
    #[should_panic(expected: 'ASK_ABOVE_MAX_PRICE')]
    fn revert_if_max_price_too_low() {
        let (auction, buyer, admin, path_nft) = deploy_pulse_after_10s();

        cheat_block_timestamp(
            auction.contract_address, GENESIS_HAMMER_TIME, CheatSpan::TargetCalls(1),
        );
        mock_call(admin, selector!("transfer_from"), array![1], 1);
        mock_call(path_nft, selector!("safe_mint"), array![1], 1);

        start_cheat_caller_address(auction.contract_address, buyer);
        // price is GENESIS, offer less
        auction.bid(GENESIS - 1_u128.into());
    }

    #[test]
    // enable the safe-dispatcher feature for this scope
    #[feature("safe_dispatcher")]
    fn reentrancy_guard_blocks_nested_call() {
        let (auction, _, _, _) = deploy_pulse_after_10s();
        let attacker = deploy_reenteror();
        let attacker_dispatcher = IReenterorSafeDispatcher { contract_address: attacker };

        // spoof the caller for the *outer* call
        start_cheat_caller_address(auction.contract_address, attacker);
        let res = attacker_dispatcher.attack(auction.contract_address, GENESIS);
        stop_cheat_caller_address(auction.contract_address);

        assert(res.is_err(), 're-entrancy not blocked');
    }

    // ---------- HELPERS ----------
    fn calculate_anchor_a(
        initial_ask: u256, floor_price: u256, k: u256, curve_start_time: u64,
    ) -> u64 {
        // The anchor time is calculated as:
        // a = curve_start_time - k / (initial_ask - floor_price)
        assert(initial_ask > floor_price, 'ASK_LESS_THAN_FLOOR');

        let gap = initial_ask - floor_price;
        assert(gap > 0, 'GAP_ZERO_OR_NEGATIVE');
        let k_over_gap_u64: u64 = (k / gap).try_into().expect('K_OVER_GAP_OVERFLOW');
        curve_start_time - k_over_gap_u64
    }
}
