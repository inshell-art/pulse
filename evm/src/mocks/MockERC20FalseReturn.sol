// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice ERC20-like token that always returns false from transferFrom.
/// @dev Used to verify SafeERC20Minimal failure handling in PulseAuction.
contract MockERC20FalseReturn {
    string public constant name = "FalseToken";
    string public constant symbol = "FALSE";
    uint8 public constant decimals = 18;

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

