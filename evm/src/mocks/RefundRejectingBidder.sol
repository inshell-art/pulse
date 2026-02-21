// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAuctionBid {
    function bid(uint256 maxPrice) external payable;
}

/// @notice Helper bidder that rejects ETH refunds to exercise refund-failure paths.
contract RefundRejectingBidder {
    function bid(address auction, uint256 maxPrice) external payable {
        IAuctionBid(auction).bid{value: msg.value}(maxPrice);
    }

    receive() external payable {
        revert("NO_REFUND");
    }
}

