// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

// ---------------------------------------------------------------------------
// Interfaces for sister contracts
// ---------------------------------------------------------------------------

interface IHandOffReputation {
    function registerHandOff(address escrow) external returns (uint256 dealId);
    function recordCompletion(address seller, address buyer, uint256 amount) external;
    function recordReview(address reviewer, address reviewed, address escrow, bool isPositive, bool reviewedAsSeller) external;
}

interface IHandOffSubnameRegistrar {
    function registerHandOff(address escrow) external;
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
// HandOff — trustless per-deal escrow (EIP-1167 minimal proxy compatible)
// UC-12: full state exposure via view functions
// UC-16: ENS subname minting trigger (try/catch — never blocks completion)
// UC-17: expiry enforcement on unlock(), refund() after expiry
//
// Proxy pattern: HandOffFactory deploys one implementation, clones it per
// deal via Clones.clone(), then calls initialize(). ReentrancyGuard works
// correctly with clones because it checks `value == ENTERED` (2); zero-init
// storage (0) is not equal to ENTERED, so the first call always passes.
// ---------------------------------------------------------------------------

/// @title HandOff
/// @notice Trustless per-deal escrow for in-person peer-to-peer transactions.
///         Funds are locked until the seller enters the buyer's unlock code or the
///         deal expires and the buyer claims a refund.
/// @dev EIP-1167 minimal proxy (clone) — deployed via Clones.clone() in HandOffFactory,
///      then initialized with initialize(). State machine: CREATED → FUNDED →
///      COMPLETED | EXPIRED | CANCELED.
contract HandOff is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Custom errors ────────────────────────────────────────────────────────
    error InvalidSeller();
    error ZeroReputationRegistry();
    error InvalidFeeRecipient();
    error AmountZero();
    error WindowTooShort(uint256 provided, uint256 minimum);
    error FeeBpsTooHigh(uint256 provided, uint256 maximum);
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
    enum State { CREATED, FUNDED, COMPLETED, EXPIRED, CANCELED }

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 public constant MIN_EXPIRY_WINDOW = 5 minutes;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 1000; // 10%
    /// @dev Gas forwarded to SubnameRegistrar.mintDealReceipt
    uint256 private constant ENS_MINT_GAS = 500_000;
    /// @dev Gas forwarded to Reputation.recordCompletion / recordReview
    uint256 private constant REPUTATION_GAS = 150_000;

    // ── Effectively-immutable fields (set once in initialize, never changed) ─
    // Cannot use Solidity `immutable` with EIP-1167 clones — immutables are
    // baked into bytecode at deploy time, not stored in proxy storage.
    uint256 public DEAL_ID;
    address public SELLER;
    uint256 public CREATED_AT;
    address public REPUTATION_REGISTRY;
    address public SUBNAME_REGISTRAR;
    address public ALLOWED_ROUTER;
    address public FEE_RECIPIENT;
    uint256 public PROTOCOL_FEE_BPS;

    // ── Mutable terms (editable by seller in CREATED state only) ─────────────
    address public payoutToken;
    uint256 public amount;
    address public sellerPayoutAddress;
    uint256 public expirationTimestamp;

    // ── ENS display names ────────────────────────────────────────────────────
    string public sellerEns;
    string public buyerEns;

    // ── Runtime state ────────────────────────────────────────────────────────
    State public state;
    address public buyer;
    bytes32 public codeHash;

    // ── Events ───────────────────────────────────────────────────────────────
    event HandOffFunded(address indexed buyer, uint256 amount, bytes32 codeHash);
    event HandOffCompleted(
        address indexed seller,
        address indexed buyer,
        address indexed sellerPayoutAddress,
        uint256 amount
    );
    event ProtocolFeePaid(address indexed recipient, uint256 amount);
    event HandOffExpired(address indexed escrow, address indexed buyer, uint256 amount);
    event HandOffCanceled(address indexed seller);
    event HandOffEdited(
        uint256 newAmount,
        address newPayoutToken,
        address newSellerPayoutAddress,
        uint256 newExpirationTimestamp
    );
    event SubnameMintRequested(
        uint256 indexed dealId,
        address indexed escrow,
        address buyer,
        address seller,
        uint256 amount,
        uint256 timestamp
    );
    event SubnameMintFailed(uint256 indexed dealId);
    event ReviewAttempted(address indexed reviewer, bool isPositive);

    // ── Modifiers ─────────────────────────────────────────────────────────────
    modifier onlySeller() {
        if (msg.sender != SELLER) revert NotSeller();
        _;
    }

    modifier onlyBuyer() {
        if (msg.sender != buyer) revert NotBuyer();
        _;
    }

    modifier inState(State _expected) {
        if (state != _expected) revert WrongState();
        _;
    }

