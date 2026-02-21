// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Utility receiver that always rejects native ETH transfers.
contract RejectEtherReceiver {
    receive() external payable {
        revert("NO_ETH");
    }
}

