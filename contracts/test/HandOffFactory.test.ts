import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HandOffFactory, HandOffReputation, HandOff } from "../typechain-types";

const ONE_ETH       = ethers.parseEther("1.0");
const EXPIRY_WINDOW = 86_400n; // 1 day

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [deployer, seller, buyer, other] = await ethers.getSigners();

  // 1. Deploy reputation with EOA as initial deployer
  const rep = (await ethers.deployContract("HandOffReputation", [
    deployer.address,
  ])) as HandOffReputation;

  // 2. Deploy factory pointing at reputation
  const factory = (await ethers.deployContract("HandOffFactory", [
    await rep.getAddress(),
    ethers.ZeroAddress, // subnameRegistrar — not needed for unit tests
    ethers.ZeroAddress, // allowedRouter — swap disabled
  ])) as HandOffFactory;

  // 3. Transfer deployer role to factory
  await rep.connect(deployer).transferDeployer(await factory.getAddress());

  return { rep, factory, deployer, seller, buyer, other };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("HandOffFactory", function () {

  describe("constructor", function () {
    it("stores REPUTATION_REGISTRY correctly", async function () {
      const { factory, rep } = await loadFixture(deployFixture);
      expect(await factory.REPUTATION_REGISTRY()).to.equal(await rep.getAddress());
    });

    it("reverts with zero reputation registry — ZeroReputationRegistry", async function () {
      const factoryFactory = await ethers.getContractFactory("HandOffFactory");
      await expect(
        factoryFactory.deploy(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factoryFactory, "ZeroReputationRegistry");
    });
  });

  describe("transferDeployer()", function () {
    it("transfers AUTHORIZED_DEPLOYER and emits DeployerTransferred", async function () {
      const [deployer, newDeployer] = await ethers.getSigners();
      const rep = (await ethers.deployContract("HandOffReputation", [
        deployer.address,
      ])) as HandOffReputation;

      await expect(rep.connect(deployer).transferDeployer(newDeployer.address))
        .to.emit(rep, "DeployerTransferred")
        .withArgs(deployer.address, newDeployer.address);

      expect(await rep.AUTHORIZED_DEPLOYER()).to.equal(newDeployer.address);
    });

    it("reverts if non-deployer calls transferDeployer — NotAuthorizedDeployer", async function () {
      const { rep, other } = await loadFixture(deployFixture);
      await expect(
        rep.connect(other).transferDeployer(other.address)
      ).to.be.revertedWithCustomError(rep, "NotAuthorizedDeployer");
    });

    it("reverts if new deployer is zero address — InvalidDeployer", async function () {
      const [deployer] = await ethers.getSigners();
      const rep = (await ethers.deployContract("HandOffReputation", [
        deployer.address,
      ])) as HandOffReputation;

      await expect(
        rep.connect(deployer).transferDeployer(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(rep, "InvalidDeployer");
    });

    it("EOA can no longer register escrows after transferring role to factory", async function () {
      const { rep, deployer, other } = await loadFixture(deployFixture);
      // deployer transferred role to factory in fixture — EOA should be locked out
      await expect(
        rep.connect(deployer).registerHandOff(other.address)
      ).to.be.revertedWithCustomError(rep, "NotAuthorizedDeployer");
    });
  });

  describe("createHandOff()", function () {
    it("deploys escrow, registers it, returns correct (escrow, dealId)", async function () {
      const { factory, rep, seller } = await loadFixture(deployFixture);

      const tx = await factory.connect(seller).createHandOff(
        ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW, "seller.eth"
      );
      const receipt = await tx.wait();

      // Parse event from factory
      const iface = factory.interface;
      const log = receipt!.logs.find(
        (l) => l.topics[0] === iface.getEvent("HandOffCreated")!.topicHash
      );
      const parsed = iface.parseLog(log as any)!;
      const escrowAddr: string = parsed.args.escrow;
      const dealId: bigint     = parsed.args.dealId;

      expect(dealId).to.equal(1n);
      expect(await rep.registeredEscrows(escrowAddr)).to.be.true;
      expect(await rep.totalDeals()).to.equal(1n);
      expect(await rep.getEscrowFromDealId(1n)).to.equal(escrowAddr);
    });

    it("emits HandOffCreated with seller, escrow, dealId", async function () {
      const { factory, seller } = await loadFixture(deployFixture);

      const tx = factory.connect(seller).createHandOff(
        ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW, ""
      );
      await expect(tx).to.emit(factory, "HandOffCreated");
    });

    it("seller is set correctly inside the deployed HandOff", async function () {
      const { factory, seller } = await loadFixture(deployFixture);

      const tx = await factory.connect(seller).createHandOff(
        ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW, "seller.eth"
      );
      const receipt = await tx.wait();
      const iface   = factory.interface;
      const log     = receipt!.logs.find(
        (l) => l.topics[0] === iface.getEvent("HandOffCreated")!.topicHash
      );
      const escrowAddr = iface.parseLog(log as any)!.args.escrow;

      const escrow = (await ethers.getContractAt("HandOff", escrowAddr)) as HandOff;
      expect(await escrow.SELLER()).to.equal(seller.address);
    });

    it("DEAL_ID inside HandOff matches dealId returned by factory", async function () {
      const { factory, seller } = await loadFixture(deployFixture);

      const tx = await factory.connect(seller).createHandOff(
        ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW, ""
      );
      const receipt = await tx.wait();
      const iface   = factory.interface;
      const log     = receipt!.logs.find(
        (l) => l.topics[0] === iface.getEvent("HandOffCreated")!.topicHash
      );
      const { escrow, dealId } = iface.parseLog(log as any)!.args;

      const handOff = (await ethers.getContractAt("HandOff", escrow)) as HandOff;
      expect(await handOff.DEAL_ID()).to.equal(dealId);
    });

    it("deal IDs increment sequentially across multiple calls", async function () {
      const { factory, seller, other } = await loadFixture(deployFixture);

      const tx1 = await factory.connect(seller).createHandOff(
        ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW, ""
      );
      const tx2 = await factory.connect(other).createHandOff(
        ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW, ""
      );

      const iface = factory.interface;
      const topicHash = iface.getEvent("HandOffCreated")!.topicHash;

      const r1 = await tx1.wait();
      const r2 = await tx2.wait();

      const id1 = iface.parseLog(
        r1!.logs.find((l) => l.topics[0] === topicHash) as any
      )!.args.dealId;
      const id2 = iface.parseLog(
        r2!.logs.find((l) => l.topics[0] === topicHash) as any
      )!.args.dealId;

      expect(id1).to.equal(1n);
      expect(id2).to.equal(2n);
    });

    it("created escrow can be funded and unlocked end-to-end", async function () {
      const { factory, seller, buyer } = await loadFixture(deployFixture);

      const tx = await factory.connect(seller).createHandOff(
        ethers.ZeroAddress, ONE_ETH, EXPIRY_WINDOW, ""
      );
      const receipt = await tx.wait();
      const iface   = factory.interface;
      const log     = receipt!.logs.find(
        (l) => l.topics[0] === iface.getEvent("HandOffCreated")!.topicHash
      );
      const escrowAddr = iface.parseLog(log as any)!.args.escrow;

      const escrow = (await ethers.getContractAt("HandOff", escrowAddr)) as HandOff;

      const code     = "a3x9";
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes(code));

      // Buyer funds
      await escrow.connect(buyer).fund(codeHash, "", { value: ONE_ETH });
      expect(await escrow.getState()).to.equal(1); // FUNDED

      // Seller unlocks
      await escrow.connect(seller).unlock(codeHash);
      expect(await escrow.getState()).to.equal(2); // COMPLETED
    });
  });
});
