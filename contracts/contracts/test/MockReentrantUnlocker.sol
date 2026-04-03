// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IHandOff {
    function unlock(bytes32 codeHash) external;
}

/// @dev Acts as the seller. When it receives ETH (from unlock payout) it
///      immediately tries to call unlock() again.  The ReentrancyGuard on
///      HandOff must block this second call.
contract MockReentrantUnlocker {
    address public target;
    bytes32 public codeHash;
    uint256 public callCount;

    function setTarget(address _target, bytes32 _codeHash) external {
        target   = _target;
        codeHash = _codeHash;
    }

    function doUnlock() external {
        IHandOff(target).unlock(codeHash);
    }

    receive() external payable {
        callCount++;
        if (callCount < 3) {
            // Attempt reentrant unlock — must be blocked
            (bool ok, ) = target.call(abi.encodeWithSignature("unlock(bytes32)", codeHash));
            ok; // suppress warning; result checked implicitly by ReentrancyGuard revert
        }
    }
}
