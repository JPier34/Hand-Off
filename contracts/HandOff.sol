// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// ─── External interfaces ──────────────────────────────────────────────────────

interface ISwapRouter02 {
    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }
    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external payable returns (uint256 amountIn);
}

interface IWETH {
    function deposit()                  external payable;
    function withdraw(uint256 amount)   external;
    function approve(address, uint256)  external returns (bool);
}

interface IHandOffReputation {
    function recordDeal(address seller, uint256 amount) external;
}

interface IHandOffENSRegistrar {
    function registerSubname(
        uint256 dealId,
        address buyer,
        address seller,
        uint256 amount
    ) external;
}

// ─── Main contract ────────────────────────────────────────────────────────────

/**
 * @title  HandOff
 * @notice Single-contract escrow manager for in-person peer-to-peer exchanges.
 *
 *  Flow:
 *   1. Seller shares a payment link (parameters encoded off-chain in URL).
 *   2. Buyer calls fund() or fundWithSwap() — first on-chain action.
 *   3. At the meetup, buyer verbally gives the 4-char code to the seller.
 *   4. Seller calls unlock(dealId, code) — funds released minus protocol fee.
 *   5. If deadline passes without unlock, buyer calls refund().
 *
 *  Security model:
 *   - unlock() requires msg.sender == deal.seller → eliminates front-running
 *     and makes brute-forcing the code useless.
 *   - Code is never stored on-chain; only keccak256(code) is stored.
 *   - Checks-Effects-Interactions pattern throughout.
 *   - ReentrancyGuard on all state-changing functions.
 */
