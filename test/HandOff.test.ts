import { describe, it } from "node:test";
import { network } from "hardhat";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { parseEther, parseUnits, keccak256, encodePacked, zeroAddress, getAddress } from "viem";

chai.use(chaiAsPromised);
const { expect } = chai;
const { viem, networkHelpers } = await network.connect();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** keccak256(abi.encodePacked(code)) — mirrors what the contract checks. */
function codeHash(code: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [code]));
}

/** Advance Hardhat block time by `seconds`. */
async function increaseTime(seconds: number) {
  await networkHelpers.time.increase(seconds);
}

/**
 * BigInt-safe "approximately equal".
 * Chai's built-in `closeTo` uses Math.abs() which fails on BigInt.
 */
function bigIntCloseTo(actual: bigint, expected: bigint, delta: bigint): boolean {
  const diff = actual > expected ? actual - expected : expected - actual;
  return diff <= delta;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CODE        = "A7K2";
const WRONG_CODE  = "ZZZZ";
const AMOUNT_ETH  = parseEther("1");
const AMOUNT_USDC = parseUnits("400", 6);
const DUR_30S     = 30n;    // demo mode
const DUR_1D      = 86400n;
const FEE_BPS     = 50n;
const BPS_DENOM   = 10_000n;
const GAS_MARGIN  = parseEther("0.01"); // tolerance for gas in balance checks

function netToSeller(gross: bigint) {
  return gross - (gross * FEE_BPS) / BPS_DENOM;
}
function fee(gross: bigint) {
  return (gross * FEE_BPS) / BPS_DENOM;
}

// ─── Shared fixture ──────────────────────────────────────────────────────────

async function deployFixture() {
  const [owner, seller, buyer, feeRecipient, stranger] =
    await viem.getWalletClients();

  const mockWETH   = await viem.deployContract("MockWETH");
  const mockRouter = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
  const mockUSDC   = await viem.deployContract("MockERC20", ["MockUSDC", "USDC", 6n]);

  const handOff = await viem.deployContract("HandOff", [
    mockRouter.address,
    mockWETH.address,
    feeRecipient.account.address,
  ]);

  // Pre-fund buyer with USDC
  await mockUSDC.write.mint([buyer.account.address, parseUnits("10000", 6)]);

  // Helper: return a contract instance connected to a specific wallet
  async function as(contract: typeof handOff, wallet: typeof owner) {
    return viem.getContractAt("HandOff", contract.address, {
      client: { wallet },
    });
  }

  return { handOff, mockWETH, mockRouter, mockUSDC, owner, seller, buyer, feeRecipient, stranger, as };
}

// ─── UC-1: Seller creates HandOff ────────────────────────────────────────────
// Architecture decision: no on-chain CREATED state.
// UC-1 is handled entirely off-chain (URL parameter generation in the frontend).
// No contract tests needed for UC-1.

// ─── UC-2 / UC-3: Edit / Cancel before funding ───────────────────────────────
// These UCs require a CREATED state which has been removed from the contract.
// Editing and cancellation before funding are handled off-chain (URL link not shared).
// No contract tests needed for UC-2 or UC-3.

// ─── UC-4: Seller unlocks escrow with code ───────────────────────────────────

describe("UC-4 — unlock()", function () {
  async function fundedETHFixture() {
    const base = await deployFixture();
    const buyerHandOff = await base.as(base.handOff, base.buyer);
    await buyerHandOff.write.fund(
      [base.seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );
    return { ...base, dealId: 1n };
  }

  it("UC-4 happy path: releases net amount to seller, fee to feeRecipient", async function () {
    const { handOff, seller, feeRecipient, dealId, as } = await fundedETHFixture();
    const pubClient = await viem.getPublicClient();

    const sellerBefore = await pubClient.getBalance({ address: seller.account.address });
    const feeBefore    = await pubClient.getBalance({ address: feeRecipient.account.address });

    const sellerHandOff = await as(handOff, seller);
    await sellerHandOff.write.unlock([dealId, CODE]);

    const sellerAfter = await pubClient.getBalance({ address: seller.account.address });
    const feeAfter    = await pubClient.getBalance({ address: feeRecipient.account.address });

    // Seller receives net (minus gas — within GAS_MARGIN)
    expect(bigIntCloseTo(sellerAfter - sellerBefore, netToSeller(AMOUNT_ETH), GAS_MARGIN)).to.be.true;
    // Fee recipient receives exact fee (no gas cost)
    expect(feeAfter - feeBefore).to.equal(fee(AMOUNT_ETH));

    const deal = await handOff.read.getDeal([dealId]);
    expect(deal.status).to.equal(1); // COMPLETED
  });

  it("UC-4 extension 5a: wrong code reverts with WrongCode", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    const sellerHandOff = await as(handOff, seller);
    await expect(sellerHandOff.write.unlock([dealId, WRONG_CODE]))
      .to.be.rejectedWith("WrongCode");
  });

  it("UC-4 extension 5b: non-seller caller reverts with NotSeller", async function () {
    const { handOff, stranger, dealId, as } = await fundedETHFixture();
    const strangerHandOff = await as(handOff, stranger);
    await expect(strangerHandOff.write.unlock([dealId, CODE]))
      .to.be.rejectedWith("NotSeller");
  });

  it("UC-4 extension: deadline passed — reverts with DeadlineReached", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    await increaseTime(31);
    const sellerHandOff = await as(handOff, seller);
    await expect(sellerHandOff.write.unlock([dealId, CODE]))
      .to.be.rejectedWith("DeadlineReached");
  });

  it("UC-4 extension: double unlock reverts with DealNotFunded", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    const sellerHandOff = await as(handOff, seller);
    await sellerHandOff.write.unlock([dealId, CODE]);
    await expect(sellerHandOff.write.unlock([dealId, CODE]))
      .to.be.rejectedWith("DealNotFunded");
  });

  it("UC-4: deal marked COMPLETED, ENS + reputation notified (no revert if unset)", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    const sellerHandOff = await as(handOff, seller);
    // reputationContract and ensRegistrar are not set — calls are skipped silently
    await sellerHandOff.write.unlock([dealId, CODE]);
    const deal = await handOff.read.getDeal([dealId]);
    expect(deal.status).to.equal(1); // COMPLETED
  });
});

