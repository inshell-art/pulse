// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPulseAdapter} from "../interfaces/IPulseAdapter.sol";
import {IPulseAuction} from "../interfaces/IPulseAuction.sol";

/// @notice Adapter that attempts to reenter the auction during settlement.
/// @dev Useful for verifying the auction's reentrancy protection.
contract EvilAdapter is IPulseAdapter {
    address public auction;

    constructor(address _auction) {
        auction = _auction;
    }

    function setAuction(address _auction) external {
        auction = _auction;
    }

    function settle(address /* buyer */, bytes calldata /* data */) external override returns (uint256 tokenId) {
        require(msg.sender == auction, "ONLY_AUCTION");

        // This must fail if the auction is protected (nonReentrant / 1-bid-per-block).
        IPulseAuction(auction).bid(type(uint256).max);

        return 0;
    }

    function target() external view override returns (address) {
        return auction;
    }
}
