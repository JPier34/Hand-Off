import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HandOffSubnameRegistrar, MockENSRegistry, MockENSResolver } from "../typechain-types";

const ONE_ETH = ethers.parseEther("1.0");
const DEAL_ID = 42n;

// Precompute namehash("hand-off.eth") for tests
const ZERO_NODE    = ethers.ZeroHash;
const ETH_LABEL    = ethers.keccak256(ethers.toUtf8Bytes("eth"));
const ETH_NODE     = ethers.keccak256(ethers.concat([ZERO_NODE, ETH_LABEL]));
const HANDOFF_LABEL = ethers.keccak256(ethers.toUtf8Bytes("hand-off"));
const PARENT_NODE  = ethers.keccak256(ethers.concat([ETH_NODE, HANDOFF_LABEL]));

// Helper: compute expected subname node for a given dealId
function subnameNode(dealId: bigint): string {
  const label     = `deal-${dealId}`;
  const labelHash = ethers.keccak256(ethers.toUtf8Bytes(label));
  return ethers.keccak256(ethers.concat([PARENT_NODE, labelHash]));
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [deployer, escrow, seller, buyer, other] = await ethers.getSigners();

  const registry = await ethers.deployContract("MockENSRegistry") as MockENSRegistry;
  const resolver = await ethers.deployContract("MockENSResolver") as MockENSResolver;

  // Give the registrar contract apparent ownership of the parent node
  await registry.setOwner(PARENT_NODE, deployer.address);

  const registrar = (await ethers.deployContract("HandOffSubnameRegistrar", [
    deployer.address,
    await registry.getAddress(),
    await resolver.getAddress(),
    PARENT_NODE,
  ])) as HandOffSubnameRegistrar;

  // Transfer parent node ownership to registrar in mock
  await registry.setOwner(PARENT_NODE, await registrar.getAddress());

  return { registrar, registry, resolver, deployer, escrow, seller, buyer, other };
}