// ─── UC-6: Buyer funds HandOff (direct deposit) ──────────────────────────────

describe("UC-6 — fund() direct deposit", function () {
  it("UC-6 ETH: creates deal, locks ETH, emits DealFunded", async function () {
    const { handOff, seller, buyer, as } = await deployFixture();
    const buyerHandOff = await as(handOff, buyer);

    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );

    const deal = await handOff.read.getDeal([1n]);
    expect(deal.seller).to.equal(getAddress(seller.account.address));
    expect(deal.buyer).to.equal(getAddress(buyer.account.address));
    expect(deal.token).to.equal(zeroAddress);
    expect(deal.amount).to.equal(AMOUNT_ETH);
    expect(deal.status).to.equal(0); // FUNDED
    expect(await handOff.read.totalDeals()).to.equal(1n);

    const pubClient = await viem.getPublicClient();
    const contractBalance = await pubClient.getBalance({ address: handOff.address });
    expect(contractBalance).to.equal(AMOUNT_ETH);
  });

  it("UC-6 ERC20: transfers tokens from buyer, contract holds them", async function () {
    const { handOff, mockUSDC, seller, buyer, as } = await deployFixture();

    const buyerToken   = await viem.getContractAt("MockERC20", mockUSDC.address, { client: { wallet: buyer } });
    const buyerHandOff = await as(handOff, buyer);

    await buyerToken.write.approve([handOff.address, AMOUNT_USDC]);
    await buyerHandOff.write.fund([seller.account.address, mockUSDC.address, AMOUNT_USDC, DUR_1D, codeHash(CODE)]);

    expect(await mockUSDC.read.balanceOf([handOff.address])).to.equal(AMOUNT_USDC);
    const deal = await handOff.read.getDeal([1n]);
    expect(deal.token).to.equal(getAddress(mockUSDC.address));
    expect(deal.amount).to.equal(AMOUNT_USDC);
  });

  it("UC-6 validation: zero amount reverts InvalidAmount", async function () {
    const { handOff, seller, buyer, as } = await deployFixture();
    const buyerHandOff = await as(handOff, buyer);
    await expect(
      buyerHandOff.write.fund([seller.account.address, zeroAddress, 0n, DUR_30S, codeHash(CODE)], { value: 0n })
    ).to.be.rejectedWith("InvalidAmount");
  });

  it("UC-6 validation: zero seller address reverts InvalidSeller", async function () {
    const { handOff, buyer, as } = await deployFixture();
    const buyerHandOff = await as(handOff, buyer);
    await expect(
      buyerHandOff.write.fund([zeroAddress, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)], { value: AMOUNT_ETH })
    ).to.be.rejectedWith("InvalidSeller");
  });

  it("UC-6 validation: expiry below minimum reverts InvalidExpiry", async function () {
    const { handOff, seller, buyer, as } = await deployFixture();
    const buyerHandOff = await as(handOff, buyer);
    await expect(
      buyerHandOff.write.fund([seller.account.address, zeroAddress, AMOUNT_ETH, 10n, codeHash(CODE)], { value: AMOUNT_ETH })
    ).to.be.rejectedWith("InvalidExpiry");
  });

  it("UC-6 validation: zero codeHash reverts InvalidCodeHash", async function () {
    const { handOff, seller, buyer, as } = await deployFixture();
    const buyerHandOff = await as(handOff, buyer);
    const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    await expect(
      buyerHandOff.write.fund([seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, zeroHash], { value: AMOUNT_ETH })
    ).to.be.rejectedWith("InvalidCodeHash");
  });

  it("UC-6 validation: msg.value != amount reverts InvalidAmount", async function () {
    const { handOff, seller, buyer, as } = await deployFixture();
    const buyerHandOff = await as(handOff, buyer);
    await expect(
      buyerHandOff.write.fund([seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)], { value: AMOUNT_ETH / 2n })
    ).to.be.rejectedWith("InvalidAmount");
  });
});

