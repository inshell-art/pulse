// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPulseCostQuoteConsumer {
    function getCurrentPrice() external view returns (uint256);
}

/// @dev Measures first and repeated on-chain quote reads in one transaction.
contract PulseCostQuoteProbe {
    event QuoteMeasured(address indexed consumer, uint256 firstAsk, uint256 secondAsk, uint256 firstGas, uint256 secondGas);

    function measure(address consumer) external {
        uint256 beforeFirst = gasleft();
        uint256 first = IPulseCostQuoteConsumer(consumer).getCurrentPrice();
        uint256 firstGas = beforeFirst - gasleft();
        uint256 beforeSecond = gasleft();
        uint256 second = IPulseCostQuoteConsumer(consumer).getCurrentPrice();
        uint256 secondGas = beforeSecond - gasleft();
        emit QuoteMeasured(consumer, first, second, firstGas, secondGas);
    }
}
