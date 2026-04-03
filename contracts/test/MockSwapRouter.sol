// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Minimal Uniswap SwapRouter02 mock for HandOff tests.
 *
 *  Behaviour: consumes exactly `amountInMaximum` of tokenIn
 *  and mints exactly `amountOut` of tokenOut to `recipient`.
 *  (No real pricing — just validates the interface works.)
 *
 *  For ETH input tests, this mock receives WETH (already wrapped by HandOff)
 *  and transfers mockTokenOut to recipient.
 */
contract MockSwapRouter {
    address public immutable weth;

    // The mock needs a source of tokenOut to hand out — fund it via mintOutput()
    mapping(address => uint256) public outputReserves;

    constructor(address _weth) {
        weth = _weth;
    }

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    /// @dev Called by test setup to give the mock router output tokens to hand out.
    function mintOutput(address token, uint256 amount) external {
        // Caller must have approved this contract — just pulls tokens
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        outputReserves[token] += amount;
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        returns (uint256 amountIn)
    {
        // Pull tokenIn (WETH or ERC20) — consume all of amountInMaximum
        IERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountInMaximum);

        // Send tokenOut to recipient
        require(outputReserves[params.tokenOut] >= params.amountOut, "MockRouter: insufficient output");
        IERC20(params.tokenOut).transfer(params.recipient, params.amountOut);
        outputReserves[params.tokenOut] -= params.amountOut;

        // Report spending all of amountInMaximum (worst case — no refund)
        return params.amountInMaximum;
    }
}
