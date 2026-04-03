// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev Simulates a malicious buyer that re-enters refund() on ETH receipt
contract MockReentrantBuyer {
    address public target;
    uint256 public count;

    function setTarget(address _target) external { target = _target; }

    receive() external payable {
        if (count < 2) {
            count++;
            // Attempt to re-enter refund()
            (bool ok, ) = target.call(abi.encodeWithSignature("refund()"));
            // If ReentrancyGuard works, this will revert and ok == false
            // We suppress to not mask the outer test assertion
            ok;
        }
    }
}
