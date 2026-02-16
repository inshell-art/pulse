import {
  FIRST_ID,
  GENESIS_FLOOR,
  GENESIS_PRICE,
  K,
  PTS
} from "./constants.js";

export async function deployERC20Env(ethers, { startDelaySec = 0n } = {}) {
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

export async function deployETHEnv(ethers, { startDelaySec = 0n } = {}) {
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

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
    ethers.ZeroAddress,
    treasury.address,
    await adapter.getAddress()
  );
  await auction.waitForDeployment();

  await (await adapter.setAuction(await auction.getAddress())).wait();

  return { deployer, alice, bob, treasury, auction, adapter };
}

export async function deployEvilEnv(ethers, { startDelaySec = 0n } = {}) {
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

export async function getSaleEventFromReceipt(auction, receipt) {
  const logs = await auction.queryFilter(
    auction.filters.Sale(),
    receipt.blockNumber,
    receipt.blockNumber
  );

  if (logs.length === 0) {
    throw new Error("Sale event not found in receipt block");
  }

  return logs[0].args;
}
