import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HandOffReputation } from "../typechain-types";

const ONE_ETH = ethers.parseEther("1.0");
const TWO_ETH = ethers.parseEther("2.0");

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [deployer, escrow1, escrow2, seller, buyer, reviewer, other] =
    await ethers.getSigners();
  const rep = (await ethers.deployContract("HandOffReputation", [
    deployer.address,
  ])) as HandOffReputation;
  return { rep, deployer, escrow1, escrow2, seller, buyer, reviewer, other };
}

async function registeredFixture() {
  const ctx = await deployFixture();
  await ctx.rep.connect(ctx.deployer).registerHandOff(ctx.escrow1.address);
  return ctx;
}

async function completedFixture() {
  const ctx = await registeredFixture();
  await ctx.rep
    .connect(ctx.escrow1)
    .recordCompletion(ctx.seller.address, ctx.buyer.address, ONE_ETH);
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("HandOffReputation", function () {

  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("constructor", function () {
    it("sets AUTHORIZED_DEPLOYER correctly", async function () {
      const { rep, deployer } = await loadFixture(deployFixture);
      expect(await rep.AUTHORIZED_DEPLOYER()).to.equal(deployer.address);
    });

    it("totalDeals starts at 0", async function () {
      const { rep } = await loadFixture(deployFixture);
      expect(await rep.totalDeals()).to.equal(0n);
    });

    it("reverts with zero deployer address — InvalidDeployer", async function () {
      const factory = await ethers.getContractFactory("HandOffReputation");
      await expect(
        factory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "InvalidDeployer");
    });
  });

  // ── registerHandOff ─────────────────────────────────────────────────────────
  describe("registerHandOff()", function () {
    it("deployer registers escrow, returns deal ID 1, emits HandOffRegistered", async function () {
      const { rep, deployer, escrow1 } = await loadFixture(deployFixture);
      await expect(rep.connect(deployer).registerHandOff(escrow1.address))
        .to.emit(rep, "HandOffRegistered")
        .withArgs(escrow1.address, 1n);
      expect(await rep.registeredEscrows(escrow1.address)).to.be.true;
      expect(await rep.totalDeals()).to.equal(1n);
      expect(await rep.getEscrowFromDealId(1n)).to.equal(escrow1.address);
    });

    it("deal IDs increment sequentially across multiple registrations", async function () {
      const { rep, deployer, escrow1, escrow2 } = await loadFixture(deployFixture);
      await rep.connect(deployer).registerHandOff(escrow1.address);
      await expect(rep.connect(deployer).registerHandOff(escrow2.address))
        .to.emit(rep, "HandOffRegistered").withArgs(escrow2.address, 2n);
    });

    it("deployer can register multiple HandOff contracts", async function () {
      const { rep, deployer, escrow1, escrow2 } = await loadFixture(deployFixture);
      await rep.connect(deployer).registerHandOff(escrow1.address);
      await rep.connect(deployer).registerHandOff(escrow2.address);
      expect(await rep.registeredEscrows(escrow1.address)).to.be.true;
      expect(await rep.registeredEscrows(escrow2.address)).to.be.true;
    });

    it("reverts if non-deployer tries to register — NotAuthorizedDeployer", async function () {
      const { rep, other, escrow1 } = await loadFixture(deployFixture);
      await expect(rep.connect(other).registerHandOff(escrow1.address))
        .to.be.revertedWithCustomError(rep, "NotAuthorizedDeployer");
    });

    it("reverts on duplicate registration — AlreadyRegistered", async function () {
      const { rep, deployer, escrow1 } = await loadFixture(deployFixture);
      await rep.connect(deployer).registerHandOff(escrow1.address);
      await expect(rep.connect(deployer).registerHandOff(escrow1.address))
        .to.be.revertedWithCustomError(rep, "AlreadyRegistered");
    });

    it("reverts with zero escrow address — InvalidEscrowAddress", async function () {
      const { rep, deployer } = await loadFixture(deployFixture);
      await expect(rep.connect(deployer).registerHandOff(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(rep, "InvalidEscrowAddress");
    });
  });

  // ── revokeHandOff ───────────────────────────────────────────────────────────
  describe("revokeHandOff()", function () {
    it("deployer can revoke a registered escrow", async function () {
      const { rep, deployer, escrow1 } = await loadFixture(registeredFixture);
      await rep.connect(deployer).revokeHandOff(escrow1.address);
      expect(await rep.registeredEscrows(escrow1.address)).to.be.false;
    });

    it("revokeHandOff emits HandOffRevoked event", async function () {
      // QUALITY: revocation now emits HandOffRevoked for off-chain indexers
      const { rep, deployer, escrow1 } = await loadFixture(registeredFixture);
      await expect(rep.connect(deployer).revokeHandOff(escrow1.address))
        .to.emit(rep, "HandOffRevoked").withArgs(escrow1.address);
    });

    it("revoked escrow can no longer call recordCompletion — NotRegisteredEscrow", async function () {
      const { rep, deployer, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(deployer).revokeHandOff(escrow1.address);
      await expect(
        rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH)
      ).to.be.revertedWithCustomError(rep, "NotRegisteredEscrow");
    });
  });

  // ── recordCompletion ─────────────────────────────────────────────────────────
  describe("recordCompletion()", function () {
    it("increments seller deal count", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      const r = await rep.getReputation(seller.address);
      expect(r.sellerDealCount).to.equal(1n);
    });

    it("increments seller total volume correctly", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, TWO_ETH);
      const r = await rep.getReputation(seller.address);
      expect(r.sellerTotalVolume).to.equal(ONE_ETH + TWO_ETH);
    });

    it("increments buyer deal count", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      const r = await rep.getReputation(buyer.address);
      expect(r.buyerDealCount).to.equal(1n);
    });

    it("multiple deals accumulate correctly — all counters sum", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      for (let i = 0; i < 3; i++) {
        await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      }
      const rs = await rep.getReputation(seller.address);
      const rb = await rep.getReputation(buyer.address);
      expect(rs.sellerDealCount).to.equal(3n);
      expect(rs.sellerTotalVolume).to.equal(ONE_ETH * 3n);
      expect(rb.buyerDealCount).to.equal(3n);
    });

    it("adds escrow to seller history", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      const hist = await rep.getSellerHistory(seller.address);
      expect(hist).to.include(escrow1.address);
    });

    it("adds escrow to buyer history", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      const hist = await rep.getBuyerHistory(buyer.address);
      expect(hist).to.include(escrow1.address);
    });

    it("emits HandOffRecorded event with correct indexed args", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await expect(
        rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH)
      ).to.emit(rep, "HandOffRecorded");
      const filter = rep.filters.HandOffRecorded(seller.address, buyer.address, escrow1.address);
      const events = await rep.queryFilter(filter);
      expect(events.length).to.equal(1);
      expect(events[0].args.amount).to.equal(ONE_ETH);
    });

    it("reverts if unregistered address calls recordCompletion — NotRegisteredEscrow", async function () {
      const { rep, other, seller, buyer } = await loadFixture(deployFixture);
      await expect(
        rep.connect(other).recordCompletion(seller.address, buyer.address, ONE_ETH)
      ).to.be.revertedWithCustomError(rep, "NotRegisteredEscrow");
    });

    it("reverts with zero seller address — InvalidSeller", async function () {
      const { rep, escrow1, buyer } = await loadFixture(registeredFixture);
      await expect(
        rep.connect(escrow1).recordCompletion(ethers.ZeroAddress, buyer.address, ONE_ETH)
      ).to.be.revertedWithCustomError(rep, "InvalidSeller");
    });

    it("reverts with zero buyer address — InvalidBuyer", async function () {
      const { rep, escrow1, seller } = await loadFixture(registeredFixture);
      await expect(
        rep.connect(escrow1).recordCompletion(seller.address, ethers.ZeroAddress, ONE_ETH)
      ).to.be.revertedWithCustomError(rep, "InvalidBuyer");
    });
  });

  // ── recordReview ─────────────────────────────────────────────────────────────
  describe("recordReview()", function () {
    it("positive seller review increments sellerPositiveReviews and sellerTotalReviews", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(completedFixture);
      await rep.connect(escrow1).recordReview(
        buyer.address, seller.address, escrow1.address, true, true
      );
      const r = await rep.getReputation(seller.address);
      expect(r.sellerTotalReviews).to.equal(1n);
      expect(r.sellerPositiveReviews).to.equal(1n);
    });

    it("negative seller review increments total but NOT positive count", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(completedFixture);
      await rep.connect(escrow1).recordReview(
        buyer.address, seller.address, escrow1.address, false, true
      );
      const r = await rep.getReputation(seller.address);
      expect(r.sellerTotalReviews).to.equal(1n);
      expect(r.sellerPositiveReviews).to.equal(0n);
    });

    it("positive buyer review increments buyerPositiveReviews and buyerTotalReviews", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(completedFixture);
      await rep.connect(escrow1).recordReview(
        seller.address, buyer.address, escrow1.address, true, false
      );
      const r = await rep.getReputation(buyer.address);
      expect(r.buyerTotalReviews).to.equal(1n);
      expect(r.buyerPositiveReviews).to.equal(1n);
    });

    it("negative buyer review increments total but NOT positive count", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(completedFixture);
      await rep.connect(escrow1).recordReview(
        seller.address, buyer.address, escrow1.address, false, false
      );
      const r = await rep.getReputation(buyer.address);
      expect(r.buyerTotalReviews).to.equal(1n);
      expect(r.buyerPositiveReviews).to.equal(0n);
    });

    it("ReviewSubmitted event emitted with correct args", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(completedFixture);
      await expect(
        rep.connect(escrow1).recordReview(
          buyer.address, seller.address, escrow1.address, true, true
        )
      ).to.emit(rep, "ReviewSubmitted")
        .withArgs(buyer.address, seller.address, escrow1.address, true, true);
    });

    it("second review same role same escrow rejected — ReviewAlreadySubmitted", async function () {
      // SECURITY FIX M-2: idempotency guard prevents reputation inflation
      const { rep, escrow1, seller, buyer } = await loadFixture(completedFixture);
      await rep.connect(escrow1).recordReview(
        buyer.address, seller.address, escrow1.address, true, true
      );
      await expect(
        rep.connect(escrow1).recordReview(
          buyer.address, seller.address, escrow1.address, false, true
        )
      ).to.be.revertedWithCustomError(rep, "ReviewAlreadySubmitted");
    });

    it("different role review after first succeeds (seller reviews buyer)", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(completedFixture);
      await rep.connect(escrow1).recordReview(
        buyer.address, seller.address, escrow1.address, true, true
      );
      await expect(
        rep.connect(escrow1).recordReview(
          seller.address, buyer.address, escrow1.address, true, false
        )
      ).to.emit(rep, "ReviewSubmitted");
    });

    it("reverts if unregistered address calls recordReview — NotRegisteredEscrow", async function () {
      const { rep, other, seller, buyer, escrow1 } = await loadFixture(completedFixture);
      await expect(
        rep.connect(other).recordReview(
          buyer.address, seller.address, escrow1.address, true, true
        )
      ).to.be.revertedWithCustomError(rep, "NotRegisteredEscrow");
    });

    it("reverts with unknown escrow in _escrow param — UnknownEscrow", async function () {
      const { rep, escrow1, escrow2, seller, buyer } = await loadFixture(completedFixture);
      await expect(
        rep.connect(escrow1).recordReview(
          buyer.address, seller.address, escrow2.address, true, true
        )
      ).to.be.revertedWithCustomError(rep, "UnknownEscrow");
    });

    it("reverts if reviewer and reviewed are the same address — CannotReviewSelf", async function () {
      const { rep, escrow1, seller } = await loadFixture(completedFixture);
      await expect(
        rep.connect(escrow1).recordReview(
          seller.address, seller.address, escrow1.address, true, true
        )
      ).to.be.revertedWithCustomError(rep, "CannotReviewSelf");
    });

    it("reverts if reviewer is zero address — InvalidAddresses", async function () {
      const { rep, escrow1, seller } = await loadFixture(completedFixture);
      await expect(
        rep.connect(escrow1).recordReview(
          ethers.ZeroAddress, seller.address, escrow1.address, true, true
        )
      ).to.be.revertedWithCustomError(rep, "InvalidAddresses");
    });
  });

  // ── getReputation (UC-14) ───────────────────────────────────────────────────
  describe("getReputation() — UC-14", function () {
    it("returns all-zero struct for wallet with no history (does not revert)", async function () {
      const { rep, other } = await loadFixture(deployFixture);
      const r = await rep.getReputation(other.address);
      expect(r.sellerDealCount).to.equal(0n);
      expect(r.sellerTotalVolume).to.equal(0n);
      expect(r.sellerPositiveReviews).to.equal(0n);
      expect(r.sellerTotalReviews).to.equal(0n);
      expect(r.buyerDealCount).to.equal(0n);
      expect(r.buyerPositiveReviews).to.equal(0n);
      expect(r.buyerTotalReviews).to.equal(0n);
    });

    it("accumulates correctly after multiple deals and one review per role", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, TWO_ETH);
      await rep.connect(escrow1).recordReview(buyer.address, seller.address, escrow1.address, true, true);
      // Second review same role is now rejected by ReviewAlreadySubmitted — only 1 review
      const r = await rep.getReputation(seller.address);
      expect(r.sellerDealCount).to.equal(2n);
      expect(r.sellerTotalVolume).to.equal(ONE_ETH + TWO_ETH);
      expect(r.sellerTotalReviews).to.equal(1n);
      expect(r.sellerPositiveReviews).to.equal(1n);
    });
  });

  // ── History queries (UC-13) ─────────────────────────────────────────────────
  describe("getSellerHistory() / getBuyerHistory() — UC-13", function () {
    it("empty arrays for wallets with no history", async function () {
      const { rep, other } = await loadFixture(deployFixture);
      expect(await rep.getSellerHistory(other.address)).to.deep.equal([]);
      expect(await rep.getBuyerHistory(other.address)).to.deep.equal([]);
    });

    it("history length matches deal count", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      expect(await rep.getSellerHistoryLength(seller.address)).to.equal(2n);
      expect(await rep.getBuyerHistoryLength(buyer.address)).to.equal(2n);
    });

    it("all escrow addresses in history belong to registered escrows", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      const hist = await rep.getSellerHistory(seller.address);
      for (const addr of hist) {
        expect(await rep.registeredEscrows(addr)).to.be.true;
      }
    });

    it("getSellerHistoryPage returns correct slice", async function () {
      // GAS OPT M-1: paginated reads added to prevent gas DoS on high-volume wallets
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      for (let i = 0; i < 5; i++) {
        await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      }
      const page = await rep.getSellerHistoryPage(seller.address, 1, 3);
      expect(page.length).to.equal(3);
    });

    it("getSellerHistoryPage with offset beyond length returns empty array", async function () {
      const { rep, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await rep.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      const page = await rep.getSellerHistoryPage(seller.address, 100, 10);
      expect(page.length).to.equal(0);
    });
  });
});
