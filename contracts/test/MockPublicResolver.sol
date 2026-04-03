// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @dev Minimal ENS PublicResolver mock.
 *      Stores text records and addr records so tests can verify them.
 */
contract MockPublicResolver {
    // node => key => value
    mapping(bytes32 => mapping(string => string)) private _text;

    // node => addr
    mapping(bytes32 => address) private _addr;

    function setText(bytes32 node, string calldata key, string calldata value) external {
        _text[node][key] = value;
    }

    function setAddr(bytes32 node, address addr) external {
        _addr[node] = addr;
    }

    // ── Readers ──────────────────────────────────────────────────────────────

    function getText(bytes32 node, string calldata key) external view returns (string memory) {
        return _text[node][key];
    }

    function getAddr(bytes32 node) external view returns (address) {
        return _addr[node];
    }
}
