// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev Minimal ENS registry mock — accepts all setSubnodeRecord calls
contract MockENSRegistry {
    mapping(bytes32 => address) private _owners;

    function setOwner(bytes32 node, address ownerAddr) external {
        _owners[node] = ownerAddr;
    }

    function owner(bytes32 node) external view returns (address) {
        return _owners[node];
    }

    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address newOwner,
        address, // resolver
        uint64   // ttl
    ) external {
        bytes32 subnode = keccak256(abi.encodePacked(node, label));
        _owners[subnode] = newOwner;
    }

    function setSubnodeOwner(bytes32 node, bytes32 label, address newOwner)
        external returns (bytes32)
    {
        bytes32 subnode = keccak256(abi.encodePacked(node, label));
        _owners[subnode] = newOwner;
        return subnode;
    }
}

/// @dev Minimal ENS resolver mock — records calls for assertion
contract MockENSResolver {
    mapping(bytes32 => address) public addrs;
    mapping(bytes32 => mapping(string => string)) public texts;

    function setAddr(bytes32 node, address addr) external {
        addrs[node] = addr;
    }

    function setText(bytes32 node, string calldata key, string calldata value) external {
        texts[node][key] = value;
    }
}

/// @dev ENS resolver that always reverts — used to test graceful failure
contract RevertingENSResolver {
    function setAddr(bytes32, address) external pure {
        revert("ENS resolver revert");
    }

    function setText(bytes32, string calldata, string calldata) external pure {
        revert("ENS resolver revert");
    }
}
