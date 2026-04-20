// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./MockERC20.sol";

interface IHandOffCancelable {
    function cancel() external;
}

/// @dev Acts as both the allowlisted router and, in tests, the seller.
/// During swap() it attempts a reentrant cancel() on the escrow; the outer
/// fundWithSwap() call must keep succeeding with the escrow ending in FUNDED.
contract MockReentrantSwapRouter {
    address public immutable outputToken;
    uint256 public outputAmount;
    address public target;
    uint256 public reentryAttempts;
    bool public reentrySucceeded;

    constructor(address _outputToken, uint256 _outputAmount) {
        outputToken = _outputToken;
        outputAmount = _outputAmount;
    }

    function setTarget(address _target) external {
        target = _target;
    }

    function setOutputAmount(uint256 _amount) external {
        outputAmount = _amount;
    }

    function swap(address /*inputToken*/, uint256 /*inputAmount*/) external {
        reentryAttempts++;
        (bool ok, ) = target.call(abi.encodeWithSelector(IHandOffCancelable.cancel.selector));
        reentrySucceeded = ok;

        MockERC20(outputToken).mint(msg.sender, outputAmount);
    }
}
