// GENERATED BENCHMARK CONTROL — run npm run benchmark:core:generate after source changes.
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPulseCore} from "../interfaces/IPulseCore.sol";
import {PulseEmbeddedMathBenchmark} from "./PulseEmbeddedMathBenchmark.sol";

interface IPulseTestReceiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external returns (bytes4);
}

/// @notice Generated embedded-math A control for the shared-core B consumer.
/// @dev The issuance ledger is intentionally not a complete ERC721 implementation.
contract PulseEmbeddedConsumerBenchmark {
    struct Application {
        address paymentToken;
        address payable treasury;
        address owner;
        uint64 scheduledOpenTime; // Zero selects conditional activation.
        uint64 allocationSlots; // Zero for a scheduled launch.
        uint256 initialPrice;
        uint256 maxSupply;
    }

    error InvalidApplication();
    error TimeOutOfRange();
    error BlockOutOfRange();
    error StartInPast();
    error NotInitialized();
    error NotOpen();
    error InitialPhaseClosed();
    error NotEligible();
    error InvalidKey();
    error SoldOut();
    error OneSalePerBlock();
    error AskAboveMaxPrice();
    error InsufficientPayment();
    error UnexpectedETH();
    error TreasuryTransferFailed();
    error RefundFailed();
    error TokenTransferFailed();
    error DeliveryRejected();
    error OnlyOwner();
    error Paused();
    error Reentrancy();

    event LaunchConfigured(uint64 indexed openTime, uint64 deployedAt);
    event Sale(
        address indexed buyer, uint64 indexed epochIndex, uint256 price,
        uint64 timestamp, uint64 nextAnchorA, uint256 nextFloorB
    );
    event Issued(address indexed recipient, uint256 indexed tokenId, bytes32 indexed key);
    event InitialFulfilled(address indexed recipient, bytes32 indexed key, uint64 fulfilled, uint256 price);

    address public immutable paymentToken;
    address payable public immutable treasury;
    address public immutable owner;
    uint64 public immutable deployedAt;
    uint64 public immutable allocationSlots;
    uint256 public immutable initialPrice;
    uint256 public immutable maxSupply;

    IPulseCore.Config private _config;
    IPulseCore.State private _state;
    bool public initialized;
    bool public paused;
    uint64 public lastBlock;
    uint64 public initialFulfilled;
    uint64 public registeredSlots;
    uint256 public totalIssued;
    mapping(bytes32 => address) public initialRecipient;
    mapping(bytes32 => bool) public usedKeys;
    mapping(uint256 => address) public ownerOf;
    uint256 private _entered = 1;

    modifier nonReentrant() {
        if (_entered != 1) revert Reentrancy();
        _entered = 2;
        _;
        _entered = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(IPulseCore.Config memory config, Application memory app) {
        if (
            app.owner == address(0) || app.treasury == address(0) || app.maxSupply == 0
                || (app.paymentToken != address(0) && app.paymentToken.code.length == 0)
                || (app.scheduledOpenTime == 0) == (app.allocationSlots == 0)
                || uint256(app.allocationSlots) > app.maxSupply
        ) revert InvalidApplication();

        paymentToken = app.paymentToken;
        treasury = app.treasury;
        owner = app.owner;
        allocationSlots = app.allocationSlots;
        initialPrice = app.initialPrice;
        maxSupply = app.maxSupply;
        deployedAt = _time();
        _config = config;

        uint64 earliestStart = app.scheduledOpenTime == 0 ? deployedAt : app.scheduledOpenTime;
        if (earliestStart < deployedAt) revert StartInPast();
        IPulseCore.State memory initial = PulseEmbeddedMathBenchmark.initialize(config, earliestStart);
        // Reject avoidable launch failures before any initial slots are offered.
        PulseEmbeddedMathBenchmark.advance(config, initial, earliestStart);
        if (app.scheduledOpenTime != 0) {
            _state = initial;
            initialized = true;
            emit LaunchConfigured(earliestStart, deployedAt);
        }
    }

    function allowInitial(bytes32[] calldata keys, address recipient) external nonReentrant onlyOwner {
        if (initialized || allocationSlots == 0) revert InitialPhaseClosed();
        if (recipient == address(0) || keys.length > uint256(allocationSlots - registeredSlots)) {
            revert NotEligible();
        }
        for (uint256 i; i < keys.length; ++i) {
            bytes32 key = keys[i];
            if (key == bytes32(0) || initialRecipient[key] != address(0)) revert InvalidKey();
            initialRecipient[key] = recipient;
        }
        registeredSlots += uint64(keys.length);
    }

    function setPaused(bool value) external nonReentrant onlyOwner {
        paused = value;
    }

    function fulfillInitial(bytes32 key) external payable nonReentrant returns (uint256 tokenId) {
        if (paused) revert Paused();
        if (initialized || allocationSlots == 0) revert InitialPhaseClosed();
        if (initialRecipient[key] != msg.sender) revert NotEligible();
        _checkIssuance(key);
        _checkPayment(initialPrice);

        tokenId = _reserve(key);
        initialFulfilled += 1;
        if (initialFulfilled == allocationSlots) {
            uint64 start = _time();
            _state = PulseEmbeddedMathBenchmark.initialize(_config, start);
            initialized = true;
            emit LaunchConfigured(start, deployedAt);
        }
        _settle(initialPrice);
        _deliver(tokenId, key);
        emit InitialFulfilled(msg.sender, key, initialFulfilled, initialPrice);
    }

    function buy(uint256 maxPrice, bytes32 key) external payable nonReentrant returns (uint256 tokenId) {
        if (paused) revert Paused();
        if (!initialized) revert NotInitialized();
        uint64 timestamp = _time();
        if (timestamp < _state.openTime) revert NotOpen();
        if (block.number > type(uint64).max) revert BlockOutOfRange();
        if (block.number <= lastBlock) revert OneSalePerBlock();
        _checkIssuance(key);

        (uint256 ask, IPulseCore.State memory next) = PulseEmbeddedMathBenchmark.advance(_config, _state, timestamp);
        if (ask > maxPrice) revert AskAboveMaxPrice();
        _checkPayment(ask);
        _state = next;
        lastBlock = uint64(block.number);
        tokenId = _reserve(key);
        _settle(ask);
        _deliver(tokenId, key);
        emit Sale(msg.sender, next.epochIndex, ask, timestamp, next.anchorTime, next.floorPrice);
    }

    function getPulseConfig() external view returns (IPulseCore.Config memory) { return _config; }
    function getPulseState() external view returns (IPulseCore.State memory) { return _state; }
    function getEpochIndex() external view returns (uint64) { return _state.epochIndex; }

    function getConfig() external view returns (
        uint64 openTime, uint256 genesisPrice, uint256 genesisFloor, uint256 k, uint256 pts
    ) {
        return (_state.openTime, _config.genesisPrice, _config.genesisFloor, _config.k, _config.pts);
    }

    function getState() external view returns (
        uint64 epochIndex, uint64 startTime, uint64 anchorTime, uint256 floorPrice, bool active
    ) {
        return (_state.epochIndex, _state.curveStartTime, _state.anchorTime, _state.floorPrice, curveActive());
    }

    function curveActive() public view returns (bool) {
        return initialized && block.timestamp >= _state.openTime;
    }

    function getCurrentPrice() external view returns (uint256) {
        if (!initialized) revert NotInitialized();
        return PulseEmbeddedMathBenchmark.quote(_config, _state, _time());
    }

    function _checkIssuance(bytes32 key) private view {
        if (key == bytes32(0) || usedKeys[key]) revert InvalidKey();
        if (totalIssued >= maxSupply) revert SoldOut();
    }

    function _reserve(bytes32 key) private returns (uint256 tokenId) {
        usedKeys[key] = true;
        tokenId = ++totalIssued;
        ownerOf[tokenId] = msg.sender;
    }

    function _checkPayment(uint256 price) private view {
        if (paymentToken == address(0)) {
            if (msg.value < price) revert InsufficientPayment();
        } else if (msg.value != 0) revert UnexpectedETH();
    }

    function _settle(uint256 price) private {
        if (paymentToken == address(0)) {
            (bool sent,) = treasury.call{value: price}("");
            if (!sent) revert TreasuryTransferFailed();
            if (msg.value > price) {
                (bool refunded,) = payable(msg.sender).call{value: msg.value - price}("");
                if (!refunded) revert RefundFailed();
            }
        } else {
            (bool ok, bytes memory result) = paymentToken.call(
                abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, treasury, price)
            );
            if (!ok) revert TokenTransferFailed();
            if (result.length != 0) {
                if (result.length != 32 || abi.decode(result, (uint256)) != 1) revert TokenTransferFailed();
            }
        }
    }

    function _deliver(uint256 tokenId, bytes32 key) private {
        if (msg.sender.code.length != 0) {
            bytes4 response = IPulseTestReceiver(msg.sender).onERC721Received(
                msg.sender, address(0), tokenId, abi.encode(key)
            );
            if (response != IPulseTestReceiver.onERC721Received.selector) revert DeliveryRejected();
        }
        emit Issued(msg.sender, tokenId, key);
    }

    function _time() private view returns (uint64) {
        if (block.timestamp > type(uint64).max) revert TimeOutOfRange();
        return uint64(block.timestamp);
    }
}
