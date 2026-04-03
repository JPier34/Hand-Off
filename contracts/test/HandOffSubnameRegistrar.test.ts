import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { HandOffSubnameRegistrar, MockENSRegistry, MockENSResolver } from "../typechain-types";

// namehash("hand-off.eth") — precomputed
// namehash("eth") = keccak256(0x00...00 || keccak256(bytes("eth")))
// namehash("hand-off.eth") = keccak256(namehash("eth") || keccak256(bytes("hand-off")))
const ZERO_NODE = ethers.ZeroHash;
const ETH_LABEL = ethers.keccak256(ethers.toUtf8Bytes("eth"));
const ETH_NODE = ethers.keccak256(ethers.concat([ZERO_NODE, ETH_LABEL]));
const HANDOFF_LABEL = ethers.keccak256(ethers.toUtf8Bytes("hand-off"));
const PARENT_NODE = ethers.keccak256(ethers.concat([ETH_NODE, HANDOFF_LABEL]));

const ONE_ETH = ethers.parseEther("1.0");
const DEAL_ID = 42n;

describe("HandOffSubnameRegistrar", function () {

  async function deployRegistrar() {
    const [deployer, escrow, seller, buyer, other] = await ethers.getSigners();

    const ensRegistry = await ethers.deployContract("MockENSRegistry") as MockENSRegistry;
    const ensResolver = await ethers.deployContract("MockENSResolver") as MockENSResolver;

    // Give registrar ownership of hand-off.eth node in mock registry
    await ensRegistry.setOwner(PARENT_NODE, deployer.address); // will be transferred after deploy

    const registrar = await ethers.deployContract("HandOffSubnameRegistrar", [
      deployer.address,
      await ensRegistry.getAddress(),
      await ensResolver.getAddress(),
      PARENT_NODE,
    ]) as HandOffSubnameRegistrar;
    await registrar.waitForDeployment();

    // Transfer parent node ownership to registrar in mock
    await ensRegistry.setOwner(PARENT_NODE, await registrar.getAddress());

    return { registrar, ensRegistry, ensResolver, deployer, escrow, seller, buyer, other };
  }

  // ── Deployment ──────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("stores ENS registry and resolver addresses", async function () {
      const { registrar, ensRegistry, ensResolver } = await loadFixture(deployRegistrar);
      expect(await registrar.ENS_REGISTRY()).to.equal(await ensRegistry.getAddress());
      expect(await registrar.ENS_RESOLVER()).to.equal(await ensResolver.getAddress());
    });

    it("stores parent node correctly", async function () {
      const { registrar } = await loadFixture(deployRegistrar);
      expect(await registrar.PARENT_NODE()).to.equal(PARENT_NODE);
    });
  });

  // ── registerHandOff ─────────────────────────────────────────────────────────

  describe("registerHandOff()", function () {
    it("deployer registers an escrow", async function () {
      const { registrar, deployer, escrow } = await loadFixture(deployRegistrar);
      await expect(registrar.connect(deployer).registerHandOff(escrow.address))
        .to.emit(registrar, "ContractRegistered")
        .withArgs(escrow.address);
      expect(await registrar.registeredEscrows(escrow.address)).to.be.true;
    });

    it("reverts if non-deployer tries to register", async function () {
      const { registrar, other, escrow } = await loadFixture(deployRegistrar);
      await expect(registrar.connect(other).registerHandOff(escrow.address))
        .to.be.revertedWith("Not authorized deployer");
    });

    it("reverts on duplicate registration", async function () {
      const { registrar, deployer, escrow } = await loadFixture(deployRegistrar);
      await registrar.connect(deployer).registerHandOff(escrow.address);
      await expect(registrar.connect(deployer).registerHandOff(escrow.address))
        .to.be.revertedWith("Already registered");
    });
  });

  // ── mintDealReceipt (UC-16) ──────────────────────────────────────────────────

  describe("mintDealReceipt() — UC-16", function () {
    async function registeredFixture() {
      const ctx = await deployRegistrar();
      await ctx.registrar.connect(ctx.deployer).registerHandOff(ctx.escrow.address);
      return ctx;
    }

    it("registered escrow can mint a deal receipt", async function () {
      const { registrar, ensResolver, escrow, seller, buyer } =
        await loadFixture(registeredFixture);

      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      await expect(
        registrar
          .connect(escrow)
          .mintDealReceipt(DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, timestamp)
      )
        .to.emit(registrar, "DealReceiptMinted")
        .withArgs(DEAL_ID, escrow.address, "deal-42.hand-off.eth");

      expect(await registrar.minted(DEAL_ID)).to.be.true;
    });

    it("sets address record in ENS resolver to escrow address", async function () {
      const { registrar, ensResolver, escrow, seller, buyer } =
        await loadFixture(registeredFixture);
      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      await registrar
        .connect(escrow)
        .mintDealReceipt(DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, timestamp);

      // Compute expected subname node
      const labelHash = ethers.keccak256(ethers.toUtf8Bytes("deal-42"));
      const subnameNode = ethers.keccak256(ethers.concat([PARENT_NODE, labelHash]));
      expect(await ensResolver.addrs(subnameNode)).to.equal(escrow.address);
    });

    it("sets text records in ENS resolver", async function () {
      const { registrar, ensResolver, escrow, seller, buyer } =
        await loadFixture(registeredFixture);
      const timestamp = BigInt(Math.floor(Date.now() / 1000));
      await registrar
        .connect(escrow)
        .mintDealReceipt(DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, timestamp);

      const labelHash = ethers.keccak256(ethers.toUtf8Bytes("deal-42"));
      const subnameNode = ethers.keccak256(ethers.concat([PARENT_NODE, labelHash]));
      expect(await ensResolver.texts(subnameNode, "handoff-id")).to.equal("42");
    });

    it("reverts on double mint for same dealId", async function () {
      const { registrar, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar
        .connect(escrow)
        .mintDealReceipt(DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts);
      await expect(
        registrar
          .connect(escrow)
          .mintDealReceipt(DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts)
      ).to.be.revertedWith("Already minted");
    });

    it("reverts if unregistered caller tries to mint", async function () {
      const { registrar, other, seller, buyer } = await loadFixture(registeredFixture);
      await expect(
        registrar
          .connect(other)
          .mintDealReceipt(DEAL_ID, other.address, buyer.address, seller.address, ONE_ETH, 0n)
      ).to.be.revertedWith("Not registered escrow");
    });
  });

  // ── Graceful failure (UC-16) ─────────────────────────────────────────────────

  describe("Graceful failure path (UC-16)", function () {
    it("HandOff.sol unlock() emits SubnameMintFailed when registrar reverts", async function () {
      const [deployer, seller, buyer] = await ethers.getSigners();

      // Deploy a reverting ENS resolver
      const badResolver = await ethers.deployContract("RevertingENSResolver");
      const mockRegistry = await ethers.deployContract("MockENSRegistry") as MockENSRegistry;

      const registrar = await ethers.deployContract("HandOffSubnameRegistrar", [
        deployer.address,
        await mockRegistry.getAddress(),
        await badResolver.getAddress(),
        PARENT_NODE,
      ]);

      const reputation = await ethers.deployContract("HandOffReputation", [deployer.address]);
      const handoff = await ethers.deployContract("HandOff", [
        seller.address,
        ethers.ZeroAddress,
        ethers.parseEther("0.1"),
        3600n,
        99n,
        await reputation.getAddress(),
        await registrar.getAddress(), // same-chain registrar that will revert
        "",
      ]);

      await reputation.registerHandOff(await handoff.getAddress());
      await registrar.registerHandOff(await handoff.getAddress());

      const VALID_HASH = ethers.keccak256(ethers.toUtf8Bytes("test"));
      await handoff.connect(buyer).fund(VALID_HASH, "", { value: ethers.parseEther("0.1") });

      // unlock() must succeed despite registrar revert (UC-16 — non-blocking)
      await expect(handoff.connect(seller).unlock(VALID_HASH))
        .to.emit(handoff, "HandOffCompleted")
        .and.to.emit(handoff, "SubnameMintFailed");

      expect(await handoff.getState()).to.equal(2); // COMPLETED — not blocked
    });
  });

  // ── Deployer shortcut (cross-chain frontend path) ────────────────────────────

  describe("registerAndMint() — deployer shortcut for frontend cross-chain path", function () {
    it("deployer can mint directly without escrow registration", async function () {
      const { registrar, deployer, escrow, seller, buyer } = await loadFixture(deployRegistrar);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await expect(
        registrar
          .connect(deployer)
          .registerAndMint(DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts)
      ).to.emit(registrar, "DealReceiptMinted");
    });
  });

  // ── View helpers ─────────────────────────────────────────────────────────────

  describe("View helpers", function () {
    it("getDealSubname returns correct ENS name", async function () {
      const { registrar } = await loadFixture(deployRegistrar);
      expect(await registrar.getDealSubname(42n)).to.equal("deal-42.hand-off.eth");
      expect(await registrar.getDealSubname(1n)).to.equal("deal-1.hand-off.eth");
    });
  });
});
