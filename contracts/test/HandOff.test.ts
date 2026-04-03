import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HandOff, HandOffReputation, MockERC20, MockReentrantBuyer } from "../typechain-types";

const ONE_ETH = ethers.parseEther("1.0");
const EXPIRY_WINDOW = 86_400; // 24h in seconds

// Fake code hash — keccak256("a3x9")
const VALID_CODE = "a3x9";
const VALID_HASH = ethers.keccak256(ethers.toUtf8Bytes(VALID_CODE));
const WRONG_HASH = ethers.keccak256(ethers.toUtf8Bytes("xxxx"));

describe("HandOff", function () {

  async function deployEthEscrow() {
    const [deployer, seller, buyer, other] = await ethers.getSigners();

    const reputation = await ethers.deployContract("HandOffReputation", [deployer.address]);
    await reputation.waitForDeployment();

    const handoff = await ethers.deployContract("HandOff", [
      seller.address,
      ethers.ZeroAddress,    // ETH payout
      ONE_ETH,
      EXPIRY_WINDOW,
      1n,                    // dealId
      await reputation.getAddress(),
      ethers.ZeroAddress,    // no subname registrar (cross-chain)
      "seller.eth",
    ]);
    await handoff.waitForDeployment();

    // Register escrow so reputation.recordCompletion is accepted
    await reputation.registerHandOff(await handoff.getAddress());

    return { handoff, reputation, deployer, seller, buyer, other };
  }

  async function deployERC20Escrow() {
    const [deployer, seller, buyer] = await ethers.getSigners();

    const token = await ethers.deployContract("MockERC20", ["HandToken", "HDT", 18]);
    await token.waitForDeployment();
    await token.mint(buyer.address, ONE_ETH * 10n);

    const reputation = await ethers.deployContract("HandOffReputation", [deployer.address]);
    const handoff = await ethers.deployContract("HandOff", [
      seller.address,
      await token.getAddress(),
      ONE_ETH,
      EXPIRY_WINDOW,
      2n,
      await reputation.getAddress(),
      ethers.ZeroAddress,
      "",
    ]);
    await reputation.registerHandOff(await handoff.getAddress());

    return { handoff, reputation, token, deployer, seller, buyer };
  }

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets initial state to CREATED", async function () {
      const { handoff } = await loadFixture(deployEthEscrow);
      expect(await handoff.getState()).to.equal(0); // State.CREATED
    });

    it("stores correct terms", async function () {
      const { handoff, seller } = await loadFixture(deployEthEscrow);
      const [amt, payoutToken, sellerPayout, , createdAt] = await handoff.getTerms();
      expect(amt).to.equal(ONE_ETH);
      expect(payoutToken).to.equal(ethers.ZeroAddress);
      expect(sellerPayout).to.equal(seller.address);
      expect(createdAt).to.be.gt(0n);
    });

    it("returns correct participants", async function () {
      const { handoff, seller } = await loadFixture(deployEthEscrow);
      const [s, b] = await handoff.getParticipants();
      expect(s).to.equal(seller.address);
      expect(b).to.equal(ethers.ZeroAddress);
    });

    it("isExpired() returns false immediately after deploy", async function () {
      const { handoff } = await loadFixture(deployEthEscrow);
      expect(await handoff.isExpired()).to.be.false;
    });
  });

  // ── Edit ────────────────────────────────────────────────────────────────────

  describe("edit()", function () {
    it("seller can edit terms in CREATED state", async function () {
      const { handoff, seller } = await loadFixture(deployEthEscrow);
      const newExpiry = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await expect(
        handoff.connect(seller).edit(ONE_ETH * 2n, ethers.ZeroAddress, seller.address, newExpiry)
      ).to.emit(handoff, "HandOffEdited");
      const [amt] = await handoff.getTerms();
      expect(amt).to.equal(ONE_ETH * 2n);
    });

    it("reverts if non-seller tries to edit", async function () {
      const { handoff, buyer } = await loadFixture(deployEthEscrow);
      const newExpiry = BigInt(Math.floor(Date.now() / 1000) + 172_800);
      await expect(
        handoff.connect(buyer).edit(ONE_ETH, ethers.ZeroAddress, buyer.address, newExpiry)
      ).to.be.revertedWith("Only seller");
    });
  });

  // ── Cancel ──────────────────────────────────────────────────────────────────

  describe("cancel()", function () {
    it("seller cancels in CREATED state", async function () {
      const { handoff, seller } = await loadFixture(deployEthEscrow);
      await expect(handoff.connect(seller).cancel())
        .to.emit(handoff, "HandOffCanceled")
        .withArgs(seller.address);
      expect(await handoff.getState()).to.equal(4); // CANCELED
    });

    it("reverts if non-seller tries to cancel", async function () {
      const { handoff, buyer } = await loadFixture(deployEthEscrow);
      await expect(handoff.connect(buyer).cancel()).to.be.revertedWith("Only seller");
    });
  });

  // ── fund() — ETH ────────────────────────────────────────────────────────────

  describe("fund() — ETH escrow", function () {
    it("buyer funds with correct ETH, state → FUNDED, code hash stored", async function () {
      const { handoff, buyer } = await loadFixture(deployEthEscrow);
      await expect(
        handoff.connect(buyer).fund(VALID_HASH, "buyer.eth", { value: ONE_ETH })
      )
        .to.emit(handoff, "HandOffFunded")
        .withArgs(buyer.address, ONE_ETH, VALID_HASH);

      expect(await handoff.getState()).to.equal(1); // FUNDED
      expect(await handoff.buyer()).to.equal(buyer.address);
      expect(await handoff.codeHash()).to.equal(VALID_HASH);
    });

    it("reverts if wrong ETH amount sent", async function () {
      const { handoff, buyer } = await loadFixture(deployEthEscrow);
      await expect(
        handoff.connect(buyer).fund(VALID_HASH, "", { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect ETH amount");
    });

    it("reverts if seller tries to fund their own deal", async function () {
      const { handoff, seller } = await loadFixture(deployEthEscrow);
      await expect(
        handoff.connect(seller).fund(VALID_HASH, "", { value: ONE_ETH })
      ).to.be.revertedWith("Seller cannot be buyer");
    });

    it("reverts if code hash is zero", async function () {
      const { handoff, buyer } = await loadFixture(deployEthEscrow);
      await expect(
        handoff.connect(buyer).fund(ethers.ZeroHash, "", { value: ONE_ETH })
      ).to.be.revertedWith("Invalid code hash");
    });

    it("reverts if already FUNDED (double fund attempt)", async function () {
      const { handoff, buyer, other } = await loadFixture(deployEthEscrow);
      await handoff.connect(buyer).fund(VALID_HASH, "", { value: ONE_ETH });
      await expect(
        handoff.connect(other).fund(VALID_HASH, "", { value: ONE_ETH })
      ).to.be.revertedWith("Invalid state");
    });
  });

  // ── fund() — ERC-20 ─────────────────────────────────────────────────────────

  describe("fund() — ERC-20 escrow", function () {
    it("buyer funds with ERC-20 token, state → FUNDED", async function () {
      const { handoff, token, buyer } = await loadFixture(deployERC20Escrow);
      await token.connect(buyer).approve(await handoff.getAddress(), ONE_ETH);
      await expect(handoff.connect(buyer).fund(VALID_HASH, ""))
        .to.emit(handoff, "HandOffFunded");
      expect(await handoff.getState()).to.equal(1);
    });

    it("reverts if ERC-20 allowance insufficient", async function () {
      const { handoff, buyer } = await loadFixture(deployERC20Escrow);
      await expect(handoff.connect(buyer).fund(VALID_HASH, ""))
        .to.be.reverted;
    });
  });

  // ── unlock() ────────────────────────────────────────────────────────────────

  describe("unlock()", function () {
    async function fundedFixture() {
      const ctx = await deployEthEscrow();
      await ctx.handoff.connect(ctx.buyer).fund(VALID_HASH, "buyer.eth", { value: ONE_ETH });
      return ctx;
    }

    it("seller unlocks with correct code → COMPLETED, ETH sent to seller", async function () {
      const { handoff, seller } = await loadFixture(fundedFixture);
      const balBefore = await ethers.provider.getBalance(seller.address);

      const tx = await handoff.connect(seller).unlock(VALID_HASH);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      expect(await handoff.getState()).to.equal(2); // COMPLETED
      const balAfter = await ethers.provider.getBalance(seller.address);
      expect(balAfter).to.be.closeTo(balBefore + ONE_ETH - gasUsed, ethers.parseEther("0.001"));
    });

    it("emits HandOffCompleted", async function () {
      const { handoff, seller } = await loadFixture(fundedFixture);
      await expect(handoff.connect(seller).unlock(VALID_HASH))
        .to.emit(handoff, "HandOffCompleted");
    });

    it("emits SubnameMintRequested", async function () {
      const { handoff, seller } = await loadFixture(fundedFixture);
      await expect(handoff.connect(seller).unlock(VALID_HASH))
        .to.emit(handoff, "SubnameMintRequested");
    });

    it("reverts with wrong code hash", async function () {
      const { handoff, seller } = await loadFixture(fundedFixture);
      await expect(handoff.connect(seller).unlock(WRONG_HASH))
        .to.be.revertedWith("Incorrect code hash");
    });

    it("reverts if non-seller calls unlock", async function () {
      const { handoff, buyer } = await loadFixture(fundedFixture);
      await expect(handoff.connect(buyer).unlock(VALID_HASH))
        .to.be.revertedWith("Only seller");
    });

    it("reverts if called after expiration (UC-17)", async function () {
      const { handoff, seller } = await loadFixture(fundedFixture);
      await time.increase(EXPIRY_WINDOW + 1);
      await expect(handoff.connect(seller).unlock(VALID_HASH))
        .to.be.revertedWith("HandOff expired");
    });

    it("revert in unlock() does NOT block if subname registrar reverts", async function () {
      // Deploy registrar that always reverts
      const [deployer, seller, buyer] = await ethers.getSigners();
      const badRegistrar = await ethers.deployContract("RevertingENSResolver");
      // Deploy reputation
      const reputation = await ethers.deployContract("HandOffReputation", [deployer.address]);
      // Deploy handoff pointing at bad registrar address
      const handoff = await ethers.deployContract("HandOff", [
        seller.address,
        ethers.ZeroAddress,
        ONE_ETH,
        EXPIRY_WINDOW,
        99n,
        await reputation.getAddress(),
        await badRegistrar.getAddress(),
        "",
      ]) as HandOff;
      await reputation.registerHandOff(await handoff.getAddress());
      await handoff.connect(buyer).fund(VALID_HASH, "", { value: ONE_ETH });

      // Unlock must succeed even though subname registrar reverts
      await expect(handoff.connect(seller).unlock(VALID_HASH))
        .to.emit(handoff, "HandOffCompleted")
        .to.emit(handoff, "SubnameMintFailed");

      expect(await handoff.getState()).to.equal(2); // COMPLETED
    });
  });

  // ── refund() — UC-17 ────────────────────────────────────────────────────────

  describe("refund() — UC-17", function () {
    async function fundedFixture() {
      const ctx = await deployEthEscrow();
      await ctx.handoff.connect(ctx.buyer).fund(VALID_HASH, "", { value: ONE_ETH });
      return ctx;
    }

    it("buyer claims refund after expiry → EXPIRED, ETH returned", async function () {
      const { handoff, buyer } = await loadFixture(fundedFixture);
      await time.increase(EXPIRY_WINDOW + 1);

      const balBefore = await ethers.provider.getBalance(buyer.address);
      const tx = await handoff.connect(buyer).refund();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(buyer.address);

      expect(await handoff.getState()).to.equal(3); // EXPIRED
      expect(balAfter).to.be.closeTo(balBefore + ONE_ETH - gasUsed, ethers.parseEther("0.001"));
    });

    it("emits HandOffExpired", async function () {
      const { handoff, buyer } = await loadFixture(fundedFixture);
      await time.increase(EXPIRY_WINDOW + 1);
      await expect(handoff.connect(buyer).refund())
        .to.emit(handoff, "HandOffExpired");
    });

    it("reverts if called before expiry", async function () {
      const { handoff, buyer } = await loadFixture(fundedFixture);
      await expect(handoff.connect(buyer).refund())
        .to.be.revertedWith("Not yet expired");
    });

    it("reverts if non-buyer calls refund", async function () {
      const { handoff, other } = await loadFixture(fundedFixture);
      await time.increase(EXPIRY_WINDOW + 1);
      await expect(handoff.connect(other).refund())
        .to.be.revertedWith("Only buyer");
    });

    it("ERC-20 refund returns tokens to buyer (UC-17 — both token types)", async function () {
      const { handoff, token, buyer } = await loadFixture(deployERC20Escrow);
      await token.connect(buyer).approve(await handoff.getAddress(), ONE_ETH);
      await handoff.connect(buyer).fund(VALID_HASH, "");
      await time.increase(EXPIRY_WINDOW + 1);

      const balBefore = await token.balanceOf(buyer.address);
      await handoff.connect(buyer).refund();
      const balAfter = await token.balanceOf(buyer.address);

      expect(balAfter - balBefore).to.equal(ONE_ETH);
      expect(await handoff.getState()).to.equal(3);
    });

    it("reentrancy guard prevents double refund", async function () {
      // Deploy fresh set of contracts with consistent deployer
      const [dep, sel, buy] = await ethers.getSigners();
      const rep = await ethers.deployContract("HandOffReputation", [dep.address]);
      const h = await ethers.deployContract("HandOff", [
        sel.address,
        ethers.ZeroAddress,
        ONE_ETH,
        10n, // 10 second window
        3n,
        await rep.getAddress(),
        ethers.ZeroAddress,
        "",
      ]);
      await rep.connect(dep).registerHandOff(await h.getAddress());
      await h.connect(buy).fund(VALID_HASH, "", { value: ONE_ETH });
      await time.increase(11);

      // First refund must succeed
      await expect(h.connect(buy).refund()).to.emit(h, "HandOffExpired");

      // Second call must fail — state is now EXPIRED, inState(FUNDED) guard fires
      await expect(h.connect(buy).refund()).to.be.revertedWith("Invalid state");
    });
  });

  // ── Reputation integration ───────────────────────────────────────────────────

  describe("Reputation integration", function () {
    it("recordCompletion is called on successful unlock", async function () {
      const { handoff, reputation, seller, buyer } = await loadFixture(deployEthEscrow);
      await handoff.connect(buyer).fund(VALID_HASH, "", { value: ONE_ETH });
      await handoff.connect(seller).unlock(VALID_HASH);

      const rep = await reputation.getReputation(seller.address);
      expect(rep.sellerDealCount).to.equal(1n);
      expect(rep.sellerTotalVolume).to.equal(ONE_ETH);
    });
  });
});
