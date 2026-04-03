// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./MockERC20.sol";

/// @dev Simulates a Uniswap router that swaps inputToken → outputToken.
///      The HandOff contract calls router.call(swapData) so this contract is
///      invoked via a low-level call.  We implement swap(address,uint256) as
///      the entry point encoded in swapData.
contract MockSwapRouter {
    using SafeERC20 for IERC20;

    address public outputToken;
    uint256 public outputAmount;  // fixed amount to mint/transfer as output
    bool    public shouldFail;

    constructor(address _outputToken, uint256 _outputAmount) {
        outputToken = _outputToken;
        outputAmount = _outputAmount;
    }

    function setFail(bool _fail) external { shouldFail = _fail; }
    function setOutputAmount(uint256 _amount) external { outputAmount = _amount; }

    /// @dev Called via low-level call from HandOff.fundWithSwap.
    ///      Receives the input token (already approved), and mints outputToken
    ///      directly into the calling HandOff contract (msg.sender).
    function swap(address /*inputToken*/, uint256 /*inputAmount*/) external {
        require(!shouldFail, "MockRouter: swap reverted");
        // Mint output tokens into the calling HandOff contract
        MockERC20(outputToken).mint(msg.sender, outputAmount);
    }
}
