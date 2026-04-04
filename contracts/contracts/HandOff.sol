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
    function recordReview(address reviewer, address reviewed, address escrow, bool isPositive, bool reviewedAsSeller) external;
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

/// @title HandOff
/// @notice Trustless per-deal escrow for in-person peer-to-peer transactions.
///         Funds are locked until the seller enters the buyer's unlock code or the
///         deal expires and the buyer claims a refund.
/// @dev Deployed once per deal (no factory). State machine: CREATED → FUNDED →
///      COMPLETED | EXPIRED | CANCELED.
contract HandOff is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Custom errors ────────────────────────────────────────────────────────
    // QUALITY: custom errors replace require strings — saves ~200 gas per revert
    error InvalidSeller();
    error AmountZero();
    error WindowTooShort(uint256 provided, uint256 minimum);
    error NotSeller();
    error NotBuyer();
    error WrongState();
    error SellerCannotBeBuyer();
    error ZeroCodeHash();
    error DealExpired();
    error WrongETHAmount();
    error ETHForbiddenForTokenEscrow();
    error SwapNotConfigured();
    error DisallowedRouter();
    error InputTokenMatchesPayout();
    error ZeroInputAmount();
    error ETHEscrowUsesFundInstead();
    error SwapCallReverted();
    error SlippageExceeded();
    error HandOffAlreadyExpired();
    error NotYetExpired();
    error NotParticipant();
    error WrongCodeHash();
    error ETHSendFailed();
    error ZeroNewAmount();
    error ExpirationNotFuture();
    error ZeroPayoutAddress();
    error ETHRejectedByTokenEscrow();

    // ── State machine ────────────────────────────────────────────────────────
    // CREATED(0) → FUNDED(1) → COMPLETED(2)
    //                        → EXPIRED(3)   [refund after expiry]
    // CREATED(0) → CANCELED(4)              [seller cancels before funding]
    enum State { CREATED, FUNDED, COMPLETED, EXPIRED, CANCELED }

    // ── Constants ────────────────────────────────────────────────────────────
    /// @dev SECURITY FIX: minimum expiry window prevents effectively-instant-expired deals
    ///      and protects against block.timestamp edge cases near expiry.
    uint256 public constant MIN_EXPIRY_WINDOW = 5 minutes; // 300 seconds

    // ── Immutable fields (never change after deployment) ─────────────────────
    uint256 public immutable DEAL_ID;
    address public immutable SELLER;
    uint256 public immutable CREATED_AT;
    address public immutable REPUTATION_REGISTRY; // address(0) = not configured
    address public immutable SUBNAME_REGISTRAR;   // address(0) = cross-chain, skip
    /// @dev SECURITY FIX: allowlisted router for fundWithSwap — address(0) disables swap
    address public immutable ALLOWED_ROUTER;

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
    /// @dev QUALITY: buyer indexed so frontend can query all completed deals for a buyer
    event HandOffCompleted(
        address indexed seller,
        address indexed buyer,
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
    /// @dev QUALITY: emitted on every submitReview() call — frontend can track attempts
    ///      even when the Reputation registry silently rejects duplicates.
    event ReviewAttempted(address indexed reviewer, bool isPositive);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlySeller() {
        // QUALITY: custom error
        if (msg.sender != SELLER) revert NotSeller();
        _;
    }

    modifier onlyBuyer() {
        // QUALITY: custom error
        if (msg.sender != buyer) revert NotBuyer();
        _;
    }

    modifier inState(State _expected) {
        // QUALITY: custom error
        if (state != _expected) revert WrongState();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    /// @notice Deploy a new HandOff escrow deal.
    /// @param _seller          The seller's address (must be non-zero).
    /// @param _payoutToken     ERC-20 payout token, or address(0) for ETH.
    /// @param _amount          Required escrow amount in wei or token units.
    /// @param _expirationWindow Seconds until deal expires (minimum MIN_EXPIRY_WINDOW).
    /// @param _dealId          Unique deal identifier (caller must enforce uniqueness).
    /// @param _reputationRegistry HandOffReputation address, or address(0) to skip.
    /// @param _subnameRegistrar   HandOffSubnameRegistrar address, or address(0) for cross-chain.
    /// @param _sellerEns       Seller's ENS name for display (informational).
    /// @param _allowedRouter   Uniswap router address for fundWithSwap, or address(0) to disable.
    constructor(
        address _seller,
        address _payoutToken,
        uint256 _amount,
        uint256 _expirationWindow,
        uint256 _dealId,
        address _reputationRegistry,
        address _subnameRegistrar,
        string memory _sellerEns,
        address _allowedRouter
    ) {
        if (_seller == address(0)) revert InvalidSeller();
        if (_amount == 0) revert AmountZero();
        // SECURITY FIX: minimum 5-minute window prevents instant-expired deals and
        // block.timestamp manipulation at the expiry boundary
        if (_expirationWindow < MIN_EXPIRY_WINDOW)
            revert WindowTooShort(_expirationWindow, MIN_EXPIRY_WINDOW);

        SELLER = _seller;
        DEAL_ID = _dealId;
        CREATED_AT = block.timestamp;
        REPUTATION_REGISTRY = _reputationRegistry;
        SUBNAME_REGISTRAR = _subnameRegistrar;
        // SECURITY FIX: only this allowlisted router may be called in fundWithSwap
        ALLOWED_ROUTER = _allowedRouter;

        payoutToken = _payoutToken;
        amount = _amount;
        sellerPayoutAddress = _seller;
        expirationTimestamp = block.timestamp + _expirationWindow;
        sellerEns = _sellerEns;

        state = State.CREATED;
    }

    // ── Fund (ETH or ERC-20) ──────────────────────────────────────────────────
    /// @notice Fund the escrow as buyer. Transitions state from CREATED → FUNDED.
    /// @param _codeHash  keccak256 of the 4-digit base36 unlock code chosen by the buyer.
    /// @param _buyerEns  Buyer's ENS name for display (informational, may be empty).
    function fund(bytes32 _codeHash, string calldata _buyerEns)
        external
        payable
        nonReentrant
        inState(State.CREATED)
    {
        if (msg.sender == SELLER) revert SellerCannotBeBuyer();
        if (_codeHash == bytes32(0)) revert ZeroCodeHash();
        if (block.timestamp >= expirationTimestamp) revert DealExpired();

        if (payoutToken == address(0)) {
            if (msg.value != amount) revert WrongETHAmount();
        } else {
            if (msg.value != 0) revert ETHForbiddenForTokenEscrow();
            IERC20(payoutToken).safeTransferFrom(msg.sender, address(this), amount);
        }

        buyer = msg.sender;
        codeHash = _codeHash;
        buyerEns = _buyerEns;
        state = State.FUNDED;

        emit HandOffFunded(msg.sender, amount, _codeHash);
    }

    // ── Fund with Uniswap Swap ────────────────────────────────────────────────
    /// @notice Fund the escrow by atomically swapping an input token for the payout token.
    ///         Only works when ALLOWED_ROUTER is configured (non-zero) and payoutToken is an
    ///         ERC-20 (not ETH). The swap must yield at least `amount` of payoutToken.
    /// @param _router      Must equal ALLOWED_ROUTER (enforced on-chain).
    /// @param _inputToken  Token the buyer is spending. Must differ from payoutToken.
    /// @param _inputAmount Amount of input token to pull from buyer.
    /// @param _swapData    Encoded swap call sent to _router.
    /// @param _codeHash    keccak256 of the unlock code.
    /// @param _buyerEns    Buyer's ENS name for display.
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
        if (msg.sender == SELLER) revert SellerCannotBeBuyer();
        if (_codeHash == bytes32(0)) revert ZeroCodeHash();
        if (payoutToken == address(0)) revert ETHEscrowUsesFundInstead();
        // SECURITY FIX: only the allowlisted router may be called — prevents arbitrary
        // external call abuse (approval exploits, oracle manipulation, etc.)
        if (ALLOWED_ROUTER == address(0)) revert SwapNotConfigured();
        if (_router != ALLOWED_ROUTER) revert DisallowedRouter();
        // SECURITY FIX: input and output tokens must differ — prevents balanceBefore
        // miscalculation and confusing swap semantics
        if (_inputToken == payoutToken) revert InputTokenMatchesPayout();
        if (_inputAmount == 0) revert ZeroInputAmount();
        if (block.timestamp >= expirationTimestamp) revert DealExpired();

        uint256 inputBefore = IERC20(_inputToken).balanceOf(address(this));
        IERC20(_inputToken).safeTransferFrom(msg.sender, address(this), _inputAmount);
        uint256 actualInput = IERC20(_inputToken).balanceOf(address(this)) - inputBefore;

        // SECURITY FIX: Approve only the actual amount received (fee-on-transfer safe)
        IERC20(_inputToken).forceApprove(_router, actualInput);

        uint256 balanceBefore = IERC20(payoutToken).balanceOf(address(this));
        (bool success, ) = _router.call(_swapData);
        if (!success) revert SwapCallReverted();

        uint256 received = IERC20(payoutToken).balanceOf(address(this)) - balanceBefore;
        if (received < amount) revert SlippageExceeded();

        // SECURITY FIX: always revoke router approval unconditionally — prevents residual
        // allowance for tokens (e.g. USDT) that don't decrement allowances atomically
        IERC20(_inputToken).forceApprove(_router, 0);

        // SECURITY FIX: Refund only the leftover from this specific swap attempt
        uint256 inputRemainingPostSwap = IERC20(_inputToken).balanceOf(address(this)) - inputBefore;
        if (inputRemainingPostSwap > 0) {
            IERC20(_inputToken).safeTransfer(msg.sender, inputRemainingPostSwap);
        }

        buyer = msg.sender;
        codeHash = _codeHash;
        buyerEns = _buyerEns;
        state = State.FUNDED;

        emit HandOffFunded(msg.sender, amount, _codeHash);
    }

    // ── Unlock ────────────────────────────────────────────────────────────────
    /// @notice Seller submits the buyer's unlock code to complete the deal and receive funds.
    ///         Must be called before expiration. Triggers reputation and ENS subname updates.
    /// @param _submittedHash keccak256 of the code the buyer revealed in person.
    function unlock(bytes32 _submittedHash)
        external
        nonReentrant
        onlySeller
        inState(State.FUNDED)
    {
        if (block.timestamp > expirationTimestamp) revert HandOffAlreadyExpired();
        if (_submittedHash != codeHash) revert WrongCodeHash();

        state = State.COMPLETED;

        if (REPUTATION_REGISTRY != address(0)) {
            // SECURITY FIX: Gas limit prevents OOG attacks from a malicious/bloated registry
            try IHandOffReputation(REPUTATION_REGISTRY).recordCompletion{gas: 150000}(
                SELLER, buyer, amount
            ) {} catch {}
        }

        emit SubnameMintRequested(DEAL_ID, address(this), buyer, SELLER, amount, block.timestamp);

        if (SUBNAME_REGISTRAR != address(0)) {
            // SECURITY FIX: Gas limit ensures ENS minting doesn't exhaust block gas
            try IHandOffSubnameRegistrar(SUBNAME_REGISTRAR).mintDealReceipt{gas: 500000}(
                DEAL_ID, address(this), buyer, SELLER, amount, block.timestamp
            ) {} catch {
                emit SubnameMintFailed(DEAL_ID);
            }
        }

        // SECURITY FIX: transfer full balance rather than stored `amount` — prevents
        // surplus payout tokens (from a favorable swap) from being permanently locked
        uint256 payout = _currentBalance();
        _transferOut(sellerPayoutAddress, payout);
        emit HandOffCompleted(SELLER, buyer, sellerPayoutAddress, payout);
    }

    // ── Refund (UC-17) ────────────────────────────────────────────────────────
    /// @notice Buyer claims a full refund after the deal has expired without seller unlock.
    ///         Transitions state from FUNDED → EXPIRED.
    function refund()
        external
        nonReentrant
        onlyBuyer
        inState(State.FUNDED)
    {
        // QUALITY: Custom error properly reflects the reality matching the logic
        if (block.timestamp <= expirationTimestamp) revert NotYetExpired();

        state = State.EXPIRED;

        uint256 refundAmount = _currentBalance();
        _transferOut(buyer, refundAmount);

        emit HandOffExpired(address(this), buyer, refundAmount);
    }

    // ── Submit Review (UC-14) ──────────────────────────────────────────────────
    /// @notice Submit a performance review. The escrow serves as the authenticated
    ///         proxy to the Reputation registry.
    /// @param _isPositive True if the experience was positive.
    function submitReview(bool _isPositive)
        external
        nonReentrant
        inState(State.COMPLETED)
    {
        bool isSeller = (msg.sender == SELLER);
        bool isBuyer = (msg.sender == buyer);
        if (!isSeller && !isBuyer) revert NotParticipant();
        
        if (REPUTATION_REGISTRY != address(0)) {
            // SECURITY FIX: Gas limit prevents OOG.
            try IHandOffReputation(REPUTATION_REGISTRY).recordReview{gas: 150000}(
                msg.sender,
                isBuyer ? SELLER : buyer,
                address(this),
                _isPositive,
                isBuyer // reviewedAsSeller = isBuyer? true : false
            ) {} catch {}
        }
        // QUALITY: emit so frontend can track every review attempt regardless of registry outcome
        emit ReviewAttempted(msg.sender, _isPositive);
    }

    // ── Cancel ────────────────────────────────────────────────────────────────
    /// @notice Seller cancels the deal before it is funded.
    ///         Transitions state from CREATED → CANCELED.
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
    /// @notice Seller updates deal terms while still in CREATED state.
    /// @param _newAmount               New required escrow amount (must be > 0).
    /// @param _newPayoutToken          New payout token, or address(0) for ETH.
    /// @param _newSellerPayoutAddress  Address that receives funds on completion.
    /// @param _newExpirationTimestamp  New absolute expiry (must be in the future).
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
        if (_newAmount == 0) revert ZeroNewAmount();
        if (_newExpirationTimestamp <= block.timestamp) revert ExpirationNotFuture();
        // SECURITY FIX: enforce MIN_EXPIRY_WINDOW on edit() — mirrors constructor invariant;
        // without this, seller could set a 1-second expiry, bypassing the 5-minute safety floor.
        if (_newExpirationTimestamp < block.timestamp + MIN_EXPIRY_WINDOW)
            revert WindowTooShort(_newExpirationTimestamp - block.timestamp, MIN_EXPIRY_WINDOW);
        if (_newSellerPayoutAddress == address(0)) revert ZeroPayoutAddress();

        amount = _newAmount;
        payoutToken = _newPayoutToken;
        sellerPayoutAddress = _newSellerPayoutAddress;
        expirationTimestamp = _newExpirationTimestamp;

        emit HandOffEdited(_newAmount, _newPayoutToken, _newSellerPayoutAddress, _newExpirationTimestamp);
    }

    // ── UC-12 View functions ──────────────────────────────────────────────────

    /// @notice Returns the current deal state as an enum.
    function getState() external view returns (State) { return state; }

    /// @notice Returns the core deal terms.
    /// @return Escrow amount, payout token, seller payout address, expiry timestamp, creation timestamp.
    function getTerms()
        external view
        returns (uint256, address, address, uint256, uint256)
    {
        return (amount, payoutToken, sellerPayoutAddress, expirationTimestamp, CREATED_AT);
    }

    /// @notice Returns seller and buyer addresses (buyer is address(0) before funding).
    function getParticipants() external view returns (address, address) {
        return (SELLER, buyer);
    }

    /// @notice Returns true if the deal has passed its expiration timestamp.
    function isExpired() external view returns (bool) {
        return block.timestamp > expirationTimestamp;
    }

    /// @notice Returns all deal information in a single call for the frontend.
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

    /// @dev Returns the contract's current balance of the payout asset.
    function _currentBalance() internal view returns (uint256) {
        return payoutToken == address(0)
            ? address(this).balance
            : IERC20(payoutToken).balanceOf(address(this));
    }

    /// @dev Transfers `_amount` of the payout asset to `_to`. Reverts on failure.
    function _transferOut(address _to, uint256 _amount) internal {
        if (payoutToken == address(0)) {
            (bool ok, ) = _to.call{value: _amount}("");
            if (!ok) revert ETHSendFailed();
        } else {
            IERC20(payoutToken).safeTransfer(_to, _amount);
        }
    }

    // SECURITY FIX: reject ETH sent to token escrows — no ETH recovery path exists
    // for ERC-20 escrow contracts, so any ETH received would be permanently locked.
    receive() external payable {
        if (payoutToken != address(0)) revert ETHRejectedByTokenEscrow();
    }
}
