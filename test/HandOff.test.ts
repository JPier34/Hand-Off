import { describe, it } from "node:test";
import { network } from "hardhat";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { parseEther, parseUnits, keccak256, encodePacked, zeroAddress, getAddress, concat } from "viem";

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

function bigIntCloseTo(actual: bigint, expected: bigint, delta: bigint): boolean {
  const diff = actual > expected ? actual - expected : expected - actual;
  return diff <= delta;
}

/**
 * Replicates MockNameWrapper subnode derivation:
 * keccak256(parentNode ++ keccak256(label))
 */
function subnodeHash(parentNode: `0x${string}`, label: string): `0x${string}` {
  const labelHash = keccak256(encodePacked(["string"], [label]));
  return keccak256(concat([parentNode, labelHash]));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CODE       = "A7K2";
const WRONG_CODE = "ZZZZ";
const AMOUNT_ETH = parseEther("1");
const AMOUNT_USDC = parseUnits("400", 6);
const DUR_30S    = 30n;
const DUR_1D     = 86400n;
const FEE_BPS    = 50n;
const BPS_DENOM  = 10_000n;
const GAS_MARGIN = parseEther("0.01");

const HANDOFF_NODE =
  "0x6a7b8e19fe8c83e3c0ccd8562c0ec77e21b72a94e0be02bcaf4d1df86e6a45e3" as `0x${string}`;

function netToSeller(gross: bigint) { return gross - (gross * FEE_BPS) / BPS_DENOM; }
function feeAmount(gross: bigint)   { return (gross * FEE_BPS) / BPS_DENOM; }

// ─── Fixtures ────────────────────────────────────────────────────────────────

async function deployHandOff() {
  const [owner, seller, buyer, feeRecipient, stranger] = await viem.getWalletClients();

  const mockWETH   = await viem.deployContract("MockWETH");
  const mockRouter = await viem.deployContract("MockSwapRouter", [mockWETH.address]);
  const mockUSDC   = await viem.deployContract("MockERC20", ["MockUSDC", "USDC", 6n]);
  const handOff    = await viem.deployContract("HandOff", [
    mockRouter.address,
    mockWETH.address,
    feeRecipient.account.address,
  ]);

  await mockUSDC.write.mint([buyer.account.address, parseUnits("10000", 6)]);

  async function as(contract: typeof handOff, wallet: typeof owner) {
    return viem.getContractAt("HandOff", contract.address, { client: { wallet } });
  }

  return { handOff, mockWETH, mockRouter, mockUSDC, owner, seller, buyer, feeRecipient, stranger, as };
}

async function deployReputation(callerAddress: `0x${string}`) {
  const [owner, , , , stranger] = await viem.getWalletClients();
  const reputation = await viem.deployContract("HandOffReputation", [callerAddress]);

  async function asCaller(wallet: Awaited<ReturnType<typeof viem.getWalletClients>>[number]) {
    return viem.getContractAt("HandOffReputation", reputation.address, { client: { wallet } });
  }

  return { reputation, owner, stranger, asCaller };
}

async function deployENSRegistrar(callerAddress: `0x${string}`) {
  const [owner, , , , stranger] = await viem.getWalletClients();
  const mockNameWrapper = await viem.deployContract("MockNameWrapper");
  const mockResolver    = await viem.deployContract("MockPublicResolver");
  const registrar       = await viem.deployContract("HandOffENSRegistrar", [
    callerAddress,
    mockNameWrapper.address,
    mockResolver.address,
  ]);

  async function asCaller(wallet: Awaited<ReturnType<typeof viem.getWalletClients>>[number]) {
    return viem.getContractAt("HandOffENSRegistrar", registrar.address, { client: { wallet } });
  }

  return { registrar, mockNameWrapper, mockResolver, owner, stranger, asCaller };
}

// ═════════════════════════════════════════════════════════════════════════════
// HandOff — escrow core
// ═════════════════════════════════════════════════════════════════════════════

describe("unlock()", function () {
  async function fundedETHFixture() {
    const base = await deployHandOff();
    const buyerHandOff = await base.as(base.handOff, base.buyer);
    await buyerHandOff.write.fund(
      [base.seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );
    return { ...base, dealId: 1n };
  }

  it("releases net amount to seller and fee to feeRecipient", async function () {
    const { handOff, seller, feeRecipient, dealId, as } = await fundedETHFixture();
    const pub = await viem.getPublicClient();

    const sellerBefore = await pub.getBalance({ address: seller.account.address });
    const feeBefore    = await pub.getBalance({ address: feeRecipient.account.address });

    await (await as(handOff, seller)).write.unlock([dealId, CODE]);

    const sellerAfter = await pub.getBalance({ address: seller.account.address });
    const feeAfter    = await pub.getBalance({ address: feeRecipient.account.address });

    expect(bigIntCloseTo(sellerAfter - sellerBefore, netToSeller(AMOUNT_ETH), GAS_MARGIN)).to.be.true;
    expect(feeAfter - feeBefore).to.equal(feeAmount(AMOUNT_ETH));
    expect((await handOff.read.getDeal([dealId])).status).to.equal(1); // COMPLETED
  });

  it("reverts with WrongCode on incorrect code", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    await expect((await as(handOff, seller)).write.unlock([dealId, WRONG_CODE]))
      .to.be.rejectedWith("WrongCode");
  });

  it("reverts with NotSeller when caller is not the seller", async function () {
    const { handOff, stranger, dealId, as } = await fundedETHFixture();
    await expect((await as(handOff, stranger)).write.unlock([dealId, CODE]))
      .to.be.rejectedWith("NotSeller");
  });

  it("reverts with DeadlineReached after expiry", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    await increaseTime(31);
    await expect((await as(handOff, seller)).write.unlock([dealId, CODE]))
      .to.be.rejectedWith("DeadlineReached");
  });

  it("reverts with DealNotFunded on double unlock", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    const sellerHandOff = await as(handOff, seller);
    await sellerHandOff.write.unlock([dealId, CODE]);
    await expect(sellerHandOff.write.unlock([dealId, CODE]))
      .to.be.rejectedWith("DealNotFunded");
  });

  it("silently skips reputation and ENS calls when addresses not set", async function () {
    const { handOff, seller, dealId, as } = await fundedETHFixture();
    await (await as(handOff, seller)).write.unlock([dealId, CODE]);
    expect((await handOff.read.getDeal([dealId])).status).to.equal(1);
  });
});

