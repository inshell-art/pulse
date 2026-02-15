// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPulseAdapter} from "../interfaces/IPulseAdapter.sol";

/// @notice Minimal adapter implementation for local testing/integration.
/// @dev Mirrors the behavior of the Cairo test StubAdapter.
contract StubAdapter is IPulseAdapter {
    address public auction;
    uint256 public nextId;
    bool public shouldRevert;

    constructor(address _auction, uint256 firstId) {
        auction = _auction;
        nextId = firstId;
    }

    function setAuction(address _auction) external {
        auction = _auction;
    }

    function setShouldRevert(bool v) external {
        shouldRevert = v;
    }

    function peekNext() external view returns (uint256) {
        return nextId;
    }

    function settle(address /* buyer */, bytes calldata /* data */) external override returns (uint256 tokenId) {
        require(msg.sender == auction, "ONLY_AUCTION");
        require(!shouldRevert, "ADAPTER_REVERT");

        tokenId = nextId;
        nextId = tokenId + 1;
    }

    function target() external view override returns (address) {
        return auction;
    }
}