    // ── Constructor (implementation only) ────────────────────────────────────
    /// @dev Locks the implementation contract so it cannot be initialized directly.
    ///      Each clone is initialized separately via initialize().
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ── Initializer (called on each clone by HandOffFactory) ─────────────────
    /// @notice Initialize a new HandOff clone. Replaces the constructor.
    ///         Called atomically by HandOffFactory.createHandOff() after Clones.clone().
    /// @param _seller               The seller's address (must be non-zero).
    /// @param _payoutToken          ERC-20 payout token, or address(0) for ETH.
    /// @param _amount               Required escrow amount in wei or token units.
    /// @param _expirationWindow     Seconds until deal expires (minimum MIN_EXPIRY_WINDOW).
    /// @param _dealId               Unique deal ID assigned by HandOffReputation.
    /// @param _reputationRegistry   HandOffReputation address (required — non-zero).
    /// @param _subnameRegistrar     HandOffSubnameRegistrar address, or address(0) for cross-chain.
    /// @param _sellerEns            Seller's ENS name for display (informational).
    /// @param _allowedRouter        Uniswap router for fundWithSwap, or address(0) to disable.
    /// @param _feeRecipient         Address receiving protocol fee on completion.
    /// @param _protocolFeeBps       Buyer-paid fee in basis points (1 = 0.01%).
    /// @param _sellerPayoutAddress  Payout address on unlock. Defaults to _seller if address(0).
    function initialize(
        address _seller,
        address _payoutToken,
        uint256 _amount,
        uint256 _expirationWindow,
        uint256 _dealId,
        address _reputationRegistry,
        address _subnameRegistrar,
        string memory _sellerEns,
        address _allowedRouter,
        address _feeRecipient,
        uint256 _protocolFeeBps,
        address _sellerPayoutAddress
    ) external initializer {
        if (_seller == address(0)) revert InvalidSeller();
        if (_reputationRegistry == address(0)) revert ZeroReputationRegistry();
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        if (_amount == 0) revert AmountZero();
        if (_protocolFeeBps > MAX_PROTOCOL_FEE_BPS)
            revert FeeBpsTooHigh(_protocolFeeBps, MAX_PROTOCOL_FEE_BPS);
        if (_expirationWindow < MIN_EXPIRY_WINDOW)
            revert WindowTooShort(_expirationWindow, MIN_EXPIRY_WINDOW);

        SELLER              = _seller;
        DEAL_ID             = _dealId;
        CREATED_AT          = block.timestamp;
        REPUTATION_REGISTRY = _reputationRegistry;
        SUBNAME_REGISTRAR   = _subnameRegistrar;
        ALLOWED_ROUTER      = _allowedRouter;
        FEE_RECIPIENT       = _feeRecipient;
        PROTOCOL_FEE_BPS    = _protocolFeeBps;

        payoutToken          = _payoutToken;
        amount               = _amount;
        sellerPayoutAddress  = _sellerPayoutAddress != address(0) ? _sellerPayoutAddress : _seller;
        expirationTimestamp  = block.timestamp + _expirationWindow;
        sellerEns            = _sellerEns;
        state                = State.CREATED;

        if (_subnameRegistrar != address(0)) {
            try IHandOffSubnameRegistrar(_subnameRegistrar).registerHandOff(address(this)) {} catch {}
        }
    }