async function registeredFixture() {
  const ctx = await deployFixture();
  await ctx.registrar.connect(ctx.deployer).registerHandOff(ctx.escrow.address);
  return ctx;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("HandOffSubnameRegistrar", function () {

  // ── Constructor ─────────────────────────────────────────────────────────────
  describe("constructor", function () {
    it("stores ENS registry address", async function () {
      const { registrar, registry } = await loadFixture(deployFixture);
      expect(await registrar.ENS_REGISTRY()).to.equal(await registry.getAddress());
    });

    it("stores ENS resolver address", async function () {
      const { registrar, resolver } = await loadFixture(deployFixture);
      expect(await registrar.ENS_RESOLVER()).to.equal(await resolver.getAddress());
    });

    it("stores parent node (namehash of hand-off.eth)", async function () {
      const { registrar } = await loadFixture(deployFixture);
      expect(await registrar.PARENT_NODE()).to.equal(PARENT_NODE);
    });

    it("stores authorized deployer", async function () {
      const { registrar, deployer } = await loadFixture(deployFixture);
      expect(await registrar.AUTHORIZED_DEPLOYER()).to.equal(deployer.address);
    });

    it("reverts with zero deployer address — InvalidDeployer", async function () {
      const [, , ens] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("HandOffSubnameRegistrar");
      await expect(
        factory.deploy(ethers.ZeroAddress, ens.address, ens.address, PARENT_NODE)
      ).to.be.revertedWithCustomError(factory, "InvalidDeployer");
    });

    it("reverts with zero ENS registry address — InvalidENSRegistry", async function () {
      const [deployer, resolver] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("HandOffSubnameRegistrar");
      await expect(
        factory.deploy(deployer.address, ethers.ZeroAddress, resolver.address, PARENT_NODE)
      ).to.be.revertedWithCustomError(factory, "InvalidENSRegistry");
    });

    it("reverts with zero ENS resolver address — InvalidENSResolver", async function () {
      const [deployer, registry] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("HandOffSubnameRegistrar");
      await expect(
        factory.deploy(deployer.address, registry.address, ethers.ZeroAddress, PARENT_NODE)
      ).to.be.revertedWithCustomError(factory, "InvalidENSResolver");
    });
  });

  // ── registerHandOff ─────────────────────────────────────────────────────────
  describe("registerHandOff()", function () {
    it("deployer registers escrow, emits ContractRegistered", async function () {
      const { registrar, deployer, escrow } = await loadFixture(deployFixture);
      await expect(registrar.connect(deployer).registerHandOff(escrow.address))
        .to.emit(registrar, "ContractRegistered").withArgs(escrow.address);
      expect(await registrar.registeredEscrows(escrow.address)).to.be.true;
    });

    it("reverts if non-deployer registers — NotAuthorizedDeployer", async function () {
      const { registrar, other, escrow } = await loadFixture(deployFixture);
      await expect(registrar.connect(other).registerHandOff(escrow.address))
        .to.be.revertedWithCustomError(registrar, "NotAuthorizedDeployer");
    });

    it("reverts on duplicate registration — AlreadyRegistered", async function () {
      const { registrar, deployer, escrow } = await loadFixture(registeredFixture);
      await expect(registrar.connect(deployer).registerHandOff(escrow.address))
        .to.be.revertedWithCustomError(registrar, "AlreadyRegistered");
    });

    it("reverts with zero escrow address — InvalidEscrow", async function () {
      const { registrar, deployer } = await loadFixture(deployFixture);
      await expect(registrar.connect(deployer).registerHandOff(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registrar, "InvalidEscrow");
    });
  });

  // ── revokeHandOff ───────────────────────────────────────────────────────────
  describe("revokeHandOff()", function () {
    it("deployer revokes escrow, emits ContractRevoked", async function () {
      const { registrar, deployer, escrow } = await loadFixture(registeredFixture);
      await expect(registrar.connect(deployer).revokeHandOff(escrow.address))
        .to.emit(registrar, "ContractRevoked").withArgs(escrow.address);
      expect(await registrar.registeredEscrows(escrow.address)).to.be.false;
    });

    it("revoked escrow can no longer call mintDealReceipt — NotRegisteredEscrow", async function () {
      const { registrar, deployer, escrow, seller, buyer } = await loadFixture(registeredFixture);
      await registrar.connect(deployer).revokeHandOff(escrow.address);
      await expect(
        registrar.connect(escrow).mintDealReceipt(
          DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH,
          BigInt(Math.floor(Date.now() / 1000))
        )
      ).to.be.revertedWithCustomError(registrar, "NotRegisteredEscrow");
    });
  });

  // ── mintDealReceipt (UC-16) ──────────────────────────────────────────────────
  describe("mintDealReceipt() — UC-16", function () {
    it("happy path: registered escrow mints receipt, emits DealReceiptMinted", async function () {
      const { registrar, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await expect(
        registrar.connect(escrow).mintDealReceipt(
          DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
        )
      ).to.emit(registrar, "DealReceiptMinted")
        .withArgs(DEAL_ID, escrow.address, "deal-42.hand-off.eth");
      expect(await registrar.minted(DEAL_ID)).to.be.true;
    });

    it("address record set to escrow address in ENS resolver", async function () {
      const { registrar, resolver, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      const node = subnameNode(DEAL_ID);
      expect(await resolver.addrs(node)).to.equal(escrow.address);
    });

    it("text record 'handoff-id' set correctly", async function () {
      const { registrar, resolver, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      const node = subnameNode(DEAL_ID);
      expect(await resolver.texts(node, "handoff-id")).to.equal("42");
    });

    it("text record 'amount' set correctly", async function () {
      const { registrar, resolver, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      const node = subnameNode(DEAL_ID);
      expect(await resolver.texts(node, "amount")).to.equal(ONE_ETH.toString());
    });

    it("text record 'seller' set as hex string", async function () {
      const { registrar, resolver, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      const node = subnameNode(DEAL_ID);
      const sellerText = await resolver.texts(node, "seller");
      expect(sellerText.toLowerCase()).to.include(seller.address.slice(2).toLowerCase());
    });

    it("text record 'buyer' set as hex string", async function () {
      const { registrar, resolver, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      const node = subnameNode(DEAL_ID);
      const buyerText = await resolver.texts(node, "buyer");
      expect(buyerText.toLowerCase()).to.include(buyer.address.slice(2).toLowerCase());
    });

    it("subnode ownership set to registrar contract in ENS registry", async function () {
      const { registrar, registry, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      const node = subnameNode(DEAL_ID);
      expect(await registry.owner(node)).to.equal(await registrar.getAddress());
    });

    it("multiple receipts with sequential deal IDs all mint successfully", async function () {
      const { registrar, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      for (let id = 1n; id <= 5n; id++) {
        await expect(
          registrar.connect(escrow).mintDealReceipt(
            id, escrow.address, buyer.address, seller.address, ONE_ETH, ts
          )
        ).to.emit(registrar, "DealReceiptMinted")
          .withArgs(id, escrow.address, `deal-${id}.hand-off.eth`);
      }
    });

    it("reverts on duplicate deal ID — AlreadyMinted", async function () {
      const { registrar, escrow, seller, buyer } = await loadFixture(registeredFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      await expect(
        registrar.connect(escrow).mintDealReceipt(
          DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
        )
      ).to.be.revertedWithCustomError(registrar, "AlreadyMinted");
    });

    it("reverts if unregistered caller tries to mint — NotRegisteredEscrow", async function () {
      const { registrar, other, seller, buyer } = await loadFixture(registeredFixture);
      await expect(
        registrar.connect(other).mintDealReceipt(
          DEAL_ID, other.address, buyer.address, seller.address, ONE_ETH, 0n
        )
      ).to.be.revertedWithCustomError(registrar, "NotRegisteredEscrow");
    });
  });

  // ── registerAndMint (deployer shortcut for cross-chain) ──────────────────────
  describe("registerAndMint() — deployer cross-chain shortcut", function () {
    it("deployer can mint without registering an escrow first", async function () {
      const { registrar, deployer, escrow, seller, buyer } = await loadFixture(deployFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await expect(
        registrar.connect(deployer).registerAndMint(
          DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
        )
      ).to.emit(registrar, "DealReceiptMinted");
    });

    it("reverts if non-deployer calls registerAndMint — NotAuthorizedDeployer", async function () {
      const { registrar, other, escrow, seller, buyer } = await loadFixture(deployFixture);
      await expect(
        registrar.connect(other).registerAndMint(
          DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, 0n
        )
      ).to.be.revertedWithCustomError(registrar, "NotAuthorizedDeployer");
    });

    it("duplicate deal ID also rejected via registerAndMint — AlreadyMinted", async function () {
      const { registrar, deployer, escrow, seller, buyer } = await loadFixture(deployFixture);
      const ts = BigInt(Math.floor(Date.now() / 1000));
      await registrar.connect(deployer).registerAndMint(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
      );
      await expect(
        registrar.connect(deployer).registerAndMint(
          DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH, ts
        )
      ).to.be.revertedWithCustomError(registrar, "AlreadyMinted");
    });
  });

  // ── Graceful failure (UC-16) ─────────────────────────────────────────────────
  describe("Graceful failure path (UC-16)", function () {
    it("HandOff.sol unlock() emits SubnameMintFailed not REVERTED when registrar reverts", async function () {
      const [deployer, seller, buyer] = await ethers.getSigners();
      const badResolver = await ethers.deployContract("RevertingENSResolver");
      const mockReg     = await ethers.deployContract("MockENSRegistry") as MockENSRegistry;
      const registrar   = (await ethers.deployContract("HandOffSubnameRegistrar", [
        deployer.address,
        await mockReg.getAddress(),
        await badResolver.getAddress(),
        PARENT_NODE,
      ])) as HandOffSubnameRegistrar;
      const rep = await ethers.deployContract("HandOffReputation", [deployer.address]);
      const h   = await ethers.deployContract("HandOff", [
        seller.address, ethers.ZeroAddress, ethers.parseEther("0.1"), 86_400n,
        99n, await rep.getAddress(), await registrar.getAddress(), "",
        ethers.ZeroAddress, // no swap router
      ]);
      // HandOff self-registers with both rep and registrar in its constructor — no manual calls needed.
      const code = ethers.keccak256(ethers.toUtf8Bytes("test"));
      await h.connect(buyer).fund(code, "", { value: ethers.parseEther("0.1") });

      // unlock() MUST succeed — completion is never blocked by minting failure
      await expect(h.connect(seller).unlock(code))
        .to.emit(h, "HandOffCompleted")
        .and.to.emit(h, "SubnameMintFailed");

      expect(await h.getState()).to.equal(2); // COMPLETED
    });
  });

  // ── View helpers ─────────────────────────────────────────────────────────────
  describe("View helpers", function () {
    it("getDealSubname returns correct formatted name", async function () {
      const { registrar } = await loadFixture(deployFixture);
      expect(await registrar.getDealSubname(1n)).to.equal("deal-1.hand-off.eth");
      expect(await registrar.getDealSubname(42n)).to.equal("deal-42.hand-off.eth");
      expect(await registrar.getDealSubname(999n)).to.equal("deal-999.hand-off.eth");
    });

    it("computeSubnameNode returns correct keccak node", async function () {
      const { registrar } = await loadFixture(deployFixture);
      const computed = await registrar.computeSubnameNode(42n);
      expect(computed).to.equal(subnameNode(42n));
    });

    it("minted mapping is false before minting and true after", async function () {
      const { registrar, escrow, seller, buyer } = await loadFixture(registeredFixture);
      expect(await registrar.minted(DEAL_ID)).to.be.false;
      await registrar.connect(escrow).mintDealReceipt(
        DEAL_ID, escrow.address, buyer.address, seller.address, ONE_ETH,
        BigInt(Math.floor(Date.now() / 1000))
      );
      expect(await registrar.minted(DEAL_ID)).to.be.true;
    });
  });
});
