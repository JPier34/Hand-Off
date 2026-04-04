// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// ---------------------------------------------------------------------------
// HandOffReputation — singleton registry on Base Sepolia
// UC-13: indexed events for transaction history queries
// UC-14: on-chain reputation storage — single struct, gas-efficient read
// ---------------------------------------------------------------------------

/// @title HandOffReputation
/// @notice Singleton reputation registry. Only registered HandOff escrow contracts
///         may write to it. Tracks deal counts, volume, and reviews per wallet.
contract HandOffReputation {

    // ── Custom errors ─────────────────────────────────────────────────────────
    // QUALITY: custom errors replace require strings — saves ~200 gas per revert
    error NotAuthorizedDeployer();
    error NotRegisteredEscrow();
    error InvalidDeployer();
    error InvalidEscrowAddress();
    error AlreadyRegistered();
    error InvalidSeller();
    error InvalidBuyer();
    error UnknownEscrow();
    error InvalidAddresses();
    error CannotReviewSelf();
    /// @dev SECURITY FIX: prevents same deal from being reviewed multiple times
    error ReviewAlreadySubmitted();

    // ── Reputation struct (UC-14) ─────────────────────────────────────────────
    struct ReputationData {
        uint128 sellerTotalVolume;
        uint32 sellerDealCount;
        uint32 sellerPositiveReviews;
        uint32 sellerTotalReviews;
        uint32 buyerDealCount;
        uint32 buyerPositiveReviews;
        uint32 buyerTotalReviews;
    }

    // ── Access control ────────────────────────────────────────────────────────
    address public immutable AUTHORIZED_DEPLOYER;
    mapping(address => bool) public registeredEscrows;
    // Maps numeric dealId to the specific escrow contract address
    mapping(uint256 => address) public getEscrowFromDealId;

    // ── Reputation storage ────────────────────────────────────────────────────
    mapping(address => ReputationData) private _reputation;

    // ── History arrays (UC-13 — bounded by deal count per wallet) ─────────────
    mapping(address => address[]) private _sellerHistory;
    mapping(address => address[]) private _buyerHistory;

    // ── SECURITY FIX: per-escrow review idempotency guards ────────────────────
    // Prevents a registered escrow from submitting multiple reviews for the same deal role.
    // Key: escrow address → reviewedAsSeller (true) or reviewedAsBuyer (false) → submitted.
    mapping(address => mapping(bool => bool)) private _reviewSubmitted;

    // ── Global counter ────────────────────────────────────────────────────────
    uint256 public totalDeals;

    // ── Events (UC-13 — indexed for frontend log queries) ─────────────────────
    event HandOffRecorded(
        address indexed seller,
        address indexed buyer,
        address indexed escrow,
        uint256 amount,
        uint256 timestamp
    );
    event ReviewSubmitted(
        address indexed reviewer,
        address indexed reviewed,
        address indexed escrow,
        bool isPositive,
        bool reviewedAsSeller
    );
    event HandOffRegistered(address indexed escrow, uint256 dealId);
    // QUALITY: emit event on revocation so indexers can track deregistrations
    event HandOffRevoked(address indexed escrow);

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
    /// @param _authorizedDeployer Address of the deployment operator that registers escrows.
    constructor(address _authorizedDeployer) {
        if (_authorizedDeployer == address(0)) revert InvalidDeployer();
        AUTHORIZED_DEPLOYER = _authorizedDeployer;
    }

    // ── Registration ──────────────────────────────────────────────────────────
    /// @notice Register a deployed HandOff escrow contract so it can write reputation data.
    /// @param _escrow The HandOff contract address to register.
    /// @return dealId The global deal counter at registration time.
    function registerHandOff(address _escrow)
        external
        onlyDeployer
        returns (uint256 dealId)
    {
        if (_escrow == address(0)) revert InvalidEscrowAddress();
        if (registeredEscrows[_escrow]) revert AlreadyRegistered();

        registeredEscrows[_escrow] = true;
        totalDeals++;
        dealId = totalDeals;

        getEscrowFromDealId[dealId] = _escrow;

        emit HandOffRegistered(_escrow, dealId);
    }

    /// @notice Revoke a previously registered escrow, preventing future writes.
    /// @param _escrow The HandOff contract address to revoke.
    function revokeHandOff(address _escrow) external onlyDeployer {
        registeredEscrows[_escrow] = false;
        // QUALITY: emit revocation event so off-chain indexers can track deregistrations
        emit HandOffRevoked(_escrow);
    }

    // ── Record completion (UC-14) ──────────────────────────────────────────────
    /// @notice Called by a registered HandOff escrow on successful deal completion.
    ///         Updates seller and buyer deal counts, seller volume, and appends history.
    /// @param _seller  The seller's address.
    /// @param _buyer   The buyer's address.
    /// @param _amount  The deal amount (in payout token units).
    function recordCompletion(address _seller, address _buyer, uint256 _amount)
        external
        onlyRegisteredEscrow
    {
        if (_seller == address(0)) revert InvalidSeller();
        if (_buyer == address(0)) revert InvalidBuyer();

        _reputation[_seller].sellerDealCount++;
        if (_amount <= type(uint128).max) {
            _reputation[_seller].sellerTotalVolume += uint128(_amount);
        } else {
            _reputation[_seller].sellerTotalVolume += type(uint128).max;
        }
        _reputation[_buyer].buyerDealCount++;

        _sellerHistory[_seller].push(msg.sender);
        _buyerHistory[_buyer].push(msg.sender);

        emit HandOffRecorded(_seller, _buyer, msg.sender, _amount, block.timestamp);
    }

    // ── Record review (UC-14) ─────────────────────────────────────────────────
    // reviewedAsSeller=true:  buyer reviews the seller  (seller reputation updated)
    // reviewedAsSeller=false: seller reviews the buyer  (buyer reputation updated)
    /// @notice Submit a post-deal review. Each escrow may only submit one review per role.
    /// @param _reviewer        Address of the reviewing party.
    /// @param _reviewed        Address of the party being reviewed.
    /// @param _escrow          The escrow contract this review is for.
    /// @param _isPositive      True for positive review, false for negative.
    /// @param _reviewedAsSeller True if reviewing the seller's performance, false for buyer.
    function recordReview(
        address _reviewer,
        address _reviewed,
        address _escrow,
        bool _isPositive,
        bool _reviewedAsSeller
    )
        external
        onlyRegisteredEscrow
    {
        if (!registeredEscrows[_escrow]) revert UnknownEscrow();
        if (_reviewer == address(0) || _reviewed == address(0)) revert InvalidAddresses();
        if (_reviewer == _reviewed) revert CannotReviewSelf();
        // SECURITY FIX: idempotency — prevent same escrow from submitting multiple reviews
        // for the same deal role, which would allow reputation inflation
        if (_reviewSubmitted[msg.sender][_reviewedAsSeller]) revert ReviewAlreadySubmitted();
        _reviewSubmitted[msg.sender][_reviewedAsSeller] = true;

        if (_reviewedAsSeller) {
            _reputation[_reviewed].sellerTotalReviews++;
            if (_isPositive) _reputation[_reviewed].sellerPositiveReviews++;
        } else {
            _reputation[_reviewed].buyerTotalReviews++;
            if (_isPositive) _reputation[_reviewed].buyerPositiveReviews++;
        }

        emit ReviewSubmitted(_reviewer, _reviewed, _escrow, _isPositive, _reviewedAsSeller);
    }

    // ── Reputation read (UC-14 — single SLOAD, gas-efficient) ─────────────────
    /// @notice Returns the full reputation struct for a wallet in a single call.
    function getReputation(address _wallet)
        external
        view
        returns (ReputationData memory)
    {
        return _reputation[_wallet];
    }

    // ── History reads (UC-13) ─────────────────────────────────────────────────
    /// @notice Returns full seller deal history (list of escrow contract addresses).
    /// @dev WARNING: unbounded array — use getSellerHistoryPage for high-volume wallets.
    function getSellerHistory(address _seller)
        external
        view
        returns (address[] memory)
    {
        return _sellerHistory[_seller];
    }

    /// @notice Returns full buyer deal history (list of escrow contract addresses).
    /// @dev WARNING: unbounded array — use getBuyerHistoryPage for high-volume wallets.
    function getBuyerHistory(address _buyer)
        external
        view
        returns (address[] memory)
    {
        return _buyerHistory[_buyer];
    }

    // GAS OPT: paginated history reads prevent gas DoS on high-volume wallets whose
    // full history arrays would exceed the block gas limit
    /// @notice Returns a page of seller deal history.
    /// @param _seller  The seller's address.
    /// @param offset   Starting index.
    /// @param limit    Maximum number of entries to return.
    function getSellerHistoryPage(address _seller, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        address[] storage hist = _sellerHistory[_seller];
        uint256 end = offset + limit > hist.length ? hist.length : offset + limit;
        if (end <= offset) return new address[](0);
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = hist[i];
    }

    /// @notice Returns a page of buyer deal history.
    /// @param _buyer   The buyer's address.
    /// @param offset   Starting index.
    /// @param limit    Maximum number of entries to return.
    function getBuyerHistoryPage(address _buyer, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page)
    {
        address[] storage hist = _buyerHistory[_buyer];
        uint256 end = offset + limit > hist.length ? hist.length : offset + limit;
        if (end <= offset) return new address[](0);
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = hist[i];
    }

    function getSellerHistoryLength(address _seller) external view returns (uint256) {
        return _sellerHistory[_seller].length;
    }

    function getBuyerHistoryLength(address _buyer) external view returns (uint256) {
        return _buyerHistory[_buyer].length;
    }
}
