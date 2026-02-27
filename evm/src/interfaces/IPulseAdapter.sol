// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Adapter interface for delivering the purchased asset.
interface IPulseAdapter {
    /// @notice Deliver the asset to `buyer`.
    /// @dev Must revert if delivery fails.
    /// @param epochIndex Auction epoch being settled (source of truth from auction).
    /// @param data Adapter-specific payload (empty in the current PulseAuction implementation).
    /// @return tokenId The minted/assigned token id (implementation-defined).
    function settle(address buyer, uint64 epochIndex, bytes calldata data)
        external
        returns (uint256 tokenId);

    /// @notice Return the target contract for this adapter (implementation-defined).
    function target() external view returns (address);
}
