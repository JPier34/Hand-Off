// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  HandOffReputation
 * @notice On-chain reputation registry anchored to wallet addresses (+ ENS).
 *
 *  Only the HandOff escrow contract can write reputation data.
 *  Anyone can read it — the frontend resolves ENS names client-side
 *  and displays: "alice.eth · 47 deals · 12.4 ETH volume".
 *
 *  Design decisions:
 *   - Volume is stored in the payout token's raw units (wei / USDC decimals).
 *     The frontend converts to human-readable amounts.
 *   - No per-token breakdown for MVP — total volume in deal token units.
 *   - Ownable: allows updating the authorized HandOff address post-deploy
 *     (e.g., after a contract upgrade).
 */
contract HandOffReputation is Ownable {

    // ─── State ───────────────────────────────────────────────────────────────

    /// @notice The HandOff escrow contract authorised to write reputation.
    address public handOffContract;

    struct Reputation {
        uint256 dealCount;    // total completed deals as seller
        uint256 totalVolume;  // cumulative payout received (raw token units)
    }

    mapping(address => Reputation) private _reputation;

    // ─── Events ──────────────────────────────────────────────────────────────

    event DealRecorded(address indexed seller, uint256 amount, uint256 newDealCount);
    event HandOffContractUpdated(address indexed newContract);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error NotHandOff();
    error ZeroAddress();

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _handOffContract  Address of the deployed HandOff.sol.
     *                          Can be updated later via setHandOffContract().
     */
    constructor(address _handOffContract) Ownable(msg.sender) {
        if (_handOffContract == address(0)) revert ZeroAddress();
        handOffContract = _handOffContract;
    }

    // ─── Write (HandOff only) ────────────────────────────────────────────────

    /**
     * @notice Called by HandOff.sol after a deal is completed.
     *         Increments seller's deal count and cumulative volume.
     *
     * @param seller  Seller's wallet address.
     * @param amount  Net payout to seller (after protocol fee, in raw token units).
     */
    function recordDeal(address seller, uint256 amount) external {
        if (msg.sender != handOffContract) revert NotHandOff();

        Reputation storage rep = _reputation[seller];
        rep.dealCount   += 1;
        rep.totalVolume += amount;

        emit DealRecorded(seller, amount, rep.dealCount);
    }

    // ─── Read ────────────────────────────────────────────────────────────────

    /**
     * @notice Returns reputation data for a wallet.
     *         Frontend resolves ENS name client-side and displays alongside.
     *
     * @param wallet       Address to query (resolve ENS → address off-chain first).
     * @return dealCount   Number of completed deals as seller.
     * @return totalVolume Cumulative net payout received (raw token units).
     */
    function getReputation(address wallet)
        external
        view
        returns (uint256 dealCount, uint256 totalVolume)
    {
        Reputation memory rep = _reputation[wallet];
        return (rep.dealCount, rep.totalVolume);
    }

    // ─── Owner ───────────────────────────────────────────────────────────────

    /**
     * @notice Update the authorised HandOff contract address.
     *         Use after a HandOff upgrade to preserve reputation history.
     */
    function setHandOffContract(address _handOffContract) external onlyOwner {
        if (_handOffContract == address(0)) revert ZeroAddress();
        handOffContract = _handOffContract;
        emit HandOffContractUpdated(_handOffContract);
    }
}
