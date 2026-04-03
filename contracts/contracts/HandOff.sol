// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ---------------------------------------------------------------------------
// Interfaces for sister contracts
// ---------------------------------------------------------------------------

interface IHandOffReputation {
    function recordCompletion(address seller, address buyer, uint256 amount) external;
}

interface IHandOffSubnameRegistrar {
    function mintDealReceipt(
        uint256 dealId,
        address escrow,
        address buyer,
        address seller,
        uint256 amount,
        uint256 timestamp
    ) external;
}

// ---------------------------------------------------------------------------
// HandOff — trustless per-deal escrow
// UC-12: full state exposure via view functions
// UC-16: ENS subname minting trigger (try/catch — never blocks completion)
// UC-17: expiry enforcement on unlock(), refund() after expiry
// ---------------------------------------------------------------------------

contract HandOff is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State machine ────────────────────────────────────────────────────────
    // CREATED(0) → FUNDED(1) → COMPLETED(2)
    //                        → EXPIRED(3)   [refund after expiry]
    // CREATED(0) → CANCELED(4)              [seller cancels before funding]
    enum State { CREATED, FUNDED, COMPLETED, EXPIRED, CANCELED }

    // ── Immutable fields (never change after deployment) ─────────────────────
    uint256 public immutable DEAL_ID;
    address public immutable SELLER;
    uint256 public immutable CREATED_AT;
    address public immutable REPUTATION_REGISTRY; // address(0) = not configured
    address public immutable SUBNAME_REGISTRAR;   // address(0) = cross-chain, skip

    // ── Mutable terms (editable by seller in CREATED state only) ─────────────
    address public payoutToken;         // address(0) = ETH payout
    uint256 public amount;              // ETH wei or ERC-20 token units
    address public sellerPayoutAddress; // defaults to SELLER
    uint256 public expirationTimestamp; // absolute UNIX seconds

    // ── ENS display names (informational only, stored on-chain for UI) ────────
    string public sellerEns;
    string public buyerEns;

    // ── Runtime state ────────────────────────────────────────────────────────
    State public state;
    address public buyer;
    bytes32 public codeHash; // keccak256(4-digit base36 code) — set by buyer at fund()

    // ── Events ───────────────────────────────────────────────────────────────
    event HandOffFunded(
        address indexed buyer,
        uint256 amount,
        bytes32 codeHash
    );
    event HandOffCompleted(
        address indexed seller,
        address indexed sellerPayoutAddress,
        uint256 amount
    );
    event HandOffExpired(
        address indexed escrow,
        address indexed buyer,
        uint256 amount
    );
    event HandOffCanceled(address indexed seller);
    event HandOffEdited(
        uint256 newAmount,
        address newPayoutToken,
        address newSellerPayoutAddress,
        uint256 newExpirationTimestamp
    );
    /// @dev UC-16: emitted so frontend can trigger cross-chain ENS minting
    event SubnameMintRequested(
        uint256 indexed dealId,
        address indexed escrow,
        address buyer,
        address seller,
        uint256 amount,
        uint256 timestamp
    );
    /// @dev UC-16: emitted when same-chain subname registrar call reverts
    event SubnameMintFailed(uint256 indexed dealId);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlySeller() {
        require(msg.sender == SELLER, "Only seller");
        _;
    }

    modifier onlyBuyer() {
        require(msg.sender == buyer, "Only buyer");
        _;
    }

    modifier inState(State _expected) {
        require(state == _expected, "Invalid state");
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(
        address _seller,
        address _payoutToken,
        uint256 _amount,
        uint256 _expirationWindow,
        uint256 _dealId,
        address _reputationRegistry,
        address _subnameRegistrar,
        string memory _sellerEns
    ) {
        require(_seller != address(0), "Invalid seller");
        require(_amount > 0, "Amount must be > 0");
        require(_expirationWindow > 0, "Window must be > 0");

        SELLER = _seller;
        DEAL_ID = _dealId;
        CREATED_AT = block.timestamp;
        REPUTATION_REGISTRY = _reputationRegistry;
        SUBNAME_REGISTRAR = _subnameRegistrar;

        payoutToken = _payoutToken;
        amount = _amount;
        sellerPayoutAddress = _seller;
        expirationTimestamp = block.timestamp + _expirationWindow;
        sellerEns = _sellerEns;

        state = State.CREATED;
    }

    // ── Fund (ETH or ERC-20) ──────────────────────────────────────────────────
    function fund(bytes32 _codeHash, string calldata _buyerEns)
        external
        payable
        nonReentrant
        inState(State.CREATED)
    {
        require(msg.sender != SELLER, "Seller cannot be buyer");
        require(_codeHash != bytes32(0), "Invalid code hash");
        require(block.timestamp < expirationTimestamp, "Deal expired");

        if (payoutToken == address(0)) {
            require(msg.value == amount, "Incorrect ETH amount");
        } else {
            require(msg.value == 0, "No ETH for token escrow");
            IERC20(payoutToken).safeTransferFrom(msg.sender, address(this), amount);
        }

        buyer = msg.sender;
        codeHash = _codeHash;
        buyerEns = _buyerEns;
        state = State.FUNDED;

        emit HandOffFunded(msg.sender, amount, _codeHash);
    }

    // ── Fund with Uniswap Swap ────────────────────────────────────────────────
    function fundWithSwap(
        address _router,
        address _inputToken,
        uint256 _inputAmount,
        bytes calldata _swapData,
        bytes32 _codeHash,
        string calldata _buyerEns
    )
        external
        nonReentrant
        inState(State.CREATED)
    {
        require(msg.sender != SELLER, "Seller cannot be buyer");
        require(_codeHash != bytes32(0), "Invalid code hash");
        require(payoutToken != address(0), "Use fund() for ETH payout");
        require(_router != address(0), "Invalid router");
        require(_inputAmount > 0, "Input amount must be > 0");
        require(block.timestamp < expirationTimestamp, "Deal expired");

        IERC20(_inputToken).safeTransferFrom(msg.sender, address(this), _inputAmount);
        IERC20(_inputToken).forceApprove(_router, _inputAmount);

        uint256 balanceBefore = IERC20(payoutToken).balanceOf(address(this));
        (bool success, ) = _router.call(_swapData);
        require(success, "Swap failed");

        uint256 received = IERC20(payoutToken).balanceOf(address(this)) - balanceBefore;
        require(received >= amount, "Insufficient swap output");

        uint256 leftover = IERC20(_inputToken).balanceOf(address(this));
        if (leftover > 0) {
            IERC20(_inputToken).forceApprove(_router, 0);
            IERC20(_inputToken).safeTransfer(msg.sender, leftover);
        }

        buyer = msg.sender;
        codeHash = _codeHash;
        buyerEns = _buyerEns;
        state = State.FUNDED;

        emit HandOffFunded(msg.sender, amount, _codeHash);
    }

    // ── Unlock ────────────────────────────────────────────────────────────────
    function unlock(bytes32 _submittedHash)
        external
        nonReentrant
        onlySeller
        inState(State.FUNDED)
    {
        require(block.timestamp <= expirationTimestamp, "HandOff expired");
        require(_submittedHash == codeHash, "Incorrect code hash");

        state = State.COMPLETED;

        if (REPUTATION_REGISTRY != address(0)) {
            try IHandOffReputation(REPUTATION_REGISTRY).recordCompletion(
                SELLER, buyer, amount
            ) {} catch {}
        }

        emit SubnameMintRequested(DEAL_ID, address(this), buyer, SELLER, amount, block.timestamp);

        if (SUBNAME_REGISTRAR != address(0)) {
            try IHandOffSubnameRegistrar(SUBNAME_REGISTRAR).mintDealReceipt(
                DEAL_ID, address(this), buyer, SELLER, amount, block.timestamp
            ) {} catch {
                emit SubnameMintFailed(DEAL_ID);
            }
        }

        _transferOut(sellerPayoutAddress, amount);
        emit HandOffCompleted(SELLER, sellerPayoutAddress, amount);
    }

    // ── Refund (UC-17) ────────────────────────────────────────────────────────
    function refund()
        external
        nonReentrant
        onlyBuyer
        inState(State.FUNDED)
    {
        require(block.timestamp > expirationTimestamp, "Not yet expired");

        state = State.EXPIRED;

        uint256 refundAmount = _currentBalance();
        _transferOut(buyer, refundAmount);

        emit HandOffExpired(address(this), buyer, refundAmount);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────
    function cancel()
        external
        nonReentrant
        onlySeller
        inState(State.CREATED)
    {
        state = State.CANCELED;
        emit HandOffCanceled(SELLER);
    }

    // ── Edit ──────────────────────────────────────────────────────────────────
    function edit(
        uint256 _newAmount,
        address _newPayoutToken,
        address _newSellerPayoutAddress,
        uint256 _newExpirationTimestamp
    )
        external
        onlySeller
        inState(State.CREATED)
    {
        require(_newAmount > 0, "Amount must be > 0");
        require(_newExpirationTimestamp > block.timestamp, "Expiration must be future");
        require(_newSellerPayoutAddress != address(0), "Invalid payout address");

        amount = _newAmount;
        payoutToken = _newPayoutToken;
        sellerPayoutAddress = _newSellerPayoutAddress;
        expirationTimestamp = _newExpirationTimestamp;

        emit HandOffEdited(_newAmount, _newPayoutToken, _newSellerPayoutAddress, _newExpirationTimestamp);
    }

    // ── UC-12 View functions ──────────────────────────────────────────────────

    function getState() external view returns (State) { return state; }

    function getTerms()
        external view
        returns (uint256, address, address, uint256, uint256)
    {
        return (amount, payoutToken, sellerPayoutAddress, expirationTimestamp, CREATED_AT);
    }

    function getParticipants() external view returns (address, address) {
        return (SELLER, buyer);
    }

    function isExpired() external view returns (bool) {
        return block.timestamp > expirationTimestamp;
    }

    function dealInfo()
        external view
        returns (
            address _seller,
            address _buyer,
            uint256 _expiresAt,
            uint256 _balance,
            uint8 _state,
            string memory _sellerEns,
            string memory _buyerEns
        )
    {
        return (SELLER, buyer, expirationTimestamp, _currentBalance(), uint8(state), sellerEns, buyerEns);
    }

    // ── Internals ─────────────────────────────────────────────────────────────

    function _currentBalance() internal view returns (uint256) {
        return payoutToken == address(0)
            ? address(this).balance
            : IERC20(payoutToken).balanceOf(address(this));
    }

    function _transferOut(address _to, uint256 _amount) internal {
        if (payoutToken == address(0)) {
            (bool ok, ) = _to.call{value: _amount}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(payoutToken).safeTransfer(_to, _amount);
        }
    }

    receive() external payable {}
}
