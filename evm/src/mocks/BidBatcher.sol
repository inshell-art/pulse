// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPulseAuction} from "../interfaces/IPulseAuction.sol";

interface IERC20ApproveOnly {
    function approve(address spender, uint256 value) external returns (bool);
}

/// @notice Helper contract used to test "one bid per block" by batching two bids in one transaction.
contract BidBatcher {
    function approveToken(address token, address spender, uint256 amount) external {
        require(IERC20ApproveOnly(token).approve(spender, amount), "APPROVE_FAILED");
    }

    function bidTwice(address auction, uint256 maxPrice1, uint256 maxPrice2) external {
        IPulseAuction(auction).bid(maxPrice1);
        IPulseAuction(auction).bid(maxPrice2);
    }
}

