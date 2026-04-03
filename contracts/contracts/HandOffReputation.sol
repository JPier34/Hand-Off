// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// ---------------------------------------------------------------------------
// HandOffReputation — singleton registry on Base Sepolia
// UC-13: indexed events for transaction history queries
// UC-14: on-chain reputation storage — single struct, gas-efficient read
// ---------------------------------------------------------------------------

contract HandOffReputation {

    // ── Reputation struct (UC-14) ─────────────────────────────────────────────
    struct ReputationData {
        uint256 sellerDealCount;
        uint256 sellerTotalVolume;
        uint256 sellerPositiveReviews;
        uint256 sellerTotalReviews;
        uint256 buyerDealCount;
        uint256 buyerPositiveReviews;
        uint256 buyerTotalReviews;
    }

    // ── Access control ────────────────────────────────────────────────────────
    address public immutable AUTHORIZED_DEPLOYER;
    mapping(address => bool) public registeredEscrows;

    // ── Reputation storage ────────────────────────────────────────────────────
    mapping(address => ReputationData) private _reputation;

    // ── History arrays (UC-13 — bounded by deal count per wallet) ─────────────
    mapping(address => address[]) private _sellerHistory;
    mapping(address => address[]) private _buyerHistory;

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

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlyDeployer() {
        require(msg.sender == AUTHORIZED_DEPLOYER, "Not authorized deployer");
        _;
    }

    modifier onlyRegisteredEscrow() {
        require(registeredEscrows[msg.sender], "Not registered escrow");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _authorizedDeployer) {
        require(_authorizedDeployer != address(0), "Invalid deployer");
        AUTHORIZED_DEPLOYER = _authorizedDeployer;
    }

    // ── Registration ──────────────────────────────────────────────────────────
    function registerHandOff(address _escrow)
        external
        onlyDeployer
        returns (uint256 dealId)
    {
        require(_escrow != address(0), "Invalid escrow address");
        require(!registeredEscrows[_escrow], "Already registered");

        registeredEscrows[_escrow] = true;
        totalDeals++;
        dealId = totalDeals;

        emit HandOffRegistered(_escrow, dealId);
    }

    function revokeHandOff(address _escrow) external onlyDeployer {
        registeredEscrows[_escrow] = false;
    }

    // ── Record completion (UC-14) ──────────────────────────────────────────────
    function recordCompletion(address _seller, address _buyer, uint256 _amount)
        external
        onlyRegisteredEscrow
    {
        require(_seller != address(0), "Invalid seller");
        require(_buyer != address(0), "Invalid buyer");

        _reputation[_seller].sellerDealCount++;
        _reputation[_seller].sellerTotalVolume += _amount;
        _reputation[_buyer].buyerDealCount++;

        _sellerHistory[_seller].push(msg.sender);
        _buyerHistory[_buyer].push(msg.sender);

        emit HandOffRecorded(_seller, _buyer, msg.sender, _amount, block.timestamp);
    }

    // ── Record review (UC-14) ─────────────────────────────────────────────────
    // reviewedAsSeller=true: buyer reviews the seller (seller reputation updated)
    // reviewedAsSeller=false: seller reviews the buyer (buyer reputation updated)
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
        require(registeredEscrows[_escrow], "Unknown escrow");
        require(_reviewer != address(0) && _reviewed != address(0), "Invalid addresses");
        require(_reviewer != _reviewed, "Cannot review self");

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
    function getReputation(address _wallet)
        external
        view
        returns (ReputationData memory)
    {
        return _reputation[_wallet];
    }

    // ── History reads (UC-13) ─────────────────────────────────────────────────
    function getSellerHistory(address _seller)
        external
        view
        returns (address[] memory)
    {
        return _sellerHistory[_seller];
    }

    function getBuyerHistory(address _buyer)
        external
        view
        returns (address[] memory)
    {
        return _buyerHistory[_buyer];
    }

    function getSellerHistoryLength(address _seller) external view returns (uint256) {
        return _sellerHistory[_seller].length;
    }

    function getBuyerHistoryLength(address _buyer) external view returns (uint256) {
        return _buyerHistory[_buyer].length;
    }
}
