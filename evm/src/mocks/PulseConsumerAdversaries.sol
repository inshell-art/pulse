// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PulseConsumerHarness, IPulseTestReceiver} from "./PulseConsumerHarness.sol";

/// @dev Test-only buyer, treasury, receiver and callback observer.
contract PulseConsumerActor is IPulseTestReceiver {
    event Attempt(uint256 indexed index, bool success, bytes result);
    address public target;
    bytes[] private _attempts;
    bool public attackOnEther;
    bool public attackOnDelivery;
    bool public rejectEther;
    bool public rejectDelivery;
    bool public propagateFailure;
    uint64 public observedEpoch;
    uint256 public observedIssued;
    bool public observedInitialized;
    bool[] public successes;
    bytes[] public results;

    function configure(
        address target_, bytes[] calldata attempts, bool etherHook, bool deliveryHook,
        bool rejectEther_, bool rejectDelivery_, bool propagateFailure_
    ) external {
        target = target_;
        delete _attempts;
        for (uint256 i; i < attempts.length; ++i) _attempts.push(attempts[i]);
        attackOnEther = etherHook;
        attackOnDelivery = deliveryHook;
        rejectEther = rejectEther_;
        rejectDelivery = rejectDelivery_;
        propagateFailure = propagateFailure_;
        delete successes;
        delete results;
    }

    function execute(address destination, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory result) = destination.call{value: msg.value}(data);
        if (!ok) _bubble(result);
        return result;
    }

    function batch(address[] calldata destinations, bytes[] calldata data, uint256[] calldata values)
        external payable
    {
        require(destinations.length == data.length && data.length == values.length, "LENGTH");
        for (uint256 i; i < destinations.length; ++i) {
            (bool ok, bytes memory result) = destinations[i].call{value: values[i]}(data[i]);
            emit Attempt(i, ok, result);
        }
    }

    function probe() public {
        PulseConsumerHarness app = PulseConsumerHarness(target);
        observedEpoch = app.getEpochIndex();
        observedIssued = app.totalIssued();
        observedInitialized = app.initialized();
        for (uint256 i; i < _attempts.length; ++i) {
            (bool ok, bytes memory result) = target.call(_attempts[i]);
            successes.push(ok);
            results.push(result);
            if (!ok && propagateFailure) _bubble(result);
        }
    }

    receive() external payable {
        require(!rejectEther, "REJECT_ETHER");
        if (attackOnEther) probe();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (attackOnDelivery) probe();
        return rejectDelivery ? bytes4(0) : IPulseTestReceiver.onERC721Received.selector;
    }

    function _bubble(bytes memory result) private pure {
        assembly { revert(add(result, 32), mload(result)) }
    }
}

/// @dev Adversarial ERC20: modes 0=true, 1=no return, 2=false, 3=revert, 4=malformed.
contract PulseConsumerTestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public mode;
    PulseConsumerActor public hook;
    event Transfer(address indexed from, address indexed to, uint256 value);

    function configure(uint256 mode_, address hook_) external { mode = mode_; hook = PulseConsumerActor(payable(hook_)); }
    function mint(address recipient, uint256 value) external { balanceOf[recipient] += value; }
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(allowance[from][msg.sender] >= value, "ALLOWANCE");
        require(balanceOf[from] >= value, "BALANCE");
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        if (address(hook) != address(0)) hook.probe();
        if (mode == 1) { assembly { return(0, 0) } }
        if (mode == 2) return false;
        if (mode == 3) revert("TOKEN_REVERT");
        if (mode == 4) { assembly { mstore(0, 1) return(31, 1) } }
        return true;
    }
}
