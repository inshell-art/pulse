// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPulseAdapter} from "./interfaces/IPulseAdapter.sol";
import {IPulseAuction} from "./interfaces/IPulseAuction.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

library SafeERC20Minimal {
    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
    }
}

/// @notice PulseAuction – Decentralized Automatic Auction (DAA).
contract PulseAuction is IPulseAuction {
    using SafeERC20Minimal for address;

    // ------------- EVENTS -------------

    event Sale(
        address indexed buyer,
        uint64 indexed epochIndex,
        uint256 price,
        uint64 timestamp,
        uint64 nextAnchorA,
        uint256 nextFloorB
    );

    // ------------- STORAGE -------------

    // - Auction life cycle
    uint64 public openTime;
    uint64 public genesisTime;
    uint256 public genesisPrice; // p0
    uint256 public genesisFloor; // b0 (initial floor at open)
    uint64 public epochIndex;

    // - Price curve
    uint256 public curveK;
    uint64 public anchorTime; // a
    uint256 public floorPrice; // b
    uint64 public curveStartTime;
    uint64 public lastBlock;
    uint256 public pts; // price-time scale

    // - Settlement specifics
    address public immutable deployer;
    address public paymentToken;
    address public mintAdapter;
    address public treasury;

    // - Reentrancy guard
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "REENTRANCY");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ------------- CONSTRUCTOR -------------

    constructor(
        uint64 startDelaySec,
        uint256 k,
        uint256 _genesisPrice,
        uint256 _genesisFloor,
        uint256 initialPts,
        address _paymentToken,
        address _treasury,
        address _mintAdapter
    ) {
        _validateConstructorArgs(k, _genesisPrice, _genesisFloor, initialPts);
        require(_treasury != address(0), "ZERO_TREASURY");
        if (_paymentToken != address(0)) {
            require(_paymentToken.code.length > 0, "INVALID_PAYMENT_TOKEN");
        }
        if (_mintAdapter != address(0)) {
            require(_mintAdapter.code.length > 0, "INVALID_ADAPTER");
        }

        uint64 nowTs = uint64(block.timestamp);
        uint64 _openTime = nowTs + startDelaySec;
        uint64 initialAnchorA = _calculateAnchorTime(_genesisPrice, _genesisFloor, k, _openTime);

        openTime = _openTime;
        curveK = k;
        genesisPrice = _genesisPrice;
        genesisFloor = _genesisFloor;
        pts = initialPts;
        epochIndex = 0;
        floorPrice = _genesisFloor;
        curveStartTime = _openTime;
        anchorTime = initialAnchorA;

        deployer = msg.sender;
        paymentToken = _paymentToken;
        treasury = _treasury;
        mintAdapter = _mintAdapter;
    }

    // ------------- VIEW -------------

    /// @notice Hyperbolic ask at the current block timestamp.
    function getCurrentPrice() public view override returns (uint256) {
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < openTime) nowTs = openTime;
        return _priceAt(nowTs);
    }

    /// @notice Whether the auction is open.
    function curveActive() public view override returns (bool) {
        return uint64(block.timestamp) >= openTime;
    }

    function getEpochIndex() external view override returns (uint64) {
        return epochIndex;
    }

    function getConfig()
        external
        view
        override
        returns (
            uint64 openTime_,
            uint256 genesisPrice_,
            uint256 genesisFloor_,
            uint256 k_,
            uint256 pts_
        )
    {
        return (openTime, genesisPrice, genesisFloor, curveK, pts);
    }

    function getState()
        external
        view
        override
        returns (
            uint64 epochIndex_,
            uint64 startTime_,
            uint64 anchorTime_,
            uint256 floorPrice_,
            bool active_
        )
    {
        return (epochIndex, curveStartTime, anchorTime, floorPrice, curveActive());
    }

    // ------------- ACTION -------------

    /// @notice One-time initializer for mint adapter when constructor used zero address.
    function initializeMintAdapter(address adapter) external override {
        require(msg.sender == deployer, "ONLY_DEPLOYER");
        require(mintAdapter == address(0), "ADAPTER_ALREADY_SET");
        require(adapter != address(0), "INVALID_ADAPTER");
        require(adapter.code.length > 0, "INVALID_ADAPTER");
        mintAdapter = adapter;
    }

    /// @notice Place a bid in the auction.
    function bid(uint256 maxPrice) external payable override nonReentrant {
        uint64 nowTs = uint64(block.timestamp);
        uint64 blk = uint64(block.number);
        uint64 nextEpochIndex = epochIndex + 1;

        require(nowTs >= openTime, "AUCTION_NOT_OPEN");
        require(uint256(blk) > uint256(lastBlock), "ONE_BID_PER_BLOCK");

        uint256 ask = _priceAt(nowTs);
        require(ask <= maxPrice, "ASK_ABOVE_MAX_PRICE");
        require(mintAdapter != address(0), "ADAPTER_NOT_SET");

        _collectPayment(ask);
        IPulseAdapter(mintAdapter).settle(msg.sender, nextEpochIndex, "");

        uint256 deltaT = uint256(nowTs - curveStartTime);
        uint256 effectiveDeltaT = deltaT == 0 ? 1 : deltaT;
        uint256 premium = effectiveDeltaT * pts;
        uint256 nextFloorB = ask;

        if (epochIndex == 0) {
            genesisTime = nowTs;
        }

        uint256 initialAsk = ask + premium;
        uint64 nextAnchorA = _calculateAnchorTime(initialAsk, nextFloorB, curveK, nowTs);

        anchorTime = nextAnchorA;
        floorPrice = nextFloorB;
        curveStartTime = nowTs;
        lastBlock = blk;
        epochIndex = nextEpochIndex;

        emit Sale(msg.sender, nextEpochIndex, ask, nowTs, anchorTime, floorPrice);
    }

    // ------------- HELPERS -------------

    function _validateConstructorArgs(
        uint256 k,
        uint256 _genesisPrice,
        uint256 _genesisFloor,
        uint256 initialPts
    ) internal pure {
        require(k != 0, "K_ZERO_OR_NEGATIVE");
        require(_genesisPrice > _genesisFloor, "GAP_ZERO_OR_NEGATIVE");
        require(_genesisPrice - _genesisFloor <= k, "START_GAP_ABOVE_K");
        require(initialPts != 0, "PTS_ZERO_OR_NEGATIVE");
        require(initialPts <= type(uint128).max, "PTS_OUT_OF_RANGE");
        require(k / initialPts <= type(uint64).max, "K_OVER_PTS_OVERFLOW");
    }

    function _collectPayment(uint256 ask) internal {
        // Payment first, then delivery.
        if (paymentToken == address(0)) {
            require(msg.value >= ask, "INVALID_MSG_VALUE");
            (bool sent,) = payable(treasury).call{value: ask}("");
            require(sent, "ETH_TRANSFER_FAILED");

            uint256 refund = msg.value - ask;
            if (refund > 0) {
                (bool refunded,) = payable(msg.sender).call{value: refund}("");
                require(refunded, "ETH_REFUND_FAILED");
            }
            return;
        }

        require(msg.value == 0, "ETH_NOT_ACCEPTED");
        paymentToken.safeTransferFrom(msg.sender, treasury, ask);
    }

    /// @dev Calculate time anchor "a" for the curve:
    ///      a = curveStartTime - k / (initialAsk - floorPrice)
    function _calculateAnchorTime(
        uint256 initialAsk,
        uint256 _floorPrice,
        uint256 k,
        uint64 _curveStartTime
    ) internal pure returns (uint64) {
        require(initialAsk > _floorPrice, "ASK_LESS_THAN_FLOOR");

        uint256 gap = initialAsk - _floorPrice;
        require(gap > 0, "GAP_ZERO_OR_NEGATIVE");

        uint256 kOverGap = k / gap;
        require(kOverGap <= type(uint64).max, "K_OVER_GAP_OVERFLOW");

        uint64 kOverGapU64 = uint64(kOverGap);
        require(_curveStartTime > kOverGapU64, "ANCHOR_TIME_UNDERFLOW");

        return _curveStartTime - kOverGapU64;
    }

    function _priceAt(uint64 nowTs) internal view returns (uint256) {
        uint256 k = curveK;
        uint64 a = anchorTime;
        uint256 b = floorPrice;

        // Approaching the vertical asymptote: clamp instead of underflow.
        if (nowTs <= a) return b + k;

        return (k / uint256(nowTs - a)) + b;
    }
}
