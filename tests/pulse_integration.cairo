#[cfg(test)]
mod tests {
    use core::integer::u256;
    use core::traits::Into;
    use pulse::interfaces::i_pulse_auction_v1::IPulseAuctionV1Dispatcher;
    use snforge_std::{
        CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_block_timestamp, declare,
        start_cheat_caller_address, stop_cheat_caller_address, test_address,
    };
    use starknet::ContractAddress;

    // constants
    const CURVE_K: u256 = 600_u128.into();
    const GENESIS: u256 = 100_u128.into();
    const FLOOR_P: u256 = 10_u128.into();

    // helper – deploy auction once per test
    fn setup() -> (
        IPulseAuctionV1Dispatcher, // auction
        ContractAddress, // buyer
        ContractAddress // admin/treasury
    ) {
        let admin = test_address();
        let buyer = test_address();

        // mock NFT & ERC-20 omitted for brevity …

        // declare & deploy auction
        let class = declare("PulseAuction").unwrap().contract_class();
        let calldata = array![
            0_u64.into(), CURVE_K, GENESIS, FLOOR_P, admin.into(), path_nft, 0_u64,
        ];
        let (addr, _) = class.deploy(@calldata).unwrap();

        (IPulseAuctionV1Dispatcher { contract_address: addr }, buyer, admin)
    }

    #[test]
    fn genesis_starts_curve() {
        let (auction, buyer, _) = setup();

        // caller impersonation
        start_cheat_caller_address(auction.contract_address, buyer, CheatSpan::TargetCalls(1));
        auction.bid(GENESIS);
        stop_cheat_caller_address(auction.contract_address);

        assert(auction.curve_active(), 'curve NOT active');
    }

    #[test]
    fn price_advances_over_time() {
        let (auction, buyer, _) = setup();

        start_cheat_caller_address(auction.contract_address, buyer, CheatSpan::TargetCalls(1));
        auction.bid(GENESIS); // genesis
        stop_cheat_caller_address(auction.contract_address);

        cheat_block_timestamp(100); // +100 s

        let expected = CURVE_K / 100_u128.into() + GENESIS;
        assert(auction.get_current_price() == expected, 'price mismatch');
    }
}
