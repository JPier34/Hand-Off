import { describe, it } from "node:test";
import { network } from "hardhat";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { parseEther, keccak256, encodePacked, zeroAddress, getAddress, concat } from "viem";

chai.use(chaiAsPromised);
const { expect } = chai;
const { viem, networkHelpers } = await network.connect();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function codeHash(code: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [code]));
}

async function increaseTime(seconds: number) {
  await networkHelpers.time.increase(seconds);
}

function subnodeHash(parentNode: `0x${string}`, label: string): `0x${string}` {
  const labelHash = keccak256(encodePacked(["string"], [label]));
  return keccak256(concat([parentNode, labelHash]));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CODE          = "A7K2";
const AMOUNT_ETH    = parseEther("1");
const DUR_30S       = 30n;
const DUR_1D        = 86400n;
const FEE_BPS       = 50n;
const BPS_DENOM     = 10_000n;
const HANDOFF_NODE  =
  "0x6a7b8e19fe8c83e3c0ccd8562c0ec77e21b72a94e0be02bcaf4d1df86e6a45e3" as `0x${string}`;

function netToSeller(gross: bigint) { return gross - (gross * FEE_BPS) / BPS_DENOM; }

// ─── Full-stack fixture ───────────────────────────────────────────────────────

/**
 * Deploys all three contracts and wires them together.
 * HandOff is the authorized caller for both Reputation and ENS registrar.
 */
async function deployWired() {
  const [owner, seller, buyer, feeRecipient, stranger] = await viem.getWalletClients();
  const pub = await viem.getPublicClient();

  // Infrastructure mocks
  const mockWETH      = await viem.deployContract("MockWETH");
  const mockRouter    = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
  const mockNameWrapper = await viem.deployContract("MockNameWrapper");
  const mockResolver    = await viem.deployContract("MockPublicResolver");

  // Core contracts
  const handOff = await viem.deployContract("HandOff", [
    mockRouter.address,
    mockWETH.address,
    feeRecipient.account.address,
  ]);

  const reputation = await viem.deployContract("HandOffReputation", [handOff.address]);

  const registrar  = await viem.deployContract("HandOffENSRegistrar", [
    handOff.address,
    mockNameWrapper.address,
    mockResolver.address,
  ]);

  // Wire HandOff → satellite contracts (use owner wallet explicitly for onlyOwner calls)
  const ownerHandOff = await viem.getContractAt("HandOff", handOff.address, { client: { wallet: owner } });
  const reputationHash = await ownerHandOff.write.setReputationContract([reputation.address]);
  await pub.waitForTransactionReceipt({ hash: reputationHash });
  const registrarHash = await ownerHandOff.write.setENSRegistrar([registrar.address]);
  await pub.waitForTransactionReceipt({ hash: registrarHash });

  // Helpers
  async function as<T extends { address: `0x${string}` }>(
    contract: T,
    wallet: Awaited<ReturnType<typeof viem.getWalletClients>>[number],
    name: string,
  ) {
    return viem.getContractAt(name, contract.address, { client: { wallet } });
  }

  async function asHandOff(wallet: Awaited<ReturnType<typeof viem.getWalletClients>>[number]) {
    return viem.getContractAt("HandOff", handOff.address, { client: { wallet } });
  }

  return {
    handOff, reputation, registrar,
    mockNameWrapper, mockResolver, mockWETH, mockRouter,
    owner, seller, buyer, feeRecipient, stranger,
    as, asHandOff,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Integration — full happy path
// ═════════════════════════════════════════════════════════════════════════════

describe("Integration — unlock() wired", function () {
  it("after unlock: deal COMPLETED, reputation updated, ENS subname registered", async function () {
    const {
      handOff, reputation, mockNameWrapper, mockResolver,
      seller, buyer, asHandOff,
    } = await deployWired();
    const pub = await viem.getPublicClient();

    // Buyer funds
    await (await asHandOff(buyer)).write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH },
    );

    const dealId = 1n;
    const net    = netToSeller(AMOUNT_ETH);

    // Seller unlocks
    const unlockHash = await (await asHandOff(seller)).write.unlock([dealId, CODE], { gas: 5_000_000n });
    await pub.waitForTransactionReceipt({ hash: unlockHash });

    // Deal status
    expect((await handOff.read.getDeal([dealId])).status).to.equal(1); // COMPLETED

    // Reputation updated
    const [count, volume] = await reputation.read.getReputation([seller.account.address]);
    expect(count).to.equal(1n);
    expect(volume).to.equal(net);

    // ENS: NameWrapper received correct parent node and label
    expect(await mockNameWrapper.read.lastParentNode()).to.equal(HANDOFF_NODE);
    expect(await mockNameWrapper.read.lastLabel()).to.equal(dealId.toString());

    // ENS: text records written
    const subnode   = subnodeHash(HANDOFF_NODE, dealId.toString());
    const resolver  = await viem.getContractAt("MockPublicResolver", mockResolver.address);

    expect((await resolver.read.getText([subnode, "deal.buyer"])).toLowerCase())
      .to.equal(buyer.account.address.toLowerCase());
    expect((await resolver.read.getText([subnode, "deal.seller"])).toLowerCase())
      .to.equal(seller.account.address.toLowerCase());
    expect(await resolver.read.getText([subnode, "deal.amount"]))
      .to.equal(net.toString());

    // ENS: addr record points to handOff
    expect(await resolver.read.getAddr([subnode]))
      .to.equal(getAddress(handOff.address));
  });

  it("reputation accumulates across multiple completed deals for the same seller", async function () {
    const { handOff, reputation, seller, buyer, asHandOff } = await deployWired();
    const buyerHO = await asHandOff(buyer);
    const sellerHO = await asHandOff(seller);

    // Deal 1 — 1 ETH
    await buyerHO.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_1D, codeHash("AAA1")],
      { value: AMOUNT_ETH },
    );
    await sellerHO.write.unlock([1n, "AAA1"]);

    // Deal 2 — 2 ETH
    const twoEth = parseEther("2");
    await buyerHO.write.fund(
      [seller.account.address, zeroAddress, twoEth, DUR_1D, codeHash("BBB2")],
      { value: twoEth },
    );
    await sellerHO.write.unlock([2n, "BBB2"]);

    const [count, volume] = await reputation.read.getReputation([seller.account.address]);
    expect(count).to.equal(2n);
    expect(volume).to.equal(netToSeller(AMOUNT_ETH) + netToSeller(twoEth));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration — refund path
// ═════════════════════════════════════════════════════════════════════════════

describe("Integration — refund() wired", function () {
  it("after refund: reputation NOT updated, ENS NOT called", async function () {
    const { handOff, reputation, mockNameWrapper, seller, buyer, asHandOff } = await deployWired();

    await (await asHandOff(buyer)).write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH },
    );

    await increaseTime(31);
    await (await asHandOff(buyer)).write.refund([1n]);

    // Deal REFUNDED
    expect((await handOff.read.getDeal([1n])).status).to.equal(2);

    // Reputation unchanged
    const [count] = await reputation.read.getReputation([seller.account.address]);
    expect(count).to.equal(0n);

    // NameWrapper never called (zero value = default bytes32)
    const zeroes = "0x0000000000000000000000000000000000000000000000000000000000000000";
    expect(await mockNameWrapper.read.lastParentNode()).to.equal(zeroes);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration — non-blocking satellite failures
// ═════════════════════════════════════════════════════════════════════════════

describe("Integration — satellite contract failures are non-blocking", function () {
  it("unlock succeeds even if reputation.recordDeal() reverts (NotHandOff)", async function () {
    const [owner, seller, buyer, feeRecipient] = await viem.getWalletClients();

    const mockWETH   = await viem.deployContract("MockWETH");
    const mockRouter = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
    const handOff    = await viem.deployContract("HandOff", [
      mockRouter.address, mockWETH.address, feeRecipient.account.address,
    ]);

    // Deploy reputation but DO NOT authorize handOff as the caller
    // → any call from handOff will revert with NotHandOff
    const wrongCaller = buyer.account.address; // not handOff
    const reputation  = await viem.deployContract("HandOffReputation", [wrongCaller]);

    await handOff.write.setReputationContract([reputation.address]);

    const buyerHO  = await viem.getContractAt("HandOff", handOff.address, { client: { wallet: buyer } });
    const sellerHO = await viem.getContractAt("HandOff", handOff.address, { client: { wallet: seller } });

    await buyerHO.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH },
    );

    // unlock must NOT throw even though reputation.recordDeal reverts internally
    await sellerHO.write.unlock([1n, CODE]);

    expect((await handOff.read.getDeal([1n])).status).to.equal(1); // COMPLETED
    // reputation untouched
    const [count] = await reputation.read.getReputation([seller.account.address]);
    expect(count).to.equal(0n);
  });

  it("unlock succeeds even if ensRegistrar.registerSubname() reverts (NotHandOff)", async function () {
    const [owner, seller, buyer, feeRecipient] = await viem.getWalletClients();

    const mockWETH        = await viem.deployContract("MockWETH");
    const mockRouter      = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
    const mockNameWrapper = await viem.deployContract("MockNameWrapper");
    const mockResolver    = await viem.deployContract("MockPublicResolver");
    const handOff         = await viem.deployContract("HandOff", [
      mockRouter.address, mockWETH.address, feeRecipient.account.address,
    ]);

    // Deploy ENS registrar but DO NOT authorize handOff as the caller
    const wrongCaller = buyer.account.address;
    const registrar   = await viem.deployContract("HandOffENSRegistrar", [
      wrongCaller, mockNameWrapper.address, mockResolver.address,
    ]);

    await handOff.write.setENSRegistrar([registrar.address]);

    const buyerHO  = await viem.getContractAt("HandOff", handOff.address, { client: { wallet: buyer } });
    const sellerHO = await viem.getContractAt("HandOff", handOff.address, { client: { wallet: seller } });

    await buyerHO.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH },
    );

    // unlock must NOT throw even though registrar.registerSubname reverts internally
    await sellerHO.write.unlock([1n, CODE]);

    expect((await handOff.read.getDeal([1n])).status).to.equal(1); // COMPLETED
    // NameWrapper never touched
    const zeroes = "0x0000000000000000000000000000000000000000000000000000000000000000";
    expect(await mockNameWrapper.read.lastParentNode()).to.equal(zeroes);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration — events
// ═════════════════════════════════════════════════════════════════════════════

describe("Integration — events", function () {
  it("fund() emits DealFunded with correct fields", async function () {
    const { handOff, seller, buyer, asHandOff } = await deployWired();
    const pub = await viem.getPublicClient();

    const hash = await (await asHandOff(buyer)).write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH },
    );

    const receipt = await pub.waitForTransactionReceipt({ hash });
    const logs    = await pub.getContractEvents({
      address: handOff.address,
      abi: handOff.abi,
      eventName: "DealFunded",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    // At least one DealFunded log
    expect(logs.length).to.be.greaterThan(0);
    const ev = logs[0].args;
    expect(ev.dealId).to.equal(1n);
    expect(ev.seller?.toLowerCase()).to.equal(seller.account.address.toLowerCase());
    expect(ev.buyer?.toLowerCase()).to.equal(buyer.account.address.toLowerCase());
    expect(ev.token).to.equal(zeroAddress);
    expect(ev.amount).to.equal(AMOUNT_ETH);
  });

  it("unlock() emits DealCompleted with net amount and fee", async function () {
    const { handOff, seller, buyer, asHandOff } = await deployWired();
    const pub = await viem.getPublicClient();

    await (await asHandOff(buyer)).write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH },
    );

    const hash = await (await asHandOff(seller)).write.unlock([1n, CODE]);
    const receipt = await pub.waitForTransactionReceipt({ hash });

    const logs = await pub.getContractEvents({
      address: handOff.address,
      abi: handOff.abi,
      eventName: "DealCompleted",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    expect(logs.length).to.be.greaterThan(0);
    const ev = logs[0].args;
    expect(ev.dealId).to.equal(1n);
    expect(ev.amountToSeller).to.equal(netToSeller(AMOUNT_ETH));
    expect(ev.fee).to.equal((AMOUNT_ETH * FEE_BPS) / BPS_DENOM);
  });

  it("refund() emits DealRefunded with full gross amount", async function () {
    const { handOff, seller, buyer, asHandOff } = await deployWired();
    const pub = await viem.getPublicClient();

    await (await asHandOff(buyer)).write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH },
    );

    await increaseTime(31);
    const hash = await (await asHandOff(buyer)).write.refund([1n]);
    const receipt = await pub.waitForTransactionReceipt({ hash });

    const logs = await pub.getContractEvents({
      address: handOff.address,
      abi: handOff.abi,
      eventName: "DealRefunded",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    expect(logs.length).to.be.greaterThan(0);
    const ev = logs[0].args;
    expect(ev.dealId).to.equal(1n);
    expect(ev.buyer?.toLowerCase()).to.equal(buyer.account.address.toLowerCase());
    expect(ev.amount).to.equal(AMOUNT_ETH); // no fee on refund
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration — owner wiring post-deploy
// ═════════════════════════════════════════════════════════════════════════════

describe("Integration — post-deploy wiring", function () {
  it("setReputationContract and setENSRegistrar update state and emit events", async function () {
    const [owner, , , feeRecipient] = await viem.getWalletClients();
    const pub = await viem.getPublicClient();
    const mockWETH   = await viem.deployContract("MockWETH");
    const mockRouter = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
    const handOff    = await viem.deployContract("HandOff", [
      mockRouter.address, mockWETH.address, feeRecipient.account.address,
    ]);

    const rep = await viem.deployContract("HandOffReputation", [handOff.address]);
    const mockNW  = await viem.deployContract("MockNameWrapper");
    const mockRes = await viem.deployContract("MockPublicResolver");
    const ens = await viem.deployContract("HandOffENSRegistrar", [
      handOff.address, mockNW.address, mockRes.address,
    ]);

    // Initially zeroed
    expect(await handOff.read.reputationContract()).to.equal(zeroAddress);
    expect(await handOff.read.ensRegistrar()).to.equal(zeroAddress);

    const repHash = await handOff.write.setReputationContract([rep.address]);
    const repReceipt = await pub.waitForTransactionReceipt({ hash: repHash });
    const ensHash = await handOff.write.setENSRegistrar([ens.address]);
    const ensReceipt = await pub.waitForTransactionReceipt({ hash: ensHash });

    expect(await handOff.read.reputationContract()).to.equal(getAddress(rep.address));
    expect(await handOff.read.ensRegistrar()).to.equal(getAddress(ens.address));

    // Events
    const repLogs = await pub.getContractEvents({
      address: handOff.address,
      abi: handOff.abi,
      eventName: "ReputationContractUpdated",
      fromBlock: repReceipt.blockNumber,
      toBlock: repReceipt.blockNumber,
    });
    const ensLogs = await pub.getContractEvents({
      address: handOff.address,
      abi: handOff.abi,
      eventName: "ENSRegistrarUpdated",
      fromBlock: ensReceipt.blockNumber,
      toBlock: ensReceipt.blockNumber,
    });
    expect(repLogs[0].args.newContract).to.equal(getAddress(rep.address));
    expect(ensLogs[0].args.newRegistrar).to.equal(getAddress(ens.address));
  });

  it("only owner can call setReputationContract and setENSRegistrar", async function () {
    const [, , , feeRecipient, stranger] = await viem.getWalletClients();
    const mockWETH   = await viem.deployContract("MockWETH");
    const mockRouter = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
    const handOff    = await viem.deployContract("HandOff", [
      mockRouter.address, mockWETH.address, feeRecipient.account.address,
    ]);

    const strangerHO = await viem.getContractAt("HandOff", handOff.address, { client: { wallet: stranger } });

    await expect(strangerHO.write.setReputationContract([stranger.account.address]))
      .to.be.rejectedWith("OwnableUnauthorizedAccount");
    await expect(strangerHO.write.setENSRegistrar([stranger.account.address]))
      .to.be.rejectedWith("OwnableUnauthorizedAccount");
  });

  it("setFeeRecipient updates feeRecipient and emits FeeRecipientUpdated", async function () {
    const [owner, , , feeRecipient, stranger] = await viem.getWalletClients();
    const pub = await viem.getPublicClient();
    const mockWETH   = await viem.deployContract("MockWETH");
    const mockRouter = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
    const handOff    = await viem.deployContract("HandOff", [
      mockRouter.address, mockWETH.address, feeRecipient.account.address,
    ]);

    const hash = await handOff.write.setFeeRecipient([stranger.account.address]);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    expect(await handOff.read.feeRecipient()).to.equal(getAddress(stranger.account.address));

    const logs = await pub.getContractEvents({
      address: handOff.address,
      abi: handOff.abi,
      eventName: "FeeRecipientUpdated",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    expect(logs[0].args.newRecipient).to.equal(getAddress(stranger.account.address));
  });
});
