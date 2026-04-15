import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type {
  HandOff,
  HandOffReputation,
  MockERC20,
  MockReentrantSwapRouter,
  MockReentrantUnlocker,
  MockSwapRouter,
} from "../typechain-types";

const ONE_ETH       = ethers.parseEther("1.0");
const HALF_ETH      = ethers.parseEther("0.5");
const TWO_ETH       = ethers.parseEther("2.0");
const EXPIRY_WINDOW = 86_400n;
const FEE_BPS       = 1n; // 0.01%
// MIN_EXPIRY_WINDOW is 300 seconds (5 minutes) — tests requiring short expiry use this minimum.
const SHORT_WINDOW  = 300n;
const VALID_HASH    = ethers.keccak256(ethers.toUtf8Bytes("a3x9"));
const WRONG_HASH    = ethers.keccak256(ethers.toUtf8Bytes("xxxx"));

function feeFor(amount: bigint) {
  return (amount * FEE_BPS) / 10_000n;
}

function requiredFunding(amount: bigint) {
  return amount + feeFor(amount);
}

async function baseFixture() {
  const [deployer, seller, buyer, other, feeRecipient] = await ethers.getSigners();
  const rep = (await ethers.deployContract("HandOffReputation", [deployer.address])) as HandOffReputation;
  const h   = (await ethers.deployContract("HandOff", [
    seller.address, ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW,
    1n, await rep.getAddress(), ethers.ZeroAddress, "seller.eth",
    ethers.ZeroAddress, // ALLOWED_ROUTER — address(0) disables swap
    feeRecipient.address,
    FEE_BPS,
    ethers.ZeroAddress, // _sellerPayoutAddress — defaults to seller
  ])) as HandOff;
  // Register the escrow with the reputation registry (deployer is AUTHORIZED_DEPLOYER in unit tests).
  await rep.connect(deployer).registerHandOff(await h.getAddress());
  return { h, rep, deployer, seller, buyer, other, feeRecipient };
}

async function tokenFixture() {
  const [deployer, seller, buyer, other, feeRecipient] = await ethers.getSigners();
  const token = (await ethers.deployContract("MockERC20", ["T", "T", 18])) as MockERC20;
  await token.mint(buyer.address, TWO_ETH * 5n);
  const rep = (await ethers.deployContract("HandOffReputation", [deployer.address])) as HandOffReputation;
  const h   = (await ethers.deployContract("HandOff", [
    seller.address, await token.getAddress(), ONE_ETH, EXPIRY_WINDOW,
    2n, await rep.getAddress(), ethers.ZeroAddress, "",
    ethers.ZeroAddress, // ALLOWED_ROUTER
    feeRecipient.address,
    FEE_BPS,
    ethers.ZeroAddress, // _sellerPayoutAddress
  ])) as HandOff;
  await rep.connect(deployer).registerHandOff(await h.getAddress());
  return { h, rep, token, deployer, seller, buyer, other, feeRecipient };
}

async function fundedEth() {
  const ctx = await baseFixture();
  await ctx.h.connect(ctx.buyer).fund(VALID_HASH, "buyer.eth", { value: requiredFunding(ONE_ETH) });
  return ctx;
}

async function fundedToken() {
  const ctx = await tokenFixture();
  await ctx.token.connect(ctx.buyer).approve(await ctx.h.getAddress(), requiredFunding(ONE_ETH));
  await ctx.h.connect(ctx.buyer).fund(VALID_HASH, "");
  return ctx;
}