describe("fund() — direct deposit", function () {
  it("ETH: creates deal, locks funds, increments counter", async function () {
    const { handOff, seller, buyer, as } = await deployHandOff();
    await (await as(handOff, buyer)).write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );

    const deal = await handOff.read.getDeal([1n]);
    expect(deal.seller).to.equal(getAddress(seller.account.address));
    expect(deal.buyer).to.equal(getAddress(buyer.account.address));
    expect(deal.token).to.equal(zeroAddress);
    expect(deal.amount).to.equal(AMOUNT_ETH);
    expect(deal.status).to.equal(0);
    expect(await handOff.read.totalDeals()).to.equal(1n);

    const pub = await viem.getPublicClient();
    expect(await pub.getBalance({ address: handOff.address })).to.equal(AMOUNT_ETH);
  });

  it("ERC20: pulls tokens from buyer, contract balance updated", async function () {
    const { handOff, mockUSDC, seller, buyer, as } = await deployHandOff();
    const buyerToken = await viem.getContractAt("MockERC20", mockUSDC.address, { client: { wallet: buyer } });
    await buyerToken.write.approve([handOff.address, AMOUNT_USDC]);
    await (await as(handOff, buyer)).write.fund([seller.account.address, mockUSDC.address, AMOUNT_USDC, DUR_1D, codeHash(CODE)]);

    expect(await mockUSDC.read.balanceOf([handOff.address])).to.equal(AMOUNT_USDC);
  });

  it("reverts InvalidAmount when amount is zero", async function () {
    const { handOff, seller, buyer, as } = await deployHandOff();
    await expect(
      (await as(handOff, buyer)).write.fund([seller.account.address, zeroAddress, 0n, DUR_30S, codeHash(CODE)], { value: 0n })
    ).to.be.rejectedWith("InvalidAmount");
  });

  it("reverts InvalidSeller when seller is zero address", async function () {
    const { handOff, buyer, as } = await deployHandOff();
    await expect(
      (await as(handOff, buyer)).write.fund([zeroAddress, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)], { value: AMOUNT_ETH })
    ).to.be.rejectedWith("InvalidSeller");
  });

  it("reverts InvalidExpiry when duration is below minimum", async function () {
    const { handOff, seller, buyer, as } = await deployHandOff();
    await expect(
      (await as(handOff, buyer)).write.fund([seller.account.address, zeroAddress, AMOUNT_ETH, 10n, codeHash(CODE)], { value: AMOUNT_ETH })
    ).to.be.rejectedWith("InvalidExpiry");
  });

  it("reverts InvalidCodeHash when codeHash is zero", async function () {
    const { handOff, seller, buyer, as } = await deployHandOff();
    const zeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
    await expect(
      (await as(handOff, buyer)).write.fund([seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, zeroHash], { value: AMOUNT_ETH })
    ).to.be.rejectedWith("InvalidCodeHash");
  });

  it("reverts InvalidAmount when msg.value does not match amount", async function () {
    const { handOff, seller, buyer, as } = await deployHandOff();
    await expect(
      (await as(handOff, buyer)).write.fund([seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)], { value: AMOUNT_ETH / 2n })
    ).to.be.rejectedWith("InvalidAmount");
  });
});