// ─── UC-7: Buyer funds with ERC-20 swap (Uniswap) ────────────────────────────

describe("UC-7 — fundWithSwap()", function () {
  async function swapFixture() {
    const base = await deployFixture();
    const { mockRouter, mockUSDC, buyer, owner } = base;

    // Seed mock router through its reserve accounting helper.
    const routerLiquidity = parseUnits("10000", 6);
    await mockUSDC.write.mint([owner.account.address, routerLiquidity]);
    await mockUSDC.write.approve([mockRouter.address, routerLiquidity]);
    await mockRouter.write.mintOutput([mockUSDC.address, routerLiquidity]);

    // Buyer holds WETH to spend
    const buyerWETH = await viem.getContractAt("MockWETH", base.mockWETH.address, { client: { wallet: buyer } });
    await buyerWETH.write.deposit([], { value: parseEther("2") });

    return { ...base, buyerWETH };
  }

  it("UC-7: swaps WETH→USDC, locks amountOut, returns excess WETH to buyer", async function () {
    const { handOff, mockWETH, mockUSDC, seller, buyer, buyerWETH, as } = await swapFixture();

    const amountOut       = AMOUNT_USDC;
    const amountInMaximum = parseEther("0.5"); // max WETH to spend

    await buyerWETH.write.approve([handOff.address, amountInMaximum]);

    const buyerHandOff = await as(handOff, buyer);
    await buyerHandOff.write.fundWithSwap([
      seller.account.address,
      mockWETH.address,
      mockUSDC.address,
      amountOut,
      amountInMaximum,
      3000,        // pool fee tier
      DUR_1D,
      codeHash(CODE),
    ]);

    // Escrow holds exactly amountOut USDC
    expect(await mockUSDC.read.balanceOf([handOff.address])).to.equal(amountOut);

    const deal = await handOff.read.getDeal([1n]);
    expect(deal.token).to.equal(getAddress(mockUSDC.address));
    expect(deal.amount).to.equal(amountOut);
    expect(deal.status).to.equal(0); // FUNDED
  });

  it("UC-7 validation: tokenOut = address(0) reverts InvalidToken", async function () {
    const { handOff, mockWETH, buyer, seller, as } = await swapFixture();
    const buyerHandOff = await as(handOff, buyer);
    await expect(
      buyerHandOff.write.fundWithSwap([
        seller.account.address,
        mockWETH.address,
        zeroAddress,       // tokenOut cannot be address(0)
        AMOUNT_USDC,
        parseEther("0.5"),
        3000,
        DUR_1D,
        codeHash(CODE),
      ])
    ).to.be.rejectedWith("InvalidToken");
  });
});

// ─── UC-9: Buyer claims refund from expired HandOff ──────────────────────────

