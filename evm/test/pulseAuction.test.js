import { expect } from "chai";
import hre from "hardhat";

const GENESIS_PRICE = 1_000n;
const GENESIS_FLOOR = 900n;
const K = 600n;
const PTS = 1n;
const FIRST_ID = 10_000n;

let conn;
let ethers;
let provider;

async function setNextBlockTimestamp(ts) {
  await provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
}

async function mine() {
  await provider.send("evm_mine");
}

async function deployEnv(startDelaySec = 0n) {
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const token = await Token.deploy("PayToken", "PAY", 18);
  await token.waitForDeployment();

  await (await token.mint(alice.address, 1_000_000n)).wait();
  await (await token.mint(bob.address, 1_000_000n)).wait();

  const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
  const adapter = await Adapter.deploy(ethers.ZeroAddress, FIRST_ID);
  await adapter.waitForDeployment();

  const Auction = await ethers.getContractFactory("PulseAuction", deployer);
  const auction = await Auction.deploy(
    startDelaySec,
    K,
    GENESIS_PRICE,
    GENESIS_FLOOR,
    PTS,
    await token.getAddress(),
    treasury.address,
    await adapter.getAddress()
  );
  await auction.waitForDeployment();

  await (await adapter.setAuction(await auction.getAddress())).wait();

  await (await token.connect(alice).approve(await auction.getAddress(), ethers.MaxUint256)).wait();
  await (await token.connect(bob).approve(await auction.getAddress(), ethers.MaxUint256)).wait();

  return { deployer, alice, bob, treasury, token, auction, adapter };
}

async function deployEvilEnv(startDelaySec = 0n) {
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const token = await Token.deploy("PayToken", "PAY", 18);
  await token.waitForDeployment();

  await (await token.mint(alice.address, 1_000_000n)).wait();
  await (await token.mint(bob.address, 1_000_000n)).wait();

  const Evil = await ethers.getContractFactory("EvilAdapter", deployer);
  const evil = await Evil.deploy(ethers.ZeroAddress);
  await evil.waitForDeployment();

  const Auction = await ethers.getContractFactory("PulseAuction", deployer);
  const auction = await Auction.deploy(
    startDelaySec,
    K,
    GENESIS_PRICE,
    GENESIS_FLOOR,
    PTS,
    await token.getAddress(),
    treasury.address,
    await evil.getAddress()
  );
  await auction.waitForDeployment();

  await (await evil.setAuction(await auction.getAddress())).wait();

  await (await token.connect(alice).approve(await auction.getAddress(), ethers.MaxUint256)).wait();
  await (await token.connect(bob).approve(await auction.getAddress(), ethers.MaxUint256)).wait();

  return { deployer, alice, bob, treasury, token, auction, evil };
}