describe("fundWithSwap()", function () {
  async function swapFixture() {
    const base = await deployHandOff();
    const { mockRouter, mockUSDC, buyer, owner } = base;

    const routerLiquidity = parseUnits("10000", 6);
    await mockUSDC.write.mint([owner.account.address, routerLiquidity]);
    await mockUSDC.write.approve([mockRouter.address, routerLiquidity]);
    await mockRouter.write.mintOutput([mockUSDC.address, routerLiquidity]);

    const buyerWETH = await viem.getContractAt("MockWETH", base.mockWETH.address, { client: { wallet: buyer } });
    await buyerWETH.write.deposit([], { value: parseEther("2") });

    return { ...base, buyerWETH };
  }

  it("swaps input token to output token, locks exact amountOut", async function () {
    const { handOff, mockWETH, mockUSDC, seller, buyer, buyerWETH, as } = await swapFixture();
    await buyerWETH.write.approve([handOff.address, parseEther("0.5")]);

    await (await as(handOff, buyer)).write.fundWithSwap([
      seller.account.address,
      mockWETH.address,
      mockUSDC.address,
      AMOUNT_USDC,
      parseEther("0.5"),
      3000,
      DUR_1D,
      codeHash(CODE),
    ]);

    expect(await mockUSDC.read.balanceOf([handOff.address])).to.equal(AMOUNT_USDC);
    const deal = await handOff.read.getDeal([1n]);
    expect(deal.token).to.equal(getAddress(mockUSDC.address));
    expect(deal.amount).to.equal(AMOUNT_USDC);
    expect(deal.status).to.equal(0);
  });

  it("reverts InvalidToken when tokenOut is native ETH address", async function () {
    const { handOff, mockWETH, buyer, seller, as } = await swapFixture();
    await expect(
      (await as(handOff, buyer)).write.fundWithSwap([
        seller.account.address, mockWETH.address, zeroAddress,
        AMOUNT_USDC, parseEther("0.5"), 3000, DUR_1D, codeHash(CODE),
      ])
    ).to.be.rejectedWith("InvalidToken");
  });
});

describe("refund()", function () {
  async function expiredFixture() {
    const base = await deployHandOff();
    const buyerHandOff = await base.as(base.handOff, base.buyer);
    await buyerHandOff.write.fund(
      [base.seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );
    await increaseTime(31);
    return { ...base, dealId: 1n, buyerHandOff };
  }

  it("returns full amount to buyer with no fee deducted", async function () {
    const { buyer, dealId, buyerHandOff } = await expiredFixture();
    const pub = await viem.getPublicClient();

    const before = await pub.getBalance({ address: buyer.account.address });
    await buyerHandOff.write.refund([dealId]);
    const after = await pub.getBalance({ address: buyer.account.address });

    expect(bigIntCloseTo(after - before, AMOUNT_ETH, GAS_MARGIN)).to.be.true;
  });

  it("is permissionless — anyone can trigger, funds always go to buyer", async function () {
    const { handOff, buyer, stranger, dealId, as } = await expiredFixture();
    const pub = await viem.getPublicClient();

    const before = await pub.getBalance({ address: buyer.account.address });
    await (await as(handOff, stranger)).write.refund([dealId]);
    const after = await pub.getBalance({ address: buyer.account.address });

    expect(after - before).to.equal(AMOUNT_ETH);
  });

  it("reverts DeadlineNotReached before expiry", async function () {
    const { handOff, buyer, as } = await deployHandOff();
    const [, seller] = await viem.getWalletClients();
    const buyerHandOff = await as(handOff, buyer);
    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );
    await expect(buyerHandOff.write.refund([1n])).to.be.rejectedWith("DeadlineNotReached");
  });

  it("reverts DealNotFunded on double refund", async function () {
    const { buyerHandOff, dealId } = await expiredFixture();
    await buyerHandOff.write.refund([dealId]);
    await expect(buyerHandOff.write.refund([dealId])).to.be.rejectedWith("DealNotFunded");
  });

  it("unlock reverts DealNotFunded after refund", async function () {
    const { handOff, seller, dealId, buyerHandOff, as } = await expiredFixture();
    await buyerHandOff.write.refund([dealId]);
    await expect((await as(handOff, seller)).write.unlock([dealId, CODE]))
      .to.be.rejectedWith("DealNotFunded");
  });
});

