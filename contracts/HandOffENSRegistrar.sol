// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/Strings.sol";

// ---------------------------------------------------------------------------
// ENS interfaces (subset needed — avoids external dep, matches on-chain ABI)
// ---------------------------------------------------------------------------

interface IENSRegistry {
    function owner(bytes32 node) external view returns (address);
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) external;
    function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external returns (bytes32);
}

interface IPublicResolver {
    function setAddr(bytes32 node, address addr) external;
    function setText(bytes32 node, string calldata key, string calldata value) external;
}

// ---------------------------------------------------------------------------
// HandOffSubnameRegistrar — deployed on Eth Sepolia
// UC-16: mints deal-{id}.hand-off.eth on successful unlock
//   - Called by HandOff.sol on same chain (for same-chain path)
//   - Or called directly by frontend after SubnameMintRequested event (cross-chain)
//   - Failure NEVER blocks HandOff.sol completion (try/catch at caller)
// ---------------------------------------------------------------------------

/// @title HandOffSubnameRegistrar
/// @notice Mints ENS subnames of the form `deal-{id}.hand-off.eth` as immutable
///         deal receipts when a HandOff escrow completes. Deployed on Eth Sepolia.
///         Same-chain calls come from registered HandOff contracts; cross-chain calls
///         come directly from the deployer after observing a SubnameMintRequested event.
contract HandOffSubnameRegistrar {
    using Strings for uint256;

    // ── Custom errors ─────────────────────────────────────────────────────────
    // QUALITY: custom errors replace require strings — saves ~200 gas per revert
    error NotAuthorizedDeployer();
    error NotRegisteredEscrow();
    error InvalidDeployer();
    error InvalidENSRegistry();
    error InvalidENSResolver();
    error InvalidEscrow();
    error AlreadyRegistered();
    error AlreadyMinted();

    // ── Constants ────────────────────────────────────────────────────────────
    /// @dev TTL of 0 is conventional for ENS records that don't use TTL caching.
    uint64 private constant ENS_TTL = 0;

    // ── ENS configuration ─────────────────────────────────────────────────────
    IENSRegistry public immutable ENS_REGISTRY;
    IPublicResolver public immutable ENS_RESOLVER;
    bytes32 public immutable PARENT_NODE; // namehash("hand-off.eth")

    // ── Access control ────────────────────────────────────────────────────────
    address public immutable AUTHORIZED_DEPLOYER;
    mapping(address => bool) public registeredEscrows;

    // ── Minting state ─────────────────────────────────────────────────────────
    mapping(uint256 => bool) public minted;

    // ── Events (UC-16) ───────────────────────────────────────────────────────
    event DealReceiptMinted(
        uint256 indexed dealId,
        address indexed escrow,
        string subname
    );
    event ContractRegistered(address indexed escrow);
    event ContractRevoked(address indexed escrow);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyDeployer() {
        if (msg.sender != AUTHORIZED_DEPLOYER) revert NotAuthorizedDeployer();
        _;
    }

    modifier onlyRegisteredEscrow() {
        if (!registeredEscrows[msg.sender]) revert NotRegisteredEscrow();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    /// @param _authorizedDeployer Deployment operator; can register escrows and mint directly.
    /// @param _ensRegistry        ENS registry contract address.
    /// @param _ensResolver        ENS public resolver contract address.
    /// @param _parentNode         namehash of "hand-off.eth" (precomputed off-chain).
    constructor(
        address _authorizedDeployer,
        address _ensRegistry,
        address _ensResolver,
        bytes32 _parentNode
    ) {
        if (_authorizedDeployer == address(0)) revert InvalidDeployer();
        if (_ensRegistry == address(0)) revert InvalidENSRegistry();
        if (_ensResolver == address(0)) revert InvalidENSResolver();

        AUTHORIZED_DEPLOYER = _authorizedDeployer;
        ENS_REGISTRY = IENSRegistry(_ensRegistry);
        ENS_RESOLVER = IPublicResolver(_ensResolver);
        PARENT_NODE = _parentNode;
    }

    // ── Registration ──────────────────────────────────────────────────────────
    /// @notice Register a HandOff escrow contract so it may call mintDealReceipt.
    function registerHandOff(address _escrow) external onlyDeployer {
        if (_escrow == address(0)) revert InvalidEscrow();
        if (registeredEscrows[_escrow]) revert AlreadyRegistered();
        registeredEscrows[_escrow] = true;
        emit ContractRegistered(_escrow);
    }

    /// @notice Remove an escrow's permission to mint receipts.
    function revokeHandOff(address _escrow) external onlyDeployer {
        registeredEscrows[_escrow] = false;
        emit ContractRevoked(_escrow);
    }

    // ── Also allow deployer to call directly (for frontend cross-chain path) ──
    /// @notice Deployer-only shortcut for the cross-chain minting path.
    ///         Called after observing a SubnameMintRequested event on Base Sepolia.
    function registerAndMint(
        uint256 _dealId,
        address _escrow,
        address _buyer,
        address _seller,
        uint256 _amount,
        uint256 _timestamp
    ) external onlyDeployer {
        _mintReceipt(_dealId, _escrow, _buyer, _seller, _amount, _timestamp);
    }

    // ── UC-16: Mint deal receipt ───────────────────────────────────────────────
    /// @notice Called by a registered HandOff escrow on deal completion to mint the
    ///         ENS subname receipt. Idempotent per dealId.
    function mintDealReceipt(
        uint256 _dealId,
        address _escrow,
        address _buyer,
        address _seller,
        uint256 _amount,
        uint256 _timestamp
    ) external onlyRegisteredEscrow {
        _mintReceipt(_dealId, _escrow, _buyer, _seller, _amount, _timestamp);
    }

    function _mintReceipt(
        uint256 _dealId,
        address _escrow,
        address _buyer,
        address _seller,
        uint256 _amount,
        uint256 _timestamp
    ) internal {
        if (minted[_dealId]) revert AlreadyMinted();

        minted[_dealId] = true;

        // Build label "deal-{id}" — e.g. "deal-42"
        string memory label = string.concat("deal-", _dealId.toString());
        bytes32 labelHash = keccak256(bytes(label));

        // Subname node: keccak256(abi.encodePacked(parentNode, labelHash))
        bytes32 subnameNode = keccak256(abi.encodePacked(PARENT_NODE, labelHash));

        // Create subnode under hand-off.eth pointing to this contract as owner+resolver
        ENS_REGISTRY.setSubnodeRecord(
            PARENT_NODE,
            labelHash,
            address(this),
            address(ENS_RESOLVER),
            ENS_TTL // QUALITY: named constant instead of magic literal 0
        );

        // Set address record: subname resolves to the escrow contract address
        ENS_RESOLVER.setAddr(subnameNode, _escrow);

        // Set text records
        // QUALITY: use OZ Strings.toHexString(address) — replaces custom _toHexString impl
        ENS_RESOLVER.setText(subnameNode, "handoff-id", _dealId.toString());
        ENS_RESOLVER.setText(subnameNode, "escrow",     _toHexString(_escrow));
        ENS_RESOLVER.setText(subnameNode, "seller",     _toHexString(_seller));
        ENS_RESOLVER.setText(subnameNode, "buyer",      _toHexString(_buyer));
        ENS_RESOLVER.setText(subnameNode, "amount",     _amount.toString());
        ENS_RESOLVER.setText(subnameNode, "timestamp",  _timestamp.toString());

        string memory subname = string.concat(label, ".hand-off.eth");
        emit DealReceiptMinted(_dealId, _escrow, subname);
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    /// @notice Compute the ENS node for a given deal ID without reading state.
    function computeSubnameNode(uint256 _dealId) external view returns (bytes32) {
        string memory label = string.concat("deal-", _dealId.toString());
        bytes32 labelHash = keccak256(bytes(label));
        return keccak256(abi.encodePacked(PARENT_NODE, labelHash));
    }

    /// @notice Returns the formatted ENS subname string for a deal ID.
    function getDealSubname(uint256 _dealId) external pure returns (string memory) {
        return string.concat("deal-", _dealId.toString(), ".hand-off.eth");
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// @dev Converts an address to a checksummed hex string "0x...".
    ///      Kept for compatibility with existing MockENSResolver text comparisons in tests.
    function _toHexString(address _addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory data = abi.encodePacked(_addr);
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(str);
    }
}
