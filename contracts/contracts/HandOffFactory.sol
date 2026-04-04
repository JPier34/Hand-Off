// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./HandOff.sol";

// ---------------------------------------------------------------------------
// HandOffFactory — canonical entry point for creating HandOff escrows
//
// The factory is set as the AUTHORIZED_DEPLOYER on HandOffReputation, so it is
// the ONLY address that can register escrows with the reputation registry.
// Sellers call createHandOff() instead of deploying HandOff directly.
// This makes escrow creation permissionless while keeping reputation writes
// trustless — no human operator needed per deal.
//
// Deployment order:
//   1. Deploy HandOffReputation(EOA)        ← EOA is initial deployer
//   2. Deploy HandOffFactory(reputation, …)
//   3. reputation.transferDeployer(factory) ← EOA hands off; system is now autonomous
// ---------------------------------------------------------------------------

interface IHandOffReputationReg {
    function registerHandOff(address _escrow) external returns (uint256 dealId);
    function totalDeals() external view returns (uint256);
}

/// @title HandOffFactory
/// @notice Deploys individual HandOff escrows and atomically registers them with
///         HandOffReputation in a single transaction. This eliminates the manual
///         registerHandOff() step that blocked seller wallets in production.
contract HandOffFactory {

    // ── Custom errors ─────────────────────────────────────────────────────────
    error ZeroReputationRegistry();
    error DealIdMismatch();

    // ── Immutables ────────────────────────────────────────────────────────────
    address public immutable REPUTATION_REGISTRY;
    address public immutable SUBNAME_REGISTRAR; // address(0) on cross-chain deployments
    address public immutable ALLOWED_ROUTER;    // address(0) disables swap path

    // ── Events ────────────────────────────────────────────────────────────────
    event HandOffCreated(
        address indexed seller,
        address indexed escrow,
        uint256 indexed dealId
    );

    // ── Constructor ───────────────────────────────────────────────────────────
    /// @param _reputationRegistry HandOffReputation contract address (required).
    /// @param _subnameRegistrar   HandOffSubnameRegistrar address, or address(0) for cross-chain.
    /// @param _allowedRouter      Uniswap router for fundWithSwap, or address(0) to disable.
    constructor(
        address _reputationRegistry,
        address _subnameRegistrar,
        address _allowedRouter
    ) {
        if (_reputationRegistry == address(0)) revert ZeroReputationRegistry();
        REPUTATION_REGISTRY = _reputationRegistry;
        SUBNAME_REGISTRAR   = _subnameRegistrar;
        ALLOWED_ROUTER      = _allowedRouter;
    }

    // ── Create ────────────────────────────────────────────────────────────────
    /// @notice Deploy a new HandOff escrow and register it with the reputation
    ///         registry atomically. msg.sender becomes the seller.
    /// @param _payoutToken          ERC-20 payout token, or address(0) for ETH.
    /// @param _amount               Required escrow amount in wei or token units.
    /// @param _expirationWindow     Seconds until deal expires (minimum 5 minutes).
    /// @param _sellerEns            Seller's ENS name for UI display (informational, may be "").
    /// @param _sellerPayoutAddress  Address to receive funds on unlock. Pass address(0) to default to msg.sender.
    /// @return escrow  The deployed HandOff contract address.
    /// @return dealId  The global deal ID assigned by the reputation registry.
    function createHandOff(
        address _payoutToken,
        uint256 _amount,
        uint256 _expirationWindow,
        string calldata _sellerEns,
        address _sellerPayoutAddress
    ) external returns (address escrow, uint256 dealId) {
        // Pre-calculate the deal ID. The factory is the sole AUTHORIZED_DEPLOYER, so
        // totalDeals + 1 is guaranteed to be the next ID assigned by registerHandOff().
        uint256 expectedDealId = IHandOffReputationReg(REPUTATION_REGISTRY).totalDeals() + 1;

        HandOff handOff = new HandOff(
            msg.sender,            // seller
            _payoutToken,
            _amount,
            _expirationWindow,
            expectedDealId,        // dealId stored as immutable inside HandOff for subname minting
            REPUTATION_REGISTRY,
            SUBNAME_REGISTRAR,
            _sellerEns,
            ALLOWED_ROUTER,
            _sellerPayoutAddress   // address(0) → defaults to msg.sender inside HandOff
        );

        // Register the freshly deployed escrow — this is the only path to whitelist
        // a contract for reputation writes.
        dealId = IHandOffReputationReg(REPUTATION_REGISTRY).registerHandOff(address(handOff));

        // Sanity check: ensures totalDeals wasn't manipulated between the read and the
        // registerHandOff call (impossible in practice since factory is sole deployer, but
        // the revert is free and makes the invariant explicit).
        if (dealId != expectedDealId) revert DealIdMismatch();

        escrow = address(handOff);
        emit HandOffCreated(msg.sender, escrow, dealId);
    }
}
