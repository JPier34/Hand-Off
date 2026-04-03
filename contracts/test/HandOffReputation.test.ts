import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HandOffReputation } from "../typechain-types";

const ONE_ETH = ethers.parseEther("1.0");
const VALID_HASH = ethers.keccak256(ethers.toUtf8Bytes("a3x9"));

describe("HandOffReputation", function () {

  async function deployReputation() {
    const [deployer, escrow1, escrow2, seller, buyer, reviewer, other] =
      await ethers.getSigners();

    const reputation = await ethers.deployContract("HandOffReputation", [
      deployer.address,
    ]) as HandOffReputation;
    await reputation.waitForDeployment();

    return { reputation, deployer, escrow1, escrow2, seller, buyer, reviewer, other };
  }

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets AUTHORIZED_DEPLOYER correctly", async function () {
      const { reputation, deployer } = await loadFixture(deployReputation);
      expect(await reputation.AUTHORIZED_DEPLOYER()).to.equal(deployer.address);
    });

    it("totalDeals starts at 0", async function () {
      const { reputation } = await loadFixture(deployReputation);
      expect(await reputation.totalDeals()).to.equal(0n);
    });
  });

  // ── registerHandOff ─────────────────────────────────────────────────────────

  describe("registerHandOff()", function () {
    it("deployer can register an escrow, returns deal ID", async function () {
      const { reputation, deployer, escrow1 } = await loadFixture(deployReputation);
      await expect(reputation.connect(deployer).registerHandOff(escrow1.address))
        .to.emit(reputation, "HandOffRegistered")
        .withArgs(escrow1.address, 1n);

      expect(await reputation.registeredEscrows(escrow1.address)).to.be.true;
      expect(await reputation.totalDeals()).to.equal(1n);
    });

    it("increments deal ID on each registration", async function () {
      const { reputation, deployer, escrow1, escrow2 } = await loadFixture(deployReputation);
      await reputation.connect(deployer).registerHandOff(escrow1.address);
      await expect(reputation.connect(deployer).registerHandOff(escrow2.address))
        .to.emit(reputation, "HandOffRegistered")
        .withArgs(escrow2.address, 2n);
    });

    it("reverts if non-deployer tries to register", async function () {
      const { reputation, other, escrow1 } = await loadFixture(deployReputation);
      await expect(reputation.connect(other).registerHandOff(escrow1.address))
        .to.be.revertedWith("Not authorized deployer");
    });

    it("reverts on duplicate registration", async function () {
      const { reputation, deployer, escrow1 } = await loadFixture(deployReputation);
      await reputation.connect(deployer).registerHandOff(escrow1.address);
      await expect(reputation.connect(deployer).registerHandOff(escrow1.address))
        .to.be.revertedWith("Already registered");
    });
  });

  // ── recordCompletion ─────────────────────────────────────────────────────────

  describe("recordCompletion()", function () {
    async function registeredFixture() {
      const ctx = await deployReputation();
      await ctx.reputation.connect(ctx.deployer).registerHandOff(ctx.escrow1.address);
      return ctx;
    }

    it("registered escrow can call recordCompletion", async function () {
      const { reputation, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await expect(
        reputation.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH)
      ).to.emit(reputation, "HandOffRecorded");

      // Verify the event was emitted with correct indexed args via filter
      const filter = reputation.filters.HandOffRecorded(seller.address, buyer.address, escrow1.address);
      const events = await reputation.queryFilter(filter);
      expect(events.length).to.equal(1);
      expect(events[0].args.amount).to.equal(ONE_ETH);
    });

    it("increments seller deal count and volume", async function () {
      const { reputation, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await reputation.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);
      await reputation.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH * 2n);

      const rep = await reputation.getReputation(seller.address);
      expect(rep.sellerDealCount).to.equal(2n);
      expect(rep.sellerTotalVolume).to.equal(ONE_ETH * 3n);
    });

    it("increments buyer deal count", async function () {
      const { reputation, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await reputation.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);

      const rep = await reputation.getReputation(buyer.address);
      expect(rep.buyerDealCount).to.equal(1n);
    });

    it("records escrow in seller and buyer history", async function () {
      const { reputation, escrow1, seller, buyer } = await loadFixture(registeredFixture);
      await reputation.connect(escrow1).recordCompletion(seller.address, buyer.address, ONE_ETH);

      const sellerHistory = await reputation.getSellerHistory(seller.address);
      const buyerHistory = await reputation.getBuyerHistory(buyer.address);

      expect(sellerHistory).to.include(escrow1.address);
      expect(buyerHistory).to.include(escrow1.address);
    });

    it("reverts if unregistered escrow calls recordCompletion", async function () {
      const { reputation, other, seller, buyer } = await loadFixture(registeredFixture);
      await expect(
        reputation.connect(other).recordCompletion(seller.address, buyer.address, ONE_ETH)
      ).to.be.revertedWith("Not registered escrow");
    });
  });

  // ── recordReview ─────────────────────────────────────────────────────────────

  describe("recordReview()", function () {
    async function completedFixture() {
      const ctx = await deployReputation();
      await ctx.reputation.connect(ctx.deployer).registerHandOff(ctx.escrow1.address);
      await ctx.reputation
        .connect(ctx.escrow1)
        .recordCompletion(ctx.seller.address, ctx.buyer.address, ONE_ETH);
      return ctx;
    }

    it("records a positive seller review", async function () {
      const { reputation, escrow1, buyer, seller } = await loadFixture(completedFixture);
      await expect(
        reputation
          .connect(escrow1)
          .recordReview(buyer.address, seller.address, escrow1.address, true, true)
      )
        .to.emit(reputation, "ReviewSubmitted")
        .withArgs(buyer.address, seller.address, escrow1.address, true, true);

      const rep = await reputation.getReputation(seller.address);
      expect(rep.sellerTotalReviews).to.equal(1n);
      expect(rep.sellerPositiveReviews).to.equal(1n);
    });

    it("records a negative seller review", async function () {
      const { reputation, escrow1, buyer, seller } = await loadFixture(completedFixture);
      await reputation
        .connect(escrow1)
        .recordReview(buyer.address, seller.address, escrow1.address, false, true);

      const rep = await reputation.getReputation(seller.address);
      expect(rep.sellerTotalReviews).to.equal(1n);
      expect(rep.sellerPositiveReviews).to.equal(0n);
    });

    it("records buyer review", async function () {
      const { reputation, escrow1, buyer, seller } = await loadFixture(completedFixture);
      await reputation
        .connect(escrow1)
        .recordReview(seller.address, buyer.address, escrow1.address, true, false);

      const rep = await reputation.getReputation(buyer.address);
      expect(rep.buyerTotalReviews).to.equal(1n);
      expect(rep.buyerPositiveReviews).to.equal(1n);
    });

    it("reverts if unregistered escrow submits review", async function () {
      const { reputation, other, buyer, seller } = await loadFixture(completedFixture);
      await expect(
        reputation
          .connect(other)
          .recordReview(buyer.address, seller.address, other.address, true, true)
      ).to.be.revertedWith("Not registered escrow");
    });
  });

  // ── getReputation (UC-14) ────────────────────────────────────────────────────

  describe("getReputation() — UC-14", function () {
    it("returns zero struct for wallet with no history", async function () {
      const { reputation, other } = await loadFixture(deployReputation);
      const rep = await reputation.getReputation(other.address);
      expect(rep.sellerDealCount).to.equal(0n);
      expect(rep.sellerTotalVolume).to.equal(0n);
      expect(rep.sellerPositiveReviews).to.equal(0n);
      expect(rep.sellerTotalReviews).to.equal(0n);
      expect(rep.buyerDealCount).to.equal(0n);
    });
  });

  // ── History queries (UC-13) ──────────────────────────────────────────────────

  describe("getSellerHistory() / getBuyerHistory() — UC-13", function () {
    it("returns empty array for address with no deals", async function () {
      const { reputation, other } = await loadFixture(deployReputation);
      expect(await reputation.getSellerHistory(other.address)).to.deep.equal([]);
      expect(await reputation.getBuyerHistory(other.address)).to.deep.equal([]);
    });
  });
});