    // ── Fund (ETH or ERC-20) ──────────────────────────────────────────────────
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
            if (msg.value != _requiredFunding()) revert WrongETHAmount();
        } else {
            if (msg.value != 0) revert ETHForbiddenForTokenEscrow();
            IERC20(payoutToken).safeTransferFrom(msg.sender, address(this), _requiredFunding());
        }

        buyer    = msg.sender;
        codeHash = _codeHash;
        buyerEns = _buyerEns;
        state    = State.FUNDED;

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
        if (msg.sender == SELLER) revert SellerCannotBeBuyer();
        if (_codeHash == bytes32(0)) revert ZeroCodeHash();
        if (payoutToken == address(0)) revert ETHEscrowUsesFundInstead();
        if (ALLOWED_ROUTER == address(0)) revert SwapNotConfigured();
        if (_router != ALLOWED_ROUTER) revert DisallowedRouter();
        if (_inputToken == payoutToken) revert InputTokenMatchesPayout();
        if (_inputAmount == 0) revert ZeroInputAmount();
        if (block.timestamp >= expirationTimestamp) revert DealExpired();

        uint256 inputBefore  = IERC20(_inputToken).balanceOf(address(this));
        IERC20(_inputToken).safeTransferFrom(msg.sender, address(this), _inputAmount);
        uint256 actualInput  = IERC20(_inputToken).balanceOf(address(this)) - inputBefore;

        IERC20(_inputToken).forceApprove(_router, actualInput);

        uint256 balanceBefore = IERC20(payoutToken).balanceOf(address(this));
        // slither-disable-next-line reentrancy-no-eth -- nonReentrant modifier prevents reentry
        (bool success, ) = _router.call(_swapData);
        if (!success) revert SwapCallReverted();

        uint256 requiredFunding = _requiredFunding();
        uint256 received        = IERC20(payoutToken).balanceOf(address(this)) - balanceBefore;
        if (received < requiredFunding) revert SlippageExceeded();

        uint256 payoutSurplus = received - requiredFunding;
        if (payoutSurplus > 0) IERC20(payoutToken).safeTransfer(msg.sender, payoutSurplus);

        IERC20(_inputToken).forceApprove(_router, 0);

        uint256 inputRemainingPostSwap = IERC20(_inputToken).balanceOf(address(this)) - inputBefore;
        if (inputRemainingPostSwap > 0) IERC20(_inputToken).safeTransfer(msg.sender, inputRemainingPostSwap);

        buyer    = msg.sender;
        codeHash = _codeHash;
        buyerEns = _buyerEns;
        state    = State.FUNDED;

        emit HandOffFunded(msg.sender, amount, _codeHash);
    }

    // ── Unlock ────────────────────────────────────────────────────────────────
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
            try IHandOffReputation(REPUTATION_REGISTRY).recordCompletion{gas: REPUTATION_GAS}(
                SELLER, buyer, amount
            ) {} catch {}
        }

        emit SubnameMintRequested(DEAL_ID, address(this), buyer, SELLER, amount, block.timestamp);

        if (SUBNAME_REGISTRAR != address(0)) {
            try IHandOffSubnameRegistrar(SUBNAME_REGISTRAR).mintDealReceipt{gas: ENS_MINT_GAS}(
                DEAL_ID, address(this), buyer, SELLER, amount, block.timestamp
            ) {} catch {
                emit SubnameMintFailed(DEAL_ID);
            }
        }

        uint256 feeAmount = _feeAmount(amount);
        _transferOut(sellerPayoutAddress, amount);
        if (feeAmount > 0) {
            _transferOut(FEE_RECIPIENT, feeAmount);
            emit ProtocolFeePaid(FEE_RECIPIENT, feeAmount);
        }
        emit HandOffCompleted(SELLER, buyer, sellerPayoutAddress, amount);
    }

    // ── Refund ────────────────────────────────────────────────────────────────
    function refund()
        external
        nonReentrant
        onlyBuyer
        inState(State.FUNDED)
    {
        if (block.timestamp <= expirationTimestamp) revert NotYetExpired();

        state = State.EXPIRED;

        uint256 refundAmount = _currentBalance();
        _transferOut(buyer, refundAmount);

        emit HandOffExpired(address(this), buyer, refundAmount);
    }

    // ── Submit Review ─────────────────────────────────────────────────────────
    function submitReview(bool _isPositive)
        external
        nonReentrant
        inState(State.COMPLETED)
    {
        bool isSeller = (msg.sender == SELLER);
        bool isBuyer  = (msg.sender == buyer);
        if (!isSeller && !isBuyer) revert NotParticipant();

        if (REPUTATION_REGISTRY != address(0)) {
            try IHandOffReputation(REPUTATION_REGISTRY).recordReview{gas: REPUTATION_GAS}(
                msg.sender,
                isBuyer ? SELLER : buyer,
                address(this),
                _isPositive,
                isBuyer
            ) {} catch {}
        }
        emit ReviewAttempted(msg.sender, _isPositive);
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
        if (_newAmount == 0) revert ZeroNewAmount();
        if (_newExpirationTimestamp <= block.timestamp) revert ExpirationNotFuture();
        if (_newExpirationTimestamp < block.timestamp + MIN_EXPIRY_WINDOW)
            revert WindowTooShort(_newExpirationTimestamp - block.timestamp, MIN_EXPIRY_WINDOW);
        if (_newSellerPayoutAddress == address(0)) revert ZeroPayoutAddress();

        amount               = _newAmount;
        payoutToken          = _newPayoutToken;
        sellerPayoutAddress  = _newSellerPayoutAddress;
        expirationTimestamp  = _newExpirationTimestamp;

        emit HandOffEdited(_newAmount, _newPayoutToken, _newSellerPayoutAddress, _newExpirationTimestamp);
    }

    // ── View functions ────────────────────────────────────────────────────────
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

    function getFeeAmount() external view returns (uint256) {
        return _feeAmount(amount);
    }

    function getRequiredFunding() external view returns (uint256) {
        return _requiredFunding();
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

    function _feeAmount(uint256 _sellerAmount) internal view returns (uint256) {
        return (_sellerAmount * PROTOCOL_FEE_BPS) / 10_000;
    }

    function _requiredFunding() internal view returns (uint256) {
        return amount + _feeAmount(amount);
    }

    function _transferOut(address _to, uint256 _amount) internal {
        if (payoutToken == address(0)) {
            (bool ok, ) = _to.call{value: _amount}("");
            if (!ok) revert ETHSendFailed();
        } else {
            IERC20(payoutToken).safeTransfer(_to, _amount);
        }
    }

    receive() external payable {
        if (payoutToken != address(0)) revert ETHRejectedByTokenEscrow();
    }
}
