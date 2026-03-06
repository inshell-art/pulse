import { expect } from "chai";
import hre from "hardhat";
import {
  FIRST_ID,
  GENESIS_FLOOR,
  GENESIS_PRICE,
  K,
  LARGE_MAX_PRICE,
  PTS
} from "./helpers/constants.js";
import {
  deployERC20Env,
  deployETHEnv,
  deployEvilEnv
} from "./helpers/fixtures.js";
import { setNextBlockTimestamp } from "./helpers/time.js";

describe("PulseAuction Safety + Settlement (Solidity)", function () {
  let conn;
  let ethers;
  let provider;

  beforeEach(async function () {
    conn = await hre.network.connect();
    ethers = conn.ethers;
    provider = conn.provider;
  });

  afterEach(async function () {
    await conn.close();
  });

  it("reverts when ask is above maxPrice", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 50n });
    const openTime = await auction.openTime();

    await setNextBlockTimestamp(provider, openTime);
    await expect(auction.connect(alice).bid(GENESIS_PRICE - 1n)).to.be.revertedWith(
      "ASK_ABOVE_MAX_PRICE"
    );
  });

  it("rejects non-zero msg.value in ERC20 mode", async function () {
    const { auction, alice } = await deployERC20Env(ethers, { startDelaySec: 50n });
    const openTime = await auction.openTime();

    await setNextBlockTimestamp(provider, openTime);
    await expect(
      auction.connect(alice).bid(GENESIS_PRICE, { value: GENESIS_PRICE })
    ).to.be.revertedWith("ETH_NOT_ACCEPTED");
  });

  it("accepts exact msg.value and forwards ETH to treasury in native mode", async function () {
    const { auction, alice, treasury, adapter } = await deployETHEnv(ethers, { startDelaySec: 50n });
    const openTime = await auction.openTime();

    await setNextBlockTimestamp(provider, openTime);
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);

    await (await auction.connect(alice).bid(GENESIS_PRICE, { value: GENESIS_PRICE })).wait();

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryAfter - treasuryBefore).to.equal(GENESIS_PRICE);
    expect((await auction.getState())[3]).to.equal(GENESIS_PRICE);
    expect(await auction.curveActive()).to.equal(true);
    expect(await adapter.peekNext()).to.equal(FIRST_ID + 1n);
  });

  it("reverts when msg.value is below ask in native mode", async function () {
    const { auction, alice } = await deployETHEnv(ethers, { startDelaySec: 50n });
    const openTime = await auction.openTime();

    await setNextBlockTimestamp(provider, openTime);
    await expect(auction.connect(alice).bid(GENESIS_PRICE, { value: GENESIS_PRICE - 1n })).to.be.revertedWith(
      "INVALID_MSG_VALUE"
    );
  });

  it("accepts overpay and only forwards ask to treasury in native mode", async function () {
    const { auction, alice, treasury } = await deployETHEnv(ethers, { startDelaySec: 50n });
    const openTime = await auction.openTime();

    await setNextBlockTimestamp(provider, openTime);
    const overpay = 77n;
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);

    await (await auction.connect(alice).bid(GENESIS_PRICE, { value: GENESIS_PRICE + overpay })).wait();

    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    expect(treasuryAfter - treasuryBefore).to.equal(GENESIS_PRICE);
    expect(await ethers.provider.getBalance(await auction.getAddress())).to.equal(0n);
  });

  it("requires adapter initialization before bidding and allows one-time deployer init", async function () {
    const [deployer, alice, , treasury] = await ethers.getSigners();

    const Auction = await ethers.getContractFactory("PulseAuction", deployer);
    const auction = await Auction.deploy(
      0n,
      K,
      GENESIS_PRICE,
      GENESIS_FLOOR,
      PTS,
      ethers.ZeroAddress,
      treasury.address,
      ethers.ZeroAddress
    );
    await auction.waitForDeployment();

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);
    await expect(auction.connect(alice).bid(LARGE_MAX_PRICE, { value: GENESIS_PRICE })).to.be.revertedWith(
      "ADAPTER_NOT_SET"
    );

    const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
    const adapter = await Adapter.deploy(await auction.getAddress(), FIRST_ID);
    await adapter.waitForDeployment();

    await expect(auction.connect(alice).initializeMintAdapter(await adapter.getAddress())).to.be.revertedWith(
      "ONLY_DEPLOYER"
    );
    await expect(auction.initializeMintAdapter(ethers.ZeroAddress)).to.be.revertedWith("INVALID_ADAPTER");
    await (await auction.initializeMintAdapter(await adapter.getAddress())).wait();
    await expect(
      auction.initializeMintAdapter(await adapter.getAddress())
    ).to.be.revertedWith("ADAPTER_ALREADY_SET");
  });

  it("enforces one-bid-per-block", async function () {
    const { auction, deployer, token } = await deployERC20Env(ethers, { startDelaySec: 0n });

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

    // Entire tx reverted, so the first bid was rolled back too.
    expect(await auction.epochIndex()).to.equal(0n);
  });

  it("only allows auction to call adapter.settle", async function () {
    const { adapter, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    await expect(adapter.connect(alice).settle(alice.address, 1n, "0x")).to.be.revertedWith(
      "ONLY_AUCTION"
    );
  });

  it("adapter target points to the configured auction", async function () {
    const { auction, adapter } = await deployERC20Env(ethers, { startDelaySec: 0n });

    expect(await adapter["target()"]()).to.equal(await auction.getAddress());
  });

  it("rolls back state if adapter reverts", async function () {
    const { auction, adapter, alice } = await deployERC20Env(ethers, { startDelaySec: 0n });

    await (await adapter.setShouldRevert(true)).wait();

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);

    await expect(auction.connect(alice).bid(LARGE_MAX_PRICE)).to.be.revertedWith("ADAPTER_REVERT");
    expect(await auction.epochIndex()).to.equal(0n);
    expect(await adapter.peekNext()).to.equal(FIRST_ID);
  });

  it("blocks reentrancy during settle", async function () {
    const { auction, alice } = await deployEvilEnv(ethers, { startDelaySec: 0n });

    const t1 = (await auction.openTime()) + 1_000n;
    await setNextBlockTimestamp(provider, t1);

    await expect(auction.connect(alice).bid(LARGE_MAX_PRICE)).to.be.revertedWith("REENTRANCY");
    expect(await auction.epochIndex()).to.equal(0n);
  });
});
