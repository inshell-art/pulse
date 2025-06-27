#[cfg(test)]
mod tests {
    use snforge_std::{
        declare,
        deploy,
        start_prank,
        stop_prank,
        warp,
        CheatcodesTrait,
    };
    use core::traits::Into;

    // ===== Fixtures =====
    // ➊ Declare mock ERC-20 and NFT so we can deploy them inside the test.
    const ERC20_CLASS = declare!("MockERC20");          // ←-- adjust
    const PATHNFT_CLASS = declare!("MockPathNFT");      // ←-- adjust
    const AUCTION_CLASS = declare!("PulseAuction");     // compiled with your new guard

    // ➋ Handy constants
    const SEED_INITIAL_BAL: u256 = 1_000_000_u128.into();
    const GENESIS_PRICE: u256   = 100_u128.into();
    const FLOOR_PRICE: u256     = 10_u128.into();
    const CURVE_K: u256         = 600_u128.into();
    const START_DELAY: u64      = 0;

    #[test]
    fn happy_path() {
        // ---------- Arrange ----------
        let admin = snforge_std::get_env().get_account(0);
        let buyer = snforge_std::get_env().get_account(1);

        // deploy ERC-20 and mint to buyer
        let erc20_addr = deploy!(ERC20_CLASS, (), &admin);
        ERC20Dispatcher { contract_address: erc20_addr }
            .mint(buyer.address(), SEED_INITIAL_BAL);      // mint helper in mock

        // deploy mock Path NFT
        let pathnft_addr = deploy!(PATHNFT_CLASS, (), &admin);

        // deploy PulseAuction
        let auction_addr = deploy!(
            AUCTION_CLASS,
            (
                START_DELAY,
                CURVE_K,
                GENESIS_PRICE,
                FLOOR_PRICE,
                admin.address(),      // treasury
                pathnft_addr,
                0_u64                 // genesis token id
            ),
            &admin
        );

        // give auction an allowance
        start_prank!(buyer);
        ERC20Dispatcher { contract_address: erc20_addr }
            .approve(auction_addr, GENESIS_PRICE);
        stop_prank!();

        // ---------- Act ----------
        warp!(1);                                     // skip START_DELAY seconds
        start_prank!(buyer);
        PulseAuctionDispatcher { contract_address: auction_addr }
            .bid(GENESIS_PRICE);                      // first (genesis) bid
        stop_prank!();

        // ---------- Assert ----------
        // floor_price should now equal the genesis ask
        let onchain_floor = PulseAuctionDispatcher { contract_address: auction_addr }
            .floor_price();
        assert(onchain_floor == GENESIS_PRICE, 'floor_price mismatch');

        // next_token_id should be 1 (it started at 0)
        let next_id = PulseAuctionDispatcher { contract_address: auction_addr }
            .next_token_id();
        assert(next_id == 1_u64, 'token_id not incremented');
    }
}