describe("UC-9 — refund()", function () {
  async function expiredFixture() {
    const base = await deployFixture();
    const buyerHandOff = await base.as(base.handOff, base.buyer);
    await buyerHandOff.write.fund(
      [base.seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );
    await increaseTime(31);
    return { ...base, dealId: 1n, buyerHandOff };
  }

  it("UC-9 happy path: buyer reclaims full amount, no fee deducted", async function () {
    const { handOff, buyer, dealId, buyerHandOff } = await expiredFixture();
    const pubClient = await viem.getPublicClient();

    const buyerBefore = await pubClient.getBalance({ address: buyer.account.address });
    await buyerHandOff.write.refund([dealId]);
    const buyerAfter = await pubClient.getBalance({ address: buyer.account.address });

    // Full amount back (minus gas)
    expect(bigIntCloseTo(buyerAfter - buyerBefore, AMOUNT_ETH, GAS_MARGIN)).to.be.true;

    const deal = await handOff.read.getDeal([dealId]);
    expect(deal.status).to.equal(2); // REFUNDED
  });

  it("UC-9: permissionless — stranger can trigger refund, funds go to buyer", async function () {
    const { handOff, buyer, stranger, dealId, as } = await expiredFixture();
    const pubClient = await viem.getPublicClient();

    const buyerBefore = await pubClient.getBalance({ address: buyer.account.address });

    const strangerHandOff = await as(handOff, stranger);
    await strangerHandOff.write.refund([dealId]); // stranger pays gas, buyer gets funds

    const buyerAfter = await pubClient.getBalance({ address: buyer.account.address });
    expect(buyerAfter - buyerBefore).to.equal(AMOUNT_ETH); // buyer pays no gas → exact
  });

  it("UC-9 extension: deadline not reached reverts DeadlineNotReached", async function () {
    const { handOff, buyer, as } = await deployFixture();
    const buyerHandOff = await as(handOff, buyer);
    await buyerHandOff.write.fund(
      [
        (await viem.getWalletClients())[1].account.address,
        zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE),
      ],
      { value: AMOUNT_ETH }
    );
    // No increaseTime — deadline NOT passed
    await expect(buyerHandOff.write.refund([1n]))
      .to.be.rejectedWith("DeadlineNotReached");
  });

  it("UC-9 extension: double refund reverts DealNotFunded", async function () {
    const { buyerHandOff, dealId } = await expiredFixture();
    await buyerHandOff.write.refund([dealId]);
    await expect(buyerHandOff.write.refund([dealId]))
      .to.be.rejectedWith("DealNotFunded");
  });

  it("UC-9: unlock impossible after refund (DealNotFunded)", async function () {
    const { handOff, seller, dealId, buyerHandOff, as } = await expiredFixture();
    await buyerHandOff.write.refund([dealId]);
    const sellerHandOff = await as(handOff, seller);
    await expect(sellerHandOff.write.unlock([dealId, CODE]))
      .to.be.rejectedWith("DealNotFunded");
  });
});

// ─── Deadline boundary (UC-4 / UC-9 mutual exclusion) ────────────────────────

describe("Deadline boundary — UC-4 vs UC-9 mutual exclusion", function () {
  it("at block.timestamp == expiry: unlock fails, refund succeeds", async function () {
    const { handOff, seller, buyer, as } = await deployFixture();

    const buyerHandOff  = await as(handOff, buyer);
    const sellerHandOff = await as(handOff, seller);

    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );

    await increaseTime(30); // block.timestamp >= expiry

    await expect(sellerHandOff.write.unlock([1n, CODE]))
      .to.be.rejectedWith("DeadlineReached");

    // refund succeeds — deal transitions to REFUNDED
    await buyerHandOff.write.refund([1n]);
    const deal = await handOff.read.getDeal([1n]);
    expect(deal.status).to.equal(2); // REFUNDED
  });
});

// ─── Multiple concurrent deals ────────────────────────────────────────────────

describe("Concurrent deals — isolation", function () {
  it("two active deals are fully independent", async function () {
    const { handOff, seller, buyer, as } = await deployFixture();
    const buyerHandOff  = await as(handOff, buyer);
    const sellerHandOff = await as(handOff, seller);

    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash("AAA1")],
      { value: AMOUNT_ETH }
    );
    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_1D,  codeHash("BBB2")],
      { value: AMOUNT_ETH }
    );

    expect(await handOff.read.totalDeals()).to.equal(2n);

    await sellerHandOff.write.unlock([1n, "AAA1"]);

    const deal1 = await handOff.read.getDeal([1n]);
    const deal2 = await handOff.read.getDeal([2n]);
    expect(deal1.status).to.equal(1); // COMPLETED
    expect(deal2.status).to.equal(0); // still FUNDED
  });
});