describe("Deadline boundary", function () {
  it("at expiry: unlock reverts, refund succeeds", async function () {
    const { handOff, seller, buyer, as } = await deployHandOff();
    const buyerHandOff  = await as(handOff, buyer);
    const sellerHandOff = await as(handOff, seller);

    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash(CODE)],
      { value: AMOUNT_ETH }
    );
    await increaseTime(30);

    await expect(sellerHandOff.write.unlock([1n, CODE])).to.be.rejectedWith("DeadlineReached");
    await buyerHandOff.write.refund([1n]);
    expect((await handOff.read.getDeal([1n])).status).to.equal(2);
  });
});

describe("Concurrent deals", function () {
  it("two active deals are isolated from each other", async function () {
    const { handOff, seller, buyer, as } = await deployHandOff();
    const buyerHandOff  = await as(handOff, buyer);
    const sellerHandOff = await as(handOff, seller);

    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_30S, codeHash("AAA1")],
      { value: AMOUNT_ETH }
    );
    await buyerHandOff.write.fund(
      [seller.account.address, zeroAddress, AMOUNT_ETH, DUR_1D, codeHash("BBB2")],
      { value: AMOUNT_ETH }
    );

    expect(await handOff.read.totalDeals()).to.equal(2n);
    await sellerHandOff.write.unlock([1n, "AAA1"]);

    expect((await handOff.read.getDeal([1n])).status).to.equal(1); // COMPLETED
    expect((await handOff.read.getDeal([2n])).status).to.equal(0); // FUNDED
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HandOffReputation
// ═════════════════════════════════════════════════════════════════════════════

describe("HandOffReputation — deployment", function () {
  it("stores handOffContract address and sets owner", async function () {
    const [, caller] = await viem.getWalletClients();
    const { reputation, owner } = await deployReputation(caller.account.address);

    expect(await reputation.read.handOffContract()).to.equal(getAddress(caller.account.address));
    expect(await reputation.read.owner()).to.equal(getAddress(owner.account.address));
  });

  it("reverts ZeroAddress when handOffContract is zero", async function () {
    await expect(
      viem.deployContract("HandOffReputation", [zeroAddress])
    ).to.be.rejectedWith("ZeroAddress");
  });
});

describe("HandOffReputation — recordDeal()", function () {
  it("increments dealCount and accumulates totalVolume", async function () {
    const [, caller, seller] = await viem.getWalletClients();
    const { reputation, asCaller } = await deployReputation(caller.account.address);
    const rep = await asCaller(caller);

    await rep.write.recordDeal([seller.account.address, parseEther("1")]);
    await rep.write.recordDeal([seller.account.address, parseEther("2.5")]);

    const [count, volume] = await reputation.read.getReputation([seller.account.address]);
    expect(count).to.equal(2n);
    expect(volume).to.equal(parseEther("3.5"));
  });

  it("tracks reputation independently per wallet", async function () {
    const [, caller, sellerA, sellerB] = await viem.getWalletClients();
    const { reputation, asCaller } = await deployReputation(caller.account.address);
    const rep = await asCaller(caller);

    await rep.write.recordDeal([sellerA.account.address, parseEther("1")]);
    await rep.write.recordDeal([sellerB.account.address, parseEther("5")]);

    const [countA] = await reputation.read.getReputation([sellerA.account.address]);
    const [countB] = await reputation.read.getReputation([sellerB.account.address]);
    expect(countA).to.equal(1n);
    expect(countB).to.equal(1n);
  });

  it("reverts NotHandOff when called by unauthorized address", async function () {
    const [, caller, seller] = await viem.getWalletClients();
    const { stranger, asCaller } = await deployReputation(caller.account.address);
    const rep = await asCaller(stranger);

    await expect(rep.write.recordDeal([seller.account.address, parseEther("1")]))
      .to.be.rejectedWith("NotHandOff");
  });
});

describe("HandOffReputation — getReputation()", function () {
  it("returns zeros for a wallet with no deals", async function () {
    const [, caller, seller] = await viem.getWalletClients();
    const { reputation } = await deployReputation(caller.account.address);

    const [count, volume] = await reputation.read.getReputation([seller.account.address]);
    expect(count).to.equal(0n);
    expect(volume).to.equal(0n);
  });
});

describe("HandOffReputation — setHandOffContract()", function () {
  it("owner can update the authorized address", async function () {
    const [owner, caller, , , stranger] = await viem.getWalletClients();
    const { reputation, asCaller } = await deployReputation(caller.account.address);
    const ownerRep = await asCaller(owner);

    await ownerRep.write.setHandOffContract([stranger.account.address]);
    expect(await reputation.read.handOffContract()).to.equal(getAddress(stranger.account.address));
  });

  it("reverts ZeroAddress when setting zero", async function () {
    const [owner, caller] = await viem.getWalletClients();
    const { asCaller } = await deployReputation(caller.account.address);
    await expect((await asCaller(owner)).write.setHandOffContract([zeroAddress]))
      .to.be.rejectedWith("ZeroAddress");
  });

  it("reverts OwnableUnauthorizedAccount when called by non-owner", async function () {
    const [, caller, , , stranger] = await viem.getWalletClients();
    const { asCaller } = await deployReputation(caller.account.address);
    await expect((await asCaller(stranger)).write.setHandOffContract([stranger.account.address]))
      .to.be.rejectedWith("OwnableUnauthorizedAccount");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HandOffENSRegistrar
// ═════════════════════════════════════════════════════════════════════════════

describe("HandOffENSRegistrar — deployment", function () {
  it("stores all constructor addresses", async function () {
    const [, caller] = await viem.getWalletClients();
    const { registrar, mockNameWrapper, mockResolver } = await deployENSRegistrar(caller.account.address);

    expect(await registrar.read.handOffContract()).to.equal(getAddress(caller.account.address));
    expect(await registrar.read.nameWrapper()).to.equal(getAddress(mockNameWrapper.address));
    expect(await registrar.read.publicResolver()).to.equal(getAddress(mockResolver.address));
  });

  it("reverts ZeroAddress if any constructor arg is zero", async function () {
    const [, caller] = await viem.getWalletClients();
    const mockNW  = await viem.deployContract("MockNameWrapper");
    const mockRes = await viem.deployContract("MockPublicResolver");

    await expect(viem.deployContract("HandOffENSRegistrar", [zeroAddress, mockNW.address, mockRes.address]))
      .to.be.rejectedWith("ZeroAddress");
    await expect(viem.deployContract("HandOffENSRegistrar", [caller.account.address, zeroAddress, mockRes.address]))
      .to.be.rejectedWith("ZeroAddress");
    await expect(viem.deployContract("HandOffENSRegistrar", [caller.account.address, mockNW.address, zeroAddress]))
      .to.be.rejectedWith("ZeroAddress");
  });
});

describe("HandOffENSRegistrar — registerSubname()", function () {
  it("calls NameWrapper with correct parent node and numeric label", async function () {
    const [, caller, buyer, seller] = await viem.getWalletClients();
    const { mockNameWrapper, asCaller } = await deployENSRegistrar(caller.account.address);

    await (await asCaller(caller)).write.registerSubname([42n, buyer.account.address, seller.account.address, parseEther("1")]);

    expect(await mockNameWrapper.read.lastParentNode()).to.equal(HANDOFF_NODE);
    expect(await mockNameWrapper.read.lastLabel()).to.equal("42");
  });

  it("writes buyer, seller, amount, timestamp as text records", async function () {
    const [, caller, buyer, seller] = await viem.getWalletClients();
    const { registrar, mockResolver, asCaller } = await deployENSRegistrar(caller.account.address);
    const amount = parseEther("0.5");

    await (await asCaller(caller)).write.registerSubname([7n, buyer.account.address, seller.account.address, amount]);

    const subnode = subnodeHash(HANDOFF_NODE, "7");
    const resolver = await viem.getContractAt("MockPublicResolver", mockResolver.address);

    expect((await resolver.read.getText([subnode, "deal.buyer"])).toLowerCase())
      .to.equal(buyer.account.address.toLowerCase());
    expect((await resolver.read.getText([subnode, "deal.seller"])).toLowerCase())
      .to.equal(seller.account.address.toLowerCase());
    expect(await resolver.read.getText([subnode, "deal.amount"]))
      .to.equal(amount.toString());
  });

  it("sets addr record to handOffContract address", async function () {
    const [, caller, buyer, seller] = await viem.getWalletClients();
    const { mockResolver, asCaller } = await deployENSRegistrar(caller.account.address);

    await (await asCaller(caller)).write.registerSubname([1n, buyer.account.address, seller.account.address, parseEther("1")]);

    const subnode  = subnodeHash(HANDOFF_NODE, "1");
    const resolver = await viem.getContractAt("MockPublicResolver", mockResolver.address);
    expect(await resolver.read.getAddr([subnode])).to.equal(getAddress(caller.account.address));
  });

  it("reverts NotHandOff when called by unauthorized address", async function () {
    const [, caller, buyer, seller, stranger] = await viem.getWalletClients();
    const { asCaller } = await deployENSRegistrar(caller.account.address);

    await expect((await asCaller(stranger)).write.registerSubname([1n, buyer.account.address, seller.account.address, parseEther("1")]))
      .to.be.rejectedWith("NotHandOff");
  });

  it("generates correct sequential labels for sequential deal IDs", async function () {
    const [, caller, buyer, seller] = await viem.getWalletClients();
    const { mockNameWrapper, asCaller } = await deployENSRegistrar(caller.account.address);
    const reg = await asCaller(caller);

    await reg.write.registerSubname([1n, buyer.account.address, seller.account.address, parseEther("1")]);
    expect(await mockNameWrapper.read.lastLabel()).to.equal("1");

    await reg.write.registerSubname([99n, buyer.account.address, seller.account.address, parseEther("1")]);
    expect(await mockNameWrapper.read.lastLabel()).to.equal("99");
  });
});

describe("HandOffENSRegistrar — owner setters", function () {
  it("setHandOffContract updates the authorized address", async function () {
    const [owner, caller, , , stranger] = await viem.getWalletClients();
    const { registrar, asCaller } = await deployENSRegistrar(caller.account.address);

    await (await asCaller(owner)).write.setHandOffContract([stranger.account.address]);
    expect(await registrar.read.handOffContract()).to.equal(getAddress(stranger.account.address));
  });

  it("setNameWrapper updates the NameWrapper address", async function () {
    const [owner, caller, , , stranger] = await viem.getWalletClients();
    const { registrar, asCaller } = await deployENSRegistrar(caller.account.address);

    await (await asCaller(owner)).write.setNameWrapper([stranger.account.address]);
    expect(await registrar.read.nameWrapper()).to.equal(getAddress(stranger.account.address));
  });

  it("setPublicResolver updates the resolver address", async function () {
    const [owner, caller, , , stranger] = await viem.getWalletClients();
    const { registrar, asCaller } = await deployENSRegistrar(caller.account.address);

    await (await asCaller(owner)).write.setPublicResolver([stranger.account.address]);
    expect(await registrar.read.publicResolver()).to.equal(getAddress(stranger.account.address));
  });

  it("all setters revert OwnableUnauthorizedAccount for non-owner", async function () {
    const [, caller, , , stranger] = await viem.getWalletClients();
    const { asCaller } = await deployENSRegistrar(caller.account.address);
    const reg = await asCaller(stranger);

    await expect(reg.write.setHandOffContract([stranger.account.address])).to.be.rejectedWith("OwnableUnauthorizedAccount");
    await expect(reg.write.setNameWrapper([stranger.account.address])).to.be.rejectedWith("OwnableUnauthorizedAccount");
    await expect(reg.write.setPublicResolver([stranger.account.address])).to.be.rejectedWith("OwnableUnauthorizedAccount");
  });
});
