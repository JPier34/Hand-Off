// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @dev Minimal ENS NameWrapper mock.
 *      Records the last call to setSubnodeRecord and returns a deterministic subnode.
 */
contract MockNameWrapper {
    // Last call arguments — readable by tests
    bytes32 public lastParentNode;
    string  public lastLabel;
    address public lastOwner;
    address public lastResolver;
    uint64  public lastTtl;
    uint32  public lastFuses;
    uint64  public lastExpiry;

    // Deterministic subnode: keccak256(parentNode, keccak256(label))
    function setSubnodeRecord(
        bytes32 parentNode,
        string  calldata label,
        address owner,
        address resolver,
        uint64  ttl,
        uint32  fuses,
        uint64  expiry
    ) external returns (bytes32 node) {
        lastParentNode = parentNode;
        lastLabel      = label;
        lastOwner      = owner;
        lastResolver   = resolver;
        lastTtl        = ttl;
        lastFuses      = fuses;
        lastExpiry     = expiry;

        node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }
}
