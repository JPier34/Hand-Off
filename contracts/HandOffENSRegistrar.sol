// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

// ─── ENS interfaces (minimal) ────────────────────────────────────────────────

interface INameWrapper {
    function setSubnodeRecord(
        bytes32 parentNode,
        string  calldata label,
        address owner,
        address resolver,
        uint64  ttl,
        uint32  fuses,
        uint64  expiry
    ) external returns (bytes32 node);
}

interface IPublicResolver {
    function setText(
        bytes32 node,
        string  calldata key,
        string  calldata value
    ) external;

    function setAddr(bytes32 node, address addr) external;
}

/**
 * @title  HandOffENSRegistrar
 * @notice Mints deal-{id}.hand-off.eth subnames on deal completion.
 *
 *  Prerequisites (one-time setup, done via ENS UI before hackathon):
 *   1. Register hand-off.eth on sepolia.app.ens.domains.
 *   2. Wrap it via the ENS Name Wrapper.
 *   3. Set this contract as approved operator on hand-off.eth in the Name Wrapper.
 *
 *  On each completed deal, HandOff.sol calls registerSubname() which:
 *   - Mints deal-{id}.hand-off.eth owned by the HandOff contract.
 *   - Sets text records: buyer, seller, amount, timestamp.
 *   - Sets the addr record to the HandOff contract address.
 *
 *  The subname becomes a permanent, human-readable, on-chain deal receipt.
 */
contract HandOffENSRegistrar is Ownable {

    // ─── Constants ───────────────────────────────────────────────────────────

    /// @dev namehash("hand-off.eth") — precomputed off-chain.
    ///      namehash = keccak256(keccak256("hand-off") + namehash("eth"))
    bytes32 public constant HANDOFF_NODE =
        0x6a7b8e19fe8c83e3c0ccd8562c0ec77e21b72a94e0be02bcaf4d1df86e6a45e3;

    // ─── State ───────────────────────────────────────────────────────────────

    /// @notice The HandOff escrow contract — only caller allowed to register.
    address public handOffContract;

    /// @notice ENS Name Wrapper on Sepolia:
    ///         0x0635513f179D50A207757E05759CbD106d7dFcE8
    INameWrapper public nameWrapper;

    /// @notice ENS Public Resolver on Sepolia:
    ///         0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
    IPublicResolver public publicResolver;

    // ─── Events ──────────────────────────────────────────────────────────────

    event SubnameRegistered(
        uint256 indexed dealId,
        bytes32 indexed node,
        string  subname,
        address buyer,
        address seller,
        uint256 amount
    );

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotHandOff();
    error ZeroAddress();

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _handOffContract  HandOff.sol address.
     * @param _nameWrapper      ENS NameWrapper address on target network.
     * @param _publicResolver   ENS PublicResolver address on target network.
     */
    constructor(
        address _handOffContract,
        address _nameWrapper,
        address _publicResolver
    ) Ownable(msg.sender) {
        if (_handOffContract == address(0) ||
            _nameWrapper     == address(0) ||
            _publicResolver  == address(0)) revert ZeroAddress();

        handOffContract = _handOffContract;
        nameWrapper     = INameWrapper(_nameWrapper);
        publicResolver  = IPublicResolver(_publicResolver);
    }

    // ─── Registration (HandOff only) ─────────────────────────────────────────

    /**
     * @notice Mint deal-{dealId}.hand-off.eth and write deal metadata as text records.
     *         Called by HandOff.sol in the unlock() happy path.
     *
     * @param dealId  The completed deal ID — becomes the subname label.
     * @param buyer   Buyer's wallet address.
     * @param seller  Seller's wallet address.
     * @param amount  Net amount paid to seller (raw token units).
     */
    function registerSubname(
        uint256 dealId,
        address buyer,
        address seller,
        uint256 amount
    ) external {
        if (msg.sender != handOffContract) revert NotHandOff();

        string memory label = _uint2str(dealId);

        // ── Mint subname ──────────────────────────────────────────────────────
        // Owner = HandOff contract, resolver = PublicResolver, no fuses, no expiry cap
        bytes32 subnode = nameWrapper.setSubnodeRecord(
            HANDOFF_NODE,
            label,
            handOffContract,       // owner of the subname
            address(publicResolver),
            0,                     // ttl
            0,                     // fuses (none)
            type(uint64).max       // no expiry
        );

        // ── Write text records ────────────────────────────────────────────────
        publicResolver.setText(subnode, "deal.buyer",     _addr2str(buyer));
        publicResolver.setText(subnode, "deal.seller",    _addr2str(seller));
        publicResolver.setText(subnode, "deal.amount",    _uint2str(amount));
        publicResolver.setText(subnode, "deal.timestamp", _uint2str(block.timestamp));

        // ── Set addr record to HandOff contract ───────────────────────────────
        publicResolver.setAddr(subnode, handOffContract);

        emit SubnameRegistered(
            dealId,
            subnode,
            string(abi.encodePacked("deal-", label, ".hand-off.eth")),
            buyer,
            seller,
            amount
        );
    }

    // ─── Owner ───────────────────────────────────────────────────────────────

    function setHandOffContract(address _handOffContract) external onlyOwner {
        if (_handOffContract == address(0)) revert ZeroAddress();
        handOffContract = _handOffContract;
    }

    function setNameWrapper(address _nameWrapper) external onlyOwner {
        if (_nameWrapper == address(0)) revert ZeroAddress();
        nameWrapper = INameWrapper(_nameWrapper);
    }

    function setPublicResolver(address _publicResolver) external onlyOwner {
        if (_publicResolver == address(0)) revert ZeroAddress();
        publicResolver = IPublicResolver(_publicResolver);
    }

    // ─── Internal utils ──────────────────────────────────────────────────────

    /// @dev Convert uint256 to decimal string (no external libs needed).
    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /// @dev Convert address to lowercase hex string "0x...".
    function _addr2str(address addr) internal pure returns (string memory) {
        bytes memory data = abi.encodePacked(addr);
        bytes memory hexChars = "0123456789abcdef";
        bytes memory result = new bytes(42);
        result[0] = "0";
        result[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            result[2 + i * 2]     = hexChars[uint8(data[i] >> 4)];
            result[3 + i * 2]     = hexChars[uint8(data[i] & 0x0f)];
        }
        return string(result);
    }
}
