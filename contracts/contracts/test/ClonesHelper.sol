// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/proxy/Clones.sol";

/// @dev Test-only helper — exposes OZ Clones.clone() to TypeScript tests.
contract ClonesHelper {
    function clone(address implementation) external returns (address) {
        return Clones.clone(implementation);
    }
}