contract HandOff is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────

    /// @dev 0.5% protocol fee taken from deal amount at unlock time.
    uint256 public constant FEE_BPS     = 50;
    uint256 private constant BPS_DENOM  = 10_000;

    /// @dev Minimum expiry duration — 30 s for demo mode.
    uint256 public constant MIN_EXPIRY  = 30;

    /// @dev Maximum expiry duration.
    uint256 public constant MAX_EXPIRY  = 30 days;

    // ─── Immutables ──────────────────────────────────────────────────────────

    /// @notice Uniswap SwapRouter02.
    address public immutable swapRouter;

    /// @notice Wrapped native token (WETH on Mainnet/Sepolia).
    address public immutable WETH;

    // ─── Mutable state ───────────────────────────────────────────────────────

    /// @notice Receives the 0.5% protocol fee on each completed deal.
    address public feeRecipient;

    /// @notice Optional reputation registry — set after deploy via setReputationContract().
    IHandOffReputation public reputationContract;

    /// @notice Optional ENS subname registrar — set after deploy via setENSRegistrar().
    IHandOffENSRegistrar public ensRegistrar;

    /// @dev Auto-incrementing deal ID counter (starts at 1).
    uint256 private _dealCounter;

    // ─── Deal data ───────────────────────────────────────────────────────────

    enum Status { FUNDED, COMPLETED, REFUNDED }

    struct Deal {
        address seller;     // receives funds on unlock
        address buyer;      // receives refund on expiry
        address token;      // address(0) = native ETH
        uint256 amount;     // gross amount locked (fee deducted at unlock)
        uint256 expiry;     // absolute UNIX timestamp
        bytes32 codeHash;   // keccak256(abi.encodePacked(code)) — computed client-side
        Status  status;
    }

    mapping(uint256 => Deal) public deals;

    // ─── Events ──────────────────────────────────────────────────────────────

    event DealFunded(
        uint256 indexed dealId,
        address indexed seller,
        address indexed buyer,
        address  token,
        uint256  amount,
        uint256  expiry
    );
    event DealCompleted(
        uint256 indexed dealId,
        address  seller,
        address  buyer,
        uint256  amountToSeller,
        uint256  fee
    );
    event DealRefunded(
        uint256 indexed dealId,
        address  buyer,
        uint256  amount
    );
    event FeeRecipientUpdated(address indexed newRecipient);
    event ReputationContractUpdated(address indexed newContract);
    event ENSRegistrarUpdated(address indexed newRegistrar);

    // ─── Custom errors ───────────────────────────────────────────────────────

    error InvalidSeller();
    error InvalidAmount();
    error InvalidExpiry();
    error InvalidCodeHash();
    error InvalidToken();
    error DealNotFunded();
    error NotSeller();
    error WrongCode();
    error DeadlineNotReached();
    error DeadlineReached();
    error ETHTransferFailed();
    error ZeroAddress();

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _swapRouter    Uniswap SwapRouter02 address.
     * @param _weth          WETH address on the target network.
     * @param _feeRecipient  Receives 0.5% protocol fee — use Safe deployer address.
     */
    constructor(
        address _swapRouter,
        address _weth,
        address _feeRecipient
    ) Ownable(msg.sender) {
        if (_swapRouter == address(0) || _weth == address(0) || _feeRecipient == address(0))
            revert ZeroAddress();
        swapRouter   = _swapRouter;
        WETH         = _weth;
        feeRecipient = _feeRecipient;
    }

    // ─── Funding ─────────────────────────────────────────────────────────────

    /**
     * @notice Fund a deal directly in the payout token.
     *         Use when buyer already holds the seller's preferred token.
     *
     * @param seller    Seller's wallet address.
     * @param token     ERC20 to lock. Pass address(0) for native ETH.
     * @param amount    Exact gross amount to lock.
     * @param duration  Lock duration in seconds (min 30, max 30 days).
     * @param codeHash  keccak256(abi.encodePacked(code)) — computed client-side.
     *                  Frontend must normalize code to UPPERCASE before hashing.
     * @return dealId   Assigned deal ID (starts at 1).
     */
    function fund(
        address seller,
        address token,
        uint256 amount,
        uint256 duration,
        bytes32 codeHash
    ) external payable nonReentrant returns (uint256 dealId) {
        _validateParams(seller, amount, duration, codeHash);

        if (token == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
        } else {
            if (msg.value != 0) revert InvalidToken();
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        dealId = _createDeal(seller, token, amount, duration, codeHash);
    }

    /**
     * @notice Fund a deal by swapping into the seller's preferred ERC20.
     *         Uses Uniswap exactOutputSingle — guarantees exactly `amountOut`
     *         is locked; unused input is refunded to the buyer.
     *
     * @param seller           Seller's wallet address.
     * @param tokenIn          Token buyer pays with. Pass address(0) for native ETH.
     * @param tokenOut         Seller's payout ERC20 (cannot be address(0)).
     * @param amountOut        Exact amount of tokenOut to lock in escrow.
     * @param amountInMaximum  Max tokenIn to spend (slippage cap).
     *                         Computed off-chain via Uniswap SDK quote.
     * @param poolFee          Uniswap v3 pool fee tier: 500 / 3000 / 10000.
     * @param duration         Lock duration in seconds.
     * @param codeHash         keccak256(abi.encodePacked(code)).
     * @return dealId          Assigned deal ID.
     */
    function fundWithSwap(
        address seller,
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint24  poolFee,
        uint256 duration,
        bytes32 codeHash
    ) external payable nonReentrant returns (uint256 dealId) {
        _validateParams(seller, amountOut, duration, codeHash);
        if (tokenOut == address(0))   revert InvalidToken();
        if (amountInMaximum == 0)     revert InvalidAmount();

        bool ethIn = (tokenIn == address(0));

        // ── Pull tokenIn ─────────────────────────────────────────────────────
        if (ethIn) {
            if (msg.value < amountInMaximum) revert InvalidAmount();
            // Wrap ETH → WETH for Uniswap
            IWETH(WETH).deposit{value: amountInMaximum}();
            IWETH(WETH).approve(swapRouter, amountInMaximum);
        } else {
            if (msg.value != 0) revert InvalidToken();
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountInMaximum);
            IERC20(tokenIn).safeIncreaseAllowance(swapRouter, amountInMaximum);
        }

        // ── Swap ─────────────────────────────────────────────────────────────
        uint256 amountIn = ISwapRouter02(swapRouter).exactOutputSingle(
            ISwapRouter02.ExactOutputSingleParams({
                tokenIn:           ethIn ? WETH : tokenIn,
                tokenOut:          tokenOut,
                fee:               poolFee,
                recipient:         address(this),
                amountOut:         amountOut,
                amountInMaximum:   amountInMaximum,
                sqrtPriceLimitX96: 0
            })
        );

        // ── Refund unused input ───────────────────────────────────────────────
        if (amountIn < amountInMaximum) {
            uint256 excess = amountInMaximum - amountIn;
            if (ethIn) {
                IWETH(WETH).withdraw(excess);
                _sendETH(msg.sender, excess);
            } else {
                IERC20(tokenIn).safeTransfer(msg.sender, excess);
            }
        }
        // Refund ETH sent above amountInMaximum
        if (ethIn && msg.value > amountInMaximum) {
            _sendETH(msg.sender, msg.value - amountInMaximum);
        }

        dealId = _createDeal(seller, tokenOut, amountOut, duration, codeHash);
    }

    // ─── Settlement ──────────────────────────────────────────────────────────

    /**
     * @notice Seller submits the unlock code to release escrowed funds.
     *         MUST be called by deal.seller — prevents front-running.
     *
     * @param dealId  Target deal ID.
     * @param code    Plaintext code verbally shared by buyer at the meetup.
     *                Frontend MUST normalize to UPPERCASE before calling.
     */
    function unlock(uint256 dealId, string calldata code) external nonReentrant {
        Deal storage deal = deals[dealId];

        // ── Checks ───────────────────────────────────────────────────────────
        if (deal.status != Status.FUNDED)                           revert DealNotFunded();
        if (msg.sender != deal.seller)                              revert NotSeller();
        if (block.timestamp >= deal.expiry)                         revert DeadlineReached();
        if (keccak256(abi.encodePacked(code)) != deal.codeHash)     revert WrongCode();

        // ── Effects ──────────────────────────────────────────────────────────
        deal.status = Status.COMPLETED;

        uint256 fee      = (deal.amount * FEE_BPS) / BPS_DENOM;
        uint256 toSeller = deal.amount - fee;

        // ── Interactions ─────────────────────────────────────────────────────
        _transfer(deal.token, deal.seller, toSeller);
        if (fee > 0) _transfer(deal.token, feeRecipient, fee);

        emit DealCompleted(dealId, deal.seller, deal.buyer, toSeller, fee);

        // Non-blocking — failure must never brick a completed deal
        _notifyReputation(deal.seller, toSeller);
        _notifyENS(dealId, deal.buyer, deal.seller, toSeller);
    }

    /**
     * @notice Reclaim escrowed funds after the deadline has passed.
     *         Permissionless — anyone can call; funds always go to deal.buyer.
     *
     * @param dealId  Expired deal to refund.
     */
    function refund(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];

        // ── Checks ───────────────────────────────────────────────────────────
        if (deal.status != Status.FUNDED)   revert DealNotFunded();
        if (block.timestamp < deal.expiry)  revert DeadlineNotReached();

        // ── Effects ──────────────────────────────────────────────────────────
        deal.status = Status.REFUNDED;

        // ── Interactions ─────────────────────────────────────────────────────
        _transfer(deal.token, deal.buyer, deal.amount);

        emit DealRefunded(dealId, deal.buyer, deal.amount);
    }

    // ─── View ────────────────────────────────────────────────────────────────

    /// @notice Full deal data for a given ID.
    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    /// @notice Total deals ever created (funded + completed + refunded).
    function totalDeals() external view returns (uint256) {
        return _dealCounter;
    }

    // ─── Owner setters ───────────────────────────────────────────────────────

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setReputationContract(address _reputation) external onlyOwner {
        reputationContract = IHandOffReputation(_reputation);
        emit ReputationContractUpdated(_reputation);
    }

    function setENSRegistrar(address _ensRegistrar) external onlyOwner {
        ensRegistrar = IHandOffENSRegistrar(_ensRegistrar);
        emit ENSRegistrarUpdated(_ensRegistrar);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _validateParams(
        address seller,
        uint256 amount,
        uint256 duration,
        bytes32 codeHash
    ) internal pure {
        if (seller == address(0))                            revert InvalidSeller();
        if (amount == 0)                                     revert InvalidAmount();
        if (duration < MIN_EXPIRY || duration > MAX_EXPIRY)  revert InvalidExpiry();
        if (codeHash == bytes32(0))                          revert InvalidCodeHash();
    }

    function _createDeal(
        address seller,
        address token,
        uint256 amount,
        uint256 duration,
        bytes32 codeHash
    ) internal returns (uint256 dealId) {
        dealId = ++_dealCounter;
        uint256 expiry = block.timestamp + duration;

        deals[dealId] = Deal({
            seller:   seller,
            buyer:    msg.sender,
            token:    token,
            amount:   amount,
            expiry:   expiry,
            codeHash: codeHash,
            status:   Status.FUNDED
        });

        emit DealFunded(dealId, seller, msg.sender, token, amount, expiry);
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            _sendETH(to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _sendETH(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert ETHTransferFailed();
    }

    function _notifyReputation(address seller, uint256 amount) internal {
        if (address(reputationContract) != address(0)) {
            try reputationContract.recordDeal(seller, amount) {} catch {}
        }
    }

    function _notifyENS(
        uint256 dealId,
        address buyer,
        address seller,
        uint256 amount
    ) internal {
        if (address(ensRegistrar) != address(0)) {
            try ensRegistrar.registerSubname(dealId, buyer, seller, amount) {} catch {}
        }
    }

    /// @dev Accept ETH from WETH.withdraw().
    receive() external payable {}
}