describe("HandOff", function () {

  // ── Constructor / view ──────────────────────────────────────────────────────
  describe("Constructor & view functions", function () {
    it("state is CREATED on deploy", async function () {
      const { h } = await loadFixture(baseFixture);
      expect(await h.getState()).to.equal(0);
    });

    it("getTerms() returns correct values", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      const [amt, tok, payout, expiry, created] = await h.getTerms();
      expect(amt).to.equal(ONE_ETH);
      expect(tok).to.equal(ethers.ZeroAddress);
      expect(payout).to.equal(seller.address);
      expect(expiry).to.be.gt(created);
    });

    it("getParticipants() returns zero-address buyer before funding", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      const [s, b] = await h.getParticipants();
      expect(s).to.equal(seller.address);
      expect(b).to.equal(ethers.ZeroAddress);
    });

    it("getParticipants() returns buyer after funding", async function () {
      const { h, buyer } = await loadFixture(fundedEth);
      const [, b] = await h.getParticipants();
      expect(b).to.equal(buyer.address);
    });

    it("isExpired() is false before expiry", async function () {
      const { h } = await loadFixture(baseFixture);
      expect(await h.isExpired()).to.be.false;
    });

    it("isExpired() is true after expiry", async function () {
      const { h } = await loadFixture(baseFixture);
      await time.increase(EXPIRY_WINDOW + 1n);
      expect(await h.isExpired()).to.be.true;
    });

    it("dealInfo() returns full struct", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      const info = await h.dealInfo();
      expect(info._seller).to.equal(seller.address);
      expect(info._state).to.equal(0);
      expect(info._sellerEns).to.equal("seller.eth");
    });

    it("reverts with amount=0 — AmountZero", async function () {
      const [deployer, seller, , , feeRecipient] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("HandOff");
      const rep = await ethers.deployContract("HandOffReputation", [deployer.address]);
      await expect(
        factory.deploy(seller.address, ethers.ZeroAddress, 0n, EXPIRY_WINDOW,
          1n, await rep.getAddress(), ethers.ZeroAddress, "", ethers.ZeroAddress, feeRecipient.address, FEE_BPS, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "AmountZero");
    });

    it("reverts with expirationWindow below minimum — WindowTooShort", async function () {
      // Updated: window=1 is below MIN_EXPIRY_WINDOW (300s) — correct error is WindowTooShort
      const [deployer, seller, , , feeRecipient] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("HandOff");
      const rep = await ethers.deployContract("HandOffReputation", [deployer.address]);
      await expect(
        factory.deploy(seller.address, ethers.ZeroAddress, ONE_ETH, 1n,
          1n, await rep.getAddress(), ethers.ZeroAddress, "", ethers.ZeroAddress, feeRecipient.address, FEE_BPS, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "WindowTooShort");
    });

    it("reverts with seller=zero address — InvalidSeller", async function () {
      const [, , , , feeRecipient] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("HandOff");
      await expect(
        factory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW,
          1n, ethers.ZeroAddress, ethers.ZeroAddress, "", ethers.ZeroAddress, feeRecipient.address, FEE_BPS, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidSeller");
    });

    it("reverts with fee recipient=zero address — InvalidFeeRecipient", async function () {
      const [deployer, seller] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("HandOff");
      const rep = await ethers.deployContract("HandOffReputation", [deployer.address]);
      await expect(
        factory.deploy(seller.address, ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW,
          1n, await rep.getAddress(), ethers.ZeroAddress, "", ethers.ZeroAddress, ethers.ZeroAddress, FEE_BPS, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidFeeRecipient");
    });

    it("ALLOWED_ROUTER stored as immutable", async function () {
      const [deployer, seller, , , feeRecipient] = await ethers.getSigners();
      const router = ethers.Wallet.createRandom().address;
      const rep = await ethers.deployContract("HandOffReputation", [deployer.address]);
      const h = (await ethers.deployContract("HandOff", [
        seller.address, ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW,
        1n, await rep.getAddress(), ethers.ZeroAddress, "", router,
        feeRecipient.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])) as HandOff;
      expect(await h.ALLOWED_ROUTER()).to.equal(router);
    });

    it("funding helpers expose fee amount and required funding", async function () {
      const { h, feeRecipient } = await loadFixture(baseFixture);
      expect(await h.FEE_RECIPIENT()).to.equal(feeRecipient.address);
      expect(await h.PROTOCOL_FEE_BPS()).to.equal(FEE_BPS);
      expect(await h.getFeeAmount()).to.equal(feeFor(ONE_ETH));
      expect(await h.getRequiredFunding()).to.equal(requiredFunding(ONE_ETH));
    });
  });

  // ── edit() ──────────────────────────────────────────────────────────────────
  describe("edit()", function () {
    it("seller can update terms and event fires", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      const exp = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await expect(h.connect(seller).edit(TWO_ETH, ethers.ZeroAddress, seller.address, exp))
        .to.emit(h, "HandOffEdited")
        .withArgs(TWO_ETH, ethers.ZeroAddress, seller.address, exp);
      const [amt] = await h.getTerms();
      expect(amt).to.equal(TWO_ETH);
    });

    it("reverts if non-seller edits — NotSeller", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      const exp = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await expect(h.connect(buyer).edit(ONE_ETH, ethers.ZeroAddress, buyer.address, exp))
        .to.be.revertedWithCustomError(h, "NotSeller");
    });

    it("reverts if edited after funding — WrongState", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      const exp = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await expect(h.connect(seller).edit(ONE_ETH, ethers.ZeroAddress, seller.address, exp))
        .to.be.revertedWithCustomError(h, "WrongState");
    });

    it("reverts if amount=0 — ZeroNewAmount", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      const exp = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await expect(h.connect(seller).edit(0n, ethers.ZeroAddress, seller.address, exp))
        .to.be.revertedWithCustomError(h, "ZeroNewAmount");
    });

    it("reverts if expiration is in the past — ExpirationNotFuture", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      await expect(
        h.connect(seller).edit(ONE_ETH, ethers.ZeroAddress, seller.address, 1n)
      ).to.be.revertedWithCustomError(h, "ExpirationNotFuture");
    });

    it("reverts if new payout address is zero — ZeroPayoutAddress", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      const exp = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await expect(
        h.connect(seller).edit(ONE_ETH, ethers.ZeroAddress, ethers.ZeroAddress, exp)
      ).to.be.revertedWithCustomError(h, "ZeroPayoutAddress");
    });

    it("reverts if new expiry is within MIN_EXPIRY_WINDOW — WindowTooShort", async function () {
      // SECURITY FIX: edit() now enforces the same 5-minute floor as the constructor
      const { h, seller } = await loadFixture(baseFixture);
      const exp = BigInt(Math.floor(Date.now() / 1000) + 60); // only 60 seconds — below 300s floor
      await expect(
        h.connect(seller).edit(ONE_ETH, ethers.ZeroAddress, seller.address, exp)
      ).to.be.revertedWithCustomError(h, "WindowTooShort");
    });
  });

  // ── cancel() ────────────────────────────────────────────────────────────────
  describe("cancel()", function () {
    it("seller cancels → CANCELED, event emitted", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      await expect(h.connect(seller).cancel())
        .to.emit(h, "HandOffCanceled").withArgs(seller.address);
      expect(await h.getState()).to.equal(4);
    });

    it("reverts if non-seller cancels — NotSeller", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      await expect(h.connect(buyer).cancel()).to.be.revertedWithCustomError(h, "NotSeller");
    });

    it("reverts if cancel after funding — WrongState", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      await expect(h.connect(seller).cancel()).to.be.revertedWithCustomError(h, "WrongState");
    });

    it("payment link inactive: fund() on CANCELED escrow reverts — WrongState", async function () {
      const { h, seller, buyer } = await loadFixture(baseFixture);
      await h.connect(seller).cancel();
      await expect(
        h.connect(buyer).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) })
      ).to.be.revertedWithCustomError(h, "WrongState");
    });
  });

  // ── fund() ETH ──────────────────────────────────────────────────────────────
  describe("fund() — ETH", function () {
    it("happy path: state→FUNDED, event, buyer/codeHash stored", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      await expect(h.connect(buyer).fund(VALID_HASH, "buyer.eth", { value: requiredFunding(ONE_ETH) }))
        .to.emit(h, "HandOffFunded").withArgs(buyer.address, ONE_ETH, VALID_HASH);
      expect(await h.getState()).to.equal(1);
      expect(await h.buyer()).to.equal(buyer.address);
      expect(await h.codeHash()).to.equal(VALID_HASH);
    });

    it("ETH held in contract after funding", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      await h.connect(buyer).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) });
      expect(await ethers.provider.getBalance(await h.getAddress())).to.equal(requiredFunding(ONE_ETH));
    });

    it("reverts if wrong ETH amount — WrongETHAmount", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      await expect(h.connect(buyer).fund(VALID_HASH, "", { value: HALF_ETH }))
        .to.be.revertedWithCustomError(h, "WrongETHAmount");
    });

    it("reverts if seller funds their own deal — SellerCannotBeBuyer", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      await expect(h.connect(seller).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) }))
        .to.be.revertedWithCustomError(h, "SellerCannotBeBuyer");
    });

    it("reverts if codeHash is zero bytes32 — ZeroCodeHash", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      await expect(h.connect(buyer).fund(ethers.ZeroHash, "", { value: requiredFunding(ONE_ETH) }))
        .to.be.revertedWithCustomError(h, "ZeroCodeHash");
    });

    it("reverts if deal already expired — DealExpired", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      await time.increase(EXPIRY_WINDOW + 1n);
      await expect(h.connect(buyer).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) }))
        .to.be.revertedWithCustomError(h, "DealExpired");
    });

    it("double-fund rejected — WrongState", async function () {
      const { h, other } = await loadFixture(fundedEth);
      await expect(h.connect(other).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) }))
        .to.be.revertedWithCustomError(h, "WrongState");
    });

    it("ETH sent to token escrow fund() rejected — ETHForbiddenForTokenEscrow", async function () {
      const { h } = await loadFixture(tokenFixture);
      const [, , buyer] = await ethers.getSigners();
      await expect(h.connect(buyer).fund(VALID_HASH, "", { value: ONE_ETH }))
        .to.be.revertedWithCustomError(h, "ETHForbiddenForTokenEscrow");
    });

    it("direct ETH transfer to token escrow rejected — ETHRejectedByTokenEscrow", async function () {
      // SECURITY FIX: receive() now blocks ETH on token escrows
      const { h } = await loadFixture(tokenFixture);
      const [, , buyer] = await ethers.getSigners();
      await expect(
        buyer.sendTransaction({ to: await h.getAddress(), value: ONE_ETH })
      ).to.be.revertedWithCustomError(h, "ETHRejectedByTokenEscrow");
    });
  });

  // ── fund() ERC-20 ───────────────────────────────────────────────────────────
  describe("fund() — ERC-20", function () {
    it("happy path: tokens held by contract, state→FUNDED", async function () {
      const { h, token, buyer } = await loadFixture(tokenFixture);
      await token.connect(buyer).approve(await h.getAddress(), requiredFunding(ONE_ETH));
      await expect(h.connect(buyer).fund(VALID_HASH, ""))
        .to.emit(h, "HandOffFunded");
      expect(await h.getState()).to.equal(1);
      expect(await token.balanceOf(await h.getAddress())).to.equal(requiredFunding(ONE_ETH));
    });

    it("reverts if allowance insufficient", async function () {
      const { h, token, buyer } = await loadFixture(tokenFixture);
      await token.connect(buyer).approve(await h.getAddress(), ONE_ETH);
      await expect(h.connect(buyer).fund(VALID_HASH, "")).to.be.reverted;
    });
  });

  // ── fundWithSwap() ─────────────────────────────────────────────────────────
  describe("fundWithSwap()", function () {
    async function swapFix() {
      const [deployer, seller, buyer, , feeRecipient] = await ethers.getSigners();
      const payoutTok = (await ethers.deployContract("MockERC20", ["PT", "PT", 18])) as MockERC20;
      const inputTok  = (await ethers.deployContract("MockERC20", ["IT", "IT", 18])) as MockERC20;
      const router    = (await ethers.deployContract("MockSwapRouter", [
        await payoutTok.getAddress(), requiredFunding(ONE_ETH),
      ])) as MockSwapRouter;
      const rep = (await ethers.deployContract("HandOffReputation", [deployer.address])) as HandOffReputation;
      // Pass router address as ALLOWED_ROUTER (9th constructor param) — fixes C-1
      const h   = (await ethers.deployContract("HandOff", [
        seller.address, await payoutTok.getAddress(), ONE_ETH, EXPIRY_WINDOW,
        10n, await rep.getAddress(), ethers.ZeroAddress, "",
        await router.getAddress(), // ALLOWED_ROUTER
        feeRecipient.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])) as HandOff;
      // HandOff self-registers with rep in its constructor — no manual call needed.
      await inputTok.mint(buyer.address, TWO_ETH);
      await inputTok.connect(buyer).approve(await h.getAddress(), TWO_ETH);
      const iface   = new ethers.Interface(["function swap(address,uint256)"]);
      const swapData = iface.encodeFunctionData("swap", [await inputTok.getAddress(), ONE_ETH]);
      return { h, rep, router, payoutTok, inputTok, deployer, seller, buyer, swapData };
    }

    it("happy path: atomically swaps and funds, state→FUNDED", async function () {
      const { h, router, inputTok, payoutTok, buyer, swapData } = await loadFixture(swapFix);
      await expect(
        h.connect(buyer).fundWithSwap(
          await router.getAddress(), await inputTok.getAddress(),
          ONE_ETH, swapData, VALID_HASH, "buyer.eth",
        )
      ).to.emit(h, "HandOffFunded");
      expect(await h.getState()).to.equal(1);
      expect(await payoutTok.balanceOf(await h.getAddress())).to.equal(requiredFunding(ONE_ETH));
    });

    it("blocks router reentrancy during swap and still lands in FUNDED", async function () {
      const [deployer, , buyer, , feeRecipient] = await ethers.getSigners();
      const payoutTok = (await ethers.deployContract("MockERC20", ["PT", "PT", 18])) as MockERC20;
      const inputTok  = (await ethers.deployContract("MockERC20", ["IT", "IT", 18])) as MockERC20;
      const router    = (await ethers.deployContract("MockReentrantSwapRouter", [
        await payoutTok.getAddress(), requiredFunding(ONE_ETH),
      ])) as MockReentrantSwapRouter;
      const rep = (await ethers.deployContract("HandOffReputation", [deployer.address])) as HandOffReputation;
      const h   = (await ethers.deployContract("HandOff", [
        await router.getAddress(), await payoutTok.getAddress(), ONE_ETH, EXPIRY_WINDOW,
        11n, await rep.getAddress(), ethers.ZeroAddress, "",
        await router.getAddress(), // router is also seller for the reentrancy attempt
        feeRecipient.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])) as HandOff;

      await router.setTarget(await h.getAddress());
      await inputTok.mint(buyer.address, TWO_ETH);
      await inputTok.connect(buyer).approve(await h.getAddress(), TWO_ETH);

      const iface = new ethers.Interface(["function swap(address,uint256)"]);
      const swapData = iface.encodeFunctionData("swap", [await inputTok.getAddress(), ONE_ETH]);

      await expect(
        h.connect(buyer).fundWithSwap(
          await router.getAddress(),
          await inputTok.getAddress(),
          ONE_ETH,
          swapData,
          VALID_HASH,
          "buyer.eth",
        )
      ).to.emit(h, "HandOffFunded");

      expect(await router.reentryAttempts()).to.equal(1n);
      expect(await router.reentrySucceeded()).to.equal(false);
      expect(await h.getState()).to.equal(1);
      expect(await h.buyer()).to.equal(buyer.address);
    });

    it("reverts if swap call fails — SwapCallReverted", async function () {
      const { h, router, inputTok, buyer, swapData } = await loadFixture(swapFix);
      await router.setFail(true);
      await expect(
        h.connect(buyer).fundWithSwap(
          await router.getAddress(), await inputTok.getAddress(),
          ONE_ETH, swapData, VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(h, "SwapCallReverted");
    });

    it("reverts if swap output < required amount — SlippageExceeded", async function () {
      const { h, router, inputTok, buyer, swapData } = await loadFixture(swapFix);
      await router.setOutputAmount(ONE_ETH);
      await expect(
        h.connect(buyer).fundWithSwap(
          await router.getAddress(), await inputTok.getAddress(),
          ONE_ETH, swapData, VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(h, "SlippageExceeded");
    });

    it("reverts for ETH payout escrow — ETHEscrowUsesFundInstead", async function () {
      const { h, buyer } = await loadFixture(baseFixture);
      await expect(
        h.connect(buyer).fundWithSwap(
          ethers.ZeroAddress, ethers.ZeroAddress, ONE_ETH, "0x", VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(h, "ETHEscrowUsesFundInstead");
    });

    it("reverts with wrong router address — DisallowedRouter", async function () {
      // SECURITY FIX: only ALLOWED_ROUTER may be passed; address(0) is disallowed
      const { h, inputTok, buyer } = await loadFixture(swapFix);
      await expect(
        h.connect(buyer).fundWithSwap(
          ethers.ZeroAddress, await inputTok.getAddress(), ONE_ETH, "0x", VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(h, "DisallowedRouter");
    });

    it("reverts with inputAmount=0 — ZeroInputAmount", async function () {
      const { h, router, inputTok, buyer } = await loadFixture(swapFix);
      await expect(
        h.connect(buyer).fundWithSwap(
          await router.getAddress(), await inputTok.getAddress(), 0n, "0x", VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(h, "ZeroInputAmount");
    });

    it("reverts if seller tries to fundWithSwap their own deal — SellerCannotBeBuyer", async function () {
      const { h, router, inputTok, seller, swapData } = await loadFixture(swapFix);
      await expect(
        h.connect(seller).fundWithSwap(
          await router.getAddress(), await inputTok.getAddress(),
          ONE_ETH, swapData, VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(h, "SellerCannotBeBuyer");
    });

    it("reverts when ALLOWED_ROUTER not configured — SwapNotConfigured", async function () {
      // SECURITY FIX: deploying with address(0) router disables fundWithSwap entirely
      const [deployer, seller, buyer] = await ethers.getSigners();
      const tok = (await ethers.deployContract("MockERC20", ["T","T",18])) as MockERC20;
      const rep = (await ethers.deployContract("HandOffReputation", [deployer.address])) as HandOffReputation;
      const noSwapH = (await ethers.deployContract("HandOff", [
        seller.address, await tok.getAddress(), ONE_ETH, EXPIRY_WINDOW,
        99n, await rep.getAddress(), ethers.ZeroAddress, "",
        ethers.ZeroAddress, // no router
        buyer.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])) as HandOff;
      await expect(
        noSwapH.connect(buyer).fundWithSwap(
          ethers.ZeroAddress, await tok.getAddress(), ONE_ETH, "0x", VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(noSwapH, "SwapNotConfigured");
    });

    it("reverts if inputToken == payoutToken — InputTokenMatchesPayout", async function () {
      // SECURITY FIX: prevents balanceBefore miscalculation when input == output token
      const { h, router, payoutTok, buyer } = await loadFixture(swapFix);
      const iface = new ethers.Interface(["function swap(address,uint256)"]);
      const swapData = iface.encodeFunctionData("swap", [await payoutTok.getAddress(), ONE_ETH]);
      await payoutTok.mint(buyer.address, TWO_ETH);
      await payoutTok.connect(buyer).approve(await h.getAddress(), TWO_ETH);
      await expect(
        h.connect(buyer).fundWithSwap(
          await router.getAddress(), await payoutTok.getAddress(),
          ONE_ETH, swapData, VALID_HASH, "",
        )
      ).to.be.revertedWithCustomError(h, "InputTokenMatchesPayout");
    });
  });

  // ── unlock() ETH ────────────────────────────────────────────────────────────
  describe("unlock() — ETH", function () {
    it("happy path: COMPLETED, ETH to seller, events emitted", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      const before = await ethers.provider.getBalance(seller.address);
      const tx = await h.connect(seller).unlock(VALID_HASH);
      const receipt = await tx.wait();
      const gas = receipt!.gasUsed * receipt!.gasPrice;
      expect(await h.getState()).to.equal(2);
      const after = await ethers.provider.getBalance(seller.address);
      expect(after).to.be.closeTo(before + ONE_ETH - gas, ethers.parseEther("0.001"));
    });

    it("sends the protocol fee to the fee recipient on completion", async function () {
      const { h, seller, feeRecipient } = await loadFixture(fundedEth);
      const before = await ethers.provider.getBalance(feeRecipient.address);
      await h.connect(seller).unlock(VALID_HASH);
      const after = await ethers.provider.getBalance(feeRecipient.address);
      expect(after - before).to.equal(feeFor(ONE_ETH));
    });

    it("HandOffCompleted event includes seller, buyer, payoutAddr, amount", async function () {
      // QUALITY: event signature updated — buyer is now the 2nd indexed field
      const { h, seller, buyer } = await loadFixture(fundedEth);
      await expect(h.connect(seller).unlock(VALID_HASH))
        .to.emit(h, "HandOffCompleted")
        .withArgs(seller.address, buyer.address, seller.address, ONE_ETH);
    });

    it("SubnameMintRequested always emitted", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      await expect(h.connect(seller).unlock(VALID_HASH)).to.emit(h, "SubnameMintRequested");
    });

    it("reverts for wrong code hash — WrongCodeHash", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      await expect(h.connect(seller).unlock(WRONG_HASH))
        .to.be.revertedWithCustomError(h, "WrongCodeHash");
    });

    it("reverts if non-seller calls unlock with correct hash — NotSeller", async function () {
      const { h, buyer } = await loadFixture(fundedEth);
      await expect(h.connect(buyer).unlock(VALID_HASH)).to.be.revertedWithCustomError(h, "NotSeller");
    });

    it("reverts if called after expiration — HandOffAlreadyExpired", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      await time.increase(EXPIRY_WINDOW + 1n);
      await expect(h.connect(seller).unlock(VALID_HASH))
        .to.be.revertedWithCustomError(h, "HandOffAlreadyExpired");
    });

    it("double-unlock rejected — WrongState", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      await h.connect(seller).unlock(VALID_HASH);
      await expect(h.connect(seller).unlock(VALID_HASH)).to.be.revertedWithCustomError(h, "WrongState");
    });

    it("unlock on unfunded escrow rejected — WrongState", async function () {
      const { h, seller } = await loadFixture(baseFixture);
      await expect(h.connect(seller).unlock(VALID_HASH)).to.be.revertedWithCustomError(h, "WrongState");
    });

    it("payout routed to sellerPayoutAddress when different from seller", async function () {
      const { h, seller, other } = await loadFixture(baseFixture);
      const exp = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await h.connect(seller).edit(ONE_ETH, ethers.ZeroAddress, other.address, exp);
      const [, , , , buyer5] = await ethers.getSigners();
      await h.connect(buyer5).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) });
      const before = await ethers.provider.getBalance(other.address);
      await h.connect(seller).unlock(VALID_HASH);
      const after = await ethers.provider.getBalance(other.address);
      expect(after - before).to.equal(ONE_ETH);
    });

    it("SubnameMintFailed emitted — COMPLETED still reached when registrar reverts", async function () {
      const [deployer, seller, buyer] = await ethers.getSigners();
      const bad = await ethers.deployContract("RevertingENSResolver");
      const rep = (await ethers.deployContract("HandOffReputation", [deployer.address])) as HandOffReputation;
      const h   = (await ethers.deployContract("HandOff", [
        seller.address, ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW,
        99n, await rep.getAddress(), await bad.getAddress(), "",
        ethers.ZeroAddress, // ALLOWED_ROUTER
        buyer.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])) as HandOff;
      // HandOff self-registers with rep in its constructor — no manual call needed.
      await h.connect(buyer).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) });
      await expect(h.connect(seller).unlock(VALID_HASH))
        .to.emit(h, "HandOffCompleted")
        .and.to.emit(h, "SubnameMintFailed");
      expect(await h.getState()).to.equal(2);
    });

    it("unlock() drains full contract balance — no ETH left behind", async function () {
      // SECURITY FIX C-2: unlock now transfers _currentBalance() not stored `amount`
      const { h, seller } = await loadFixture(fundedEth);
      await h.connect(seller).unlock(VALID_HASH);
      expect(await ethers.provider.getBalance(await h.getAddress())).to.equal(0n);
    });
  });

  // ── unlock() ERC-20 ─────────────────────────────────────────────────────────
  describe("unlock() — ERC-20", function () {
    it("happy path: COMPLETED, tokens split between seller and fee recipient", async function () {
      const { h, token, seller, feeRecipient } = await loadFixture(fundedToken);
      const before = await token.balanceOf(seller.address);
      const feeBefore = await token.balanceOf(feeRecipient.address);
      await h.connect(seller).unlock(VALID_HASH);
      expect(await token.balanceOf(seller.address) - before).to.equal(ONE_ETH);
      expect(await token.balanceOf(feeRecipient.address) - feeBefore).to.equal(feeFor(ONE_ETH));
      expect(await h.getState()).to.equal(2);
    });
  });

  // ── refund() ETH ────────────────────────────────────────────────────────────
  describe("refund() — ETH (UC-17)", function () {
    it("happy path: EXPIRED, ETH returned to buyer", async function () {
      const { h, buyer } = await loadFixture(fundedEth);
      await time.increase(EXPIRY_WINDOW + 1n);
      const before  = await ethers.provider.getBalance(buyer.address);
      const tx      = await h.connect(buyer).refund();
      const receipt = await tx.wait();
      const gas     = receipt!.gasUsed * receipt!.gasPrice;
      expect(await h.getState()).to.equal(3);
      const after = await ethers.provider.getBalance(buyer.address);
      expect(after).to.be.closeTo(before + requiredFunding(ONE_ETH) - gas, ethers.parseEther("0.001"));
    });

    it("HandOffExpired event with escrow, buyer, amount", async function () {
      const { h, buyer } = await loadFixture(fundedEth);
      await time.increase(EXPIRY_WINDOW + 1n);
      await expect(h.connect(buyer).refund())
        .to.emit(h, "HandOffExpired")
        .withArgs(await h.getAddress(), buyer.address, requiredFunding(ONE_ETH));
    });

    it("reverts before expiration — DealExpired", async function () {
      const { h, buyer } = await loadFixture(fundedEth);
      await expect(h.connect(buyer).refund()).to.be.revertedWithCustomError(h, "NotYetExpired");
    });

    it("reverts if non-buyer calls refund — NotBuyer", async function () {
      const { h, other } = await loadFixture(fundedEth);
      await time.increase(EXPIRY_WINDOW + 1n);
      await expect(h.connect(other).refund()).to.be.revertedWithCustomError(h, "NotBuyer");
    });

    it("reverts if seller calls refund — NotBuyer", async function () {
      const { h, seller } = await loadFixture(fundedEth);
      await time.increase(EXPIRY_WINDOW + 1n);
      await expect(h.connect(seller).refund()).to.be.revertedWithCustomError(h, "NotBuyer");
    });
  });

  // ── refund() ERC-20 ─────────────────────────────────────────────────────────
  describe("refund() — ERC-20 (UC-17)", function () {
    it("tokens returned to buyer after expiry", async function () {
      const { h, token, buyer } = await loadFixture(fundedToken);
      await time.increase(EXPIRY_WINDOW + 1n);
      const before = await token.balanceOf(buyer.address);
      await h.connect(buyer).refund();
      expect(await token.balanceOf(buyer.address) - before).to.equal(requiredFunding(ONE_ETH));
      expect(await h.getState()).to.equal(3);
    });

    it("second refund rejected (double-refund) — WrongState", async function () {
      const { h, buyer } = await loadFixture(fundedToken);
      await time.increase(EXPIRY_WINDOW + 1n);
      await h.connect(buyer).refund();
      await expect(h.connect(buyer).refund()).to.be.revertedWithCustomError(h, "WrongState");
    });
  });

  // ── ReentrancyGuard ─────────────────────────────────────────────────────────
  describe("ReentrancyGuard", function () {
    it("double-refund via state machine proves guard is active", async function () {
      const [d, sel, buy, , feeRecipient] = await ethers.getSigners();
      const rep = await ethers.deployContract("HandOffReputation", [d.address]);
      // Updated: SHORT_WINDOW (300s) is the minimum valid window — was 5n which is too short
      const h   = (await ethers.deployContract("HandOff", [
        sel.address, ethers.ZeroAddress, ONE_ETH, SHORT_WINDOW,
        3n, await rep.getAddress(), ethers.ZeroAddress, "",
        ethers.ZeroAddress, // ALLOWED_ROUTER
        feeRecipient.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])) as HandOff;
      // HandOff self-registers with rep in its constructor — no manual call needed.
      await h.connect(buy).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) });
      // Increase past the 300s expiry
      await time.increase(SHORT_WINDOW + 1n);
      await h.connect(buy).refund();
      await expect(h.connect(buy).refund()).to.be.revertedWithCustomError(h, "WrongState");
    });

    it("reentrant unlock via malicious seller contract is blocked — funds transferred exactly once", async function () {
      const [dep, , buy, , feeRecipient] = await ethers.getSigners();
      const mal = (await ethers.deployContract("MockReentrantUnlocker")) as MockReentrantUnlocker;
      const rep = await ethers.deployContract("HandOffReputation", [dep.address]);
      const h   = (await ethers.deployContract("HandOff", [
        await mal.getAddress(), ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW,
        7n, await rep.getAddress(), ethers.ZeroAddress, "",
        ethers.ZeroAddress, // ALLOWED_ROUTER
        feeRecipient.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])) as HandOff;
      // HandOff self-registers with rep in its constructor — no manual call needed.
      await mal.setTarget(await h.getAddress(), VALID_HASH);
      await h.connect(buy).fund(VALID_HASH, "", { value: requiredFunding(ONE_ETH) });
      await mal.doUnlock();
      expect(await h.getState()).to.equal(2);
      expect(await ethers.provider.getBalance(await h.getAddress())).to.equal(0n);
    });
  });

  // ── Reputation integration ───────────────────────────────────────────────────
  describe("Reputation integration", function () {
    it("unlock() calls recordCompletion and reputation is updated", async function () {
      const { h, rep, seller, buyer } = await loadFixture(fundedEth);
      await h.connect(seller).unlock(VALID_HASH);
      const s = await rep.getReputation(seller.address);
      const b = await rep.getReputation(buyer.address);
      expect(s.sellerDealCount).to.equal(1n);
      expect(s.sellerTotalVolume).to.equal(ONE_ETH);
      expect(b.buyerDealCount).to.equal(1n);
    });

    it("constructor reverts with ZeroReputationRegistry when REPUTATION_REGISTRY is zero", async function () {
      const [, seller, , , feeRecipient] = await ethers.getSigners();
      await expect(ethers.deployContract("HandOff", [
        seller.address, ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW,
        8n, ethers.ZeroAddress, ethers.ZeroAddress, "",
        ethers.ZeroAddress, // ALLOWED_ROUTER
        feeRecipient.address,
        FEE_BPS,
        ethers.ZeroAddress, // _sellerPayoutAddress
      ])).to.be.revertedWithCustomError({ interface: (await ethers.getContractFactory("HandOff")).interface }, "ZeroReputationRegistry");
    });
  });
});
