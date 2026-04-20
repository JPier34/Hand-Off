// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./HandOff.sol";

// ---------------------------------------------------------------------------
// HandOffFactory — deploys HandOff escrows as EIP-1167 minimal proxies
//
// One HandOff *implementation* is deployed in the Factory constructor.
// Each createHandOff() call clones it (~45-byte proxy) and calls initialize(),
// reducing per-deal gas from ~1.9M to ~150k.
//
// The factory is set as AUTHORIZED_DEPLOYER on HandOffReputation, so it is
// the ONLY address that can register escrows with the reputation registry.
//
// Deployment order:
//   1. Deploy HandOffReputation(EOA)          ← EOA is initial deployer
//   2. Deploy HandOffFactory(reputation, …)   ← deploys implementation internally
//   3. reputation.transferDeployer(factory)   ← EOA hands off; system is autonomous
// ---------------------------------------------------------------------------

interface IHandOffReputationReg {
    function registerHandOff(address _escrow) external returns (uint256 dealId);
    function totalDeals() external view returns (uint256);
}

/// @dev Minimal interface for initializing a cloned HandOff.
interface IHandOffInit {
    function initialize(
        address _seller,
        address _payoutToken,
        uint256 _amount,
        uint256 _expirationWindow,
        uint256 _dealId,
        address _reputationRegistry,
        address _subnameRegistrar,
        string calldata _sellerEns,
        address _allowedRouter,
        address _feeRecipient,
        uint256 _protocolFeeBps,
        address _sellerPayoutAddress
    ) external;
}

/// @title HandOffFactory
/// @notice Deploys HandOff clones and atomically registers them with HandOffReputation.
contract HandOffFactory {
    using Clones for address;

    uint256 internal constant MAX_PROTOCOL_FEE_BPS = 1000; // 10%

    // ── Custom errors ─────────────────────────────────────────────────────────
    error ZeroReputationRegistry();
    error InvalidFeeRecipient();
    error FeeBpsTooHigh(uint256 provided, uint256 maximum);
    error DealIdMismatch();

    // ── Immutables ────────────────────────────────────────────────────────────
    /// @notice The HandOff implementation contract cloned for each deal.
    address public immutable IMPLEMENTATION;
    address public immutable REPUTATION_REGISTRY;
    address public immutable SUBNAME_REGISTRAR;
    address public immutable ALLOWED_ROUTER;
    address public immutable FEE_RECIPIENT;
    uint256 public immutable PROTOCOL_FEE_BPS;

    // ── Events ────────────────────────────────────────────────────────────────
    event HandOffCreated(
        address indexed seller,
        address indexed escrow,
        uint256 indexed dealId
    );

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address _reputationRegistry,
        address _subnameRegistrar,
        address _allowedRouter,
        address _feeRecipient,
        uint256 _protocolFeeBps
    ) {
        if (_reputationRegistry == address(0)) revert ZeroReputationRegistry();
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        if (_protocolFeeBps > MAX_PROTOCOL_FEE_BPS)
            revert FeeBpsTooHigh(_protocolFeeBps, MAX_PROTOCOL_FEE_BPS);

        REPUTATION_REGISTRY = _reputationRegistry;
        SUBNAME_REGISTRAR   = _subnameRegistrar;
        ALLOWED_ROUTER      = _allowedRouter;
        FEE_RECIPIENT       = _feeRecipient;
        PROTOCOL_FEE_BPS    = _protocolFeeBps;

        // Deploy the implementation once; all per-deal clones delegate to it.
        // HandOff constructor calls _disableInitializers() so it cannot be used directly.
        IMPLEMENTATION = address(new HandOff());
    }

    // ── Create ────────────────────────────────────────────────────────────────
    /// @notice Deploy a HandOff clone and register it with the reputation registry.
    ///         msg.sender becomes the seller. Gas: ~150k vs ~1.9M for a full deploy.
    function createHandOff(
        address _payoutToken,
        uint256 _amount,
        uint256 _expirationWindow,
        string calldata _sellerEns,
        address _sellerPayoutAddress
    ) external returns (address escrow, uint256 dealId) {
        uint256 expectedDealId = IHandOffReputationReg(REPUTATION_REGISTRY).totalDeals() + 1;

        // Clone the implementation (~45-byte proxy) and initialize it.
        address clone = IMPLEMENTATION.clone();
        IHandOffInit(clone).initialize(
            msg.sender,
            _payoutToken,
            _amount,
            _expirationWindow,
            expectedDealId,
            REPUTATION_REGISTRY,
            SUBNAME_REGISTRAR,
            _sellerEns,
            ALLOWED_ROUTER,
            FEE_RECIPIENT,
            PROTOCOL_FEE_BPS,
            _sellerPayoutAddress
        );

        dealId = IHandOffReputationReg(REPUTATION_REGISTRY).registerHandOff(clone);

        if (dealId != expectedDealId) revert DealIdMismatch();

        escrow = clone;
        emit HandOffCreated(msg.sender, escrow, dealId);
    }
}