describe("PulseAuction (Solidity)", function () {
  beforeEach(async function () {
    conn = await hre.network.connect();
    ethers = conn.ethers;
    provider = conn.provider;
  });

  afterEach(async function () {
    await conn.close();
  });

  it("constructor config and initial price", async function () {
    const { auction } = await deployEnv(0n);

    const [openTime, gp, gf, k, pts] = await auction.getConfig();
    expect(openTime).to.be.greaterThan(0n);
    expect(gp).to.equal(GENESIS_PRICE);
    expect(gf).to.equal(GENESIS_FLOOR);
    expect(k).to.equal(K);
    expect(pts).to.equal(PTS);

    expect(await auction.curveActive()).to.equal(false);
    expect(await auction.getCurrentPrice()).to.equal(GENESIS_PRICE);
  });

  it("constructor rejects zero k", async function () {
    const [deployer, treasury] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20", deployer);
    const token = await Token.deploy("PayToken", "PAY", 18);
    await token.waitForDeployment();

    const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
    const adapter = await Adapter.deploy(ethers.ZeroAddress, FIRST_ID);
    await adapter.waitForDeployment();

    const Auction = await ethers.getContractFactory("PulseAuction", deployer);
    await expect(
      (async () => {
        const a = await Auction.deploy(
          0n,
          0n,
          GENESIS_PRICE,
          GENESIS_FLOOR,
          PTS,
          await token.getAddress(),
          treasury.address,
          await adapter.getAddress()
        );
        await a.waitForDeployment();
      })()
    ).to.be.revertedWith("K_ZERO_OR_NEGATIVE");
  });

  it("anchor and price match formula after second sale", async function () {
    const { auction, alice } = await deployEnv(0n);

    const openTime = await auction.openTime();
    const t1 = openTime + 1000n;
    const t2 = t1 + 10n;
    const t3 = t2 + 10n;

    await setNextBlockTimestamp(t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    const gap1 = GENESIS_PRICE - GENESIS_FLOOR;
    const a1Offset = K / gap1;
    const a1 = t1 - a1Offset;
    const b1 = GENESIS_FLOOR;

    const lastPrice2 = K / (t2 - a1) + b1;

    await setNextBlockTimestamp(t2);
    await (await auction.connect(alice).bid(10_000n)).wait();

    const premium = (t2 - t1) * PTS;
    const a2Offset = K / premium;
    const a2 = t2 - a2Offset;
    const b2 = lastPrice2;

    await setNextBlockTimestamp(t3);
    await mine();

    const y = await auction.getCurrentPrice();
    const expectedY = K / (t3 - a2) + b2;
    expect(y).to.equal(expectedY);
  });

  it("bid before open time reverts", async function () {
    const { auction, alice } = await deployEnv(123n);
    await expect(auction.connect(alice).bid(GENESIS_PRICE)).to.be.revertedWith("AUCTION_NOT_OPEN");
  });

  it("bid at open time succeeds", async function () {
    const { auction, alice } = await deployEnv(123n);
    const openTime = await auction.openTime();
    await setNextBlockTimestamp(openTime);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();
  });

  it("bid emits Sale event", async function () {
    const { auction, alice } = await deployEnv(0n);

    const openTime = await auction.openTime();
    const t1 = openTime + 1000n;
    const expectedAnchor = t1 - K / (GENESIS_PRICE - GENESIS_FLOOR);

    await setNextBlockTimestamp(t1);
    await expect(auction.connect(alice).bid(GENESIS_PRICE))
      .to.emit(auction, "Sale")
      .withArgs(alice.address, FIRST_ID, GENESIS_PRICE, t1, expectedAnchor, GENESIS_FLOOR, 1n);
  });

  it("state includes anchor and floor after genesis", async function () {
    const { auction, alice } = await deployEnv(0n);

    const openTime = await auction.openTime();
    const t1 = openTime + 1000n;
    const expectedAnchor = t1 - K / (GENESIS_PRICE - GENESIS_FLOOR);

    await setNextBlockTimestamp(t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    const [epoch, start, anchor, floor, active] = await auction.getState();
    expect(active).to.equal(true);
    expect(epoch).to.equal(1n);
    expect(start).to.equal(t1);
    expect(anchor).to.equal(expectedAnchor);
    expect(floor).to.equal(GENESIS_FLOOR);
  });

  it("state includes anchor and floor after second sale", async function () {
    const { auction, alice } = await deployEnv(0n);

    const openTime = await auction.openTime();
    const t1 = openTime + 1000n;
    const t2 = t1 + 10n;

    await setNextBlockTimestamp(t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    const gap1 = GENESIS_PRICE - GENESIS_FLOOR;
    const a1Offset = K / gap1;
    const a1 = t1 - a1Offset;
    const lastPrice2 = K / (t2 - a1) + GENESIS_FLOOR;

    const premium = (t2 - t1) * PTS;
    const a2Offset = K / premium;
    const a2 = t2 - a2Offset;
    const b2 = lastPrice2;

    await setNextBlockTimestamp(t2);
    await (await auction.connect(alice).bid(10_000n)).wait();

    const [epoch, start, anchor, floor, active] = await auction.getState();
    expect(active).to.equal(true);
    expect(epoch).to.equal(2n);
    expect(start).to.equal(t2);
    expect(anchor).to.equal(a2);
    expect(floor).to.equal(b2);
  });

  it("bid ask above max reverts", async function () {
    const { auction, alice } = await deployEnv(0n);
    const t1 = (await auction.openTime()) + 1000n;
    await setNextBlockTimestamp(t1);
    await expect(auction.connect(alice).bid(GENESIS_PRICE - 1n)).to.be.revertedWith(
      "ASK_ABOVE_MAX_PRICE"
    );
  });

  it("genesis activates curve and adapter advances", async function () {
    const { auction, adapter, alice } = await deployEnv(0n);
    const t1 = (await auction.openTime()) + 1000n;
    await setNextBlockTimestamp(t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    expect(await auction.curveActive()).to.equal(true);
    expect(await adapter.peekNext()).to.equal(FIRST_ID + 1n);
  });

  it("second bid succeeds and adapter advances again", async function () {
    const { auction, adapter, alice } = await deployEnv(0n);
    const openTime = await auction.openTime();
    const t1 = openTime + 1000n;
    const t2 = t1 + 10n;

    await setNextBlockTimestamp(t1);
    await (await auction.connect(alice).bid(GENESIS_PRICE)).wait();

    await setNextBlockTimestamp(t2);
    await (await auction.connect(alice).bid(10_000n)).wait();

    expect(await adapter.peekNext()).to.equal(FIRST_ID + 2n);
  });

  it("one bid per block guard blocks second fill in same block", async function () {
    const { auction, deployer, token } = await deployEnv(0n);

    const Batcher = await ethers.getContractFactory("BidBatcher", deployer);
    const batcher = await Batcher.deploy();
    await batcher.waitForDeployment();

    await (await token.mint(await batcher.getAddress(), 1_000_000n)).wait();
    await (
      await batcher.approveToken(
        await token.getAddress(),
        await auction.getAddress(),
        ethers.MaxUint256
      )
    ).wait();

    await expect(
      batcher.bidTwice(await auction.getAddress(), GENESIS_PRICE, GENESIS_PRICE)
    ).to.be.revertedWith("ONE_BID_PER_BLOCK");

    // Entire tx reverted, so the first bid should be rolled back.
    expect(await auction.curveActive()).to.equal(false);
  });

  it("only auction can call adapter.settle()", async function () {
    const { adapter, alice } = await deployEnv(0n);
    await expect(adapter.connect(alice).settle(alice.address, "0x")).to.be.revertedWith(
      "ONLY_AUCTION"
    );
  });

  it("adapter.target returns auction", async function () {
    const { auction, adapter } = await deployEnv(0n);
    // Ethers v6 uses `contract.target` as the deployed address, so call via selector.
    expect(await adapter["target()"]()).to.equal(await auction.getAddress());
  });

  it("adapter revert rolls back the bid", async function () {
    const { auction, adapter, alice } = await deployEnv(0n);
    await (await adapter.setShouldRevert(true)).wait();

    const t1 = (await auction.openTime()) + 1000n;
    await setNextBlockTimestamp(t1);

    await expect(auction.connect(alice).bid(GENESIS_PRICE)).to.be.revertedWith("ADAPTER_REVERT");
    expect(await auction.curveActive()).to.equal(false);
    expect(await adapter.peekNext()).to.equal(FIRST_ID);
  });

  it("reentrancy is blocked at genesis", async function () {
    const { auction, alice } = await deployEvilEnv(0n);
    const t1 = (await auction.openTime()) + 1000n;
    await setNextBlockTimestamp(t1);

    await expect(auction.connect(alice).bid(GENESIS_PRICE)).to.be.revertedWith("REENTRANCY");
    expect(await auction.curveActive()).to.equal(false);
  });
});
