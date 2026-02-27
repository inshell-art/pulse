// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPulseAdapter} from "../interfaces/IPulseAdapter.sol";

/// @notice Minimal adapter implementation for local testing/integration.
contract StubAdapter is IPulseAdapter {
    event Settled(uint64 indexed epochIndex, uint256 indexed tokenId);

    address public immutable auction;
    uint256 public nextId;
    bool public shouldRevert;

    constructor(address _auction, uint256 firstId) {
        auction = _auction;
        nextId = firstId;
    }

    function setShouldRevert(bool v) external {
        shouldRevert = v;
    }

    function peekNext() external view returns (uint256) {
        return nextId;
    }

    function settle(address /* buyer */, uint64 epochIndex, bytes calldata /* data */)
        external
        override
        returns (uint256 tokenId)
    {
        require(msg.sender == auction, "ONLY_AUCTION");
        require(!shouldRevert, "ADAPTER_REVERT");

        tokenId = nextId;
        nextId = tokenId + 1;
        emit Settled(epochIndex, tokenId);
    }

    function target() external view override returns (address) {
        return auction;
    }
}
