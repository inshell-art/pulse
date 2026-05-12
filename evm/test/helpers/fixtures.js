import {
  FIRST_ID,
  GENESIS_FLOOR,
  GENESIS_PRICE,
  K,
  PTS
} from "./constants.js";

const MIN_ADAPTER_INIT_LEAD_SEC = 60n;

async function resolveOpenTime(ethers, startDelaySec) {
  const latest = await ethers.provider.getBlock("latest");
  const latestTs = BigInt(latest.timestamp);
  const requestedDelay = BigInt(startDelaySec);
  const setupDelay = requestedDelay > MIN_ADAPTER_INIT_LEAD_SEC
    ? requestedDelay
    : MIN_ADAPTER_INIT_LEAD_SEC;
  return latestTs + setupDelay;
}

export async function deployERC20Env(ethers, { startDelaySec = 0n } = {}) {
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const token = await Token.deploy("PayToken", "PAY", 18);
  await token.waitForDeployment();

  await (await token.mint(alice.address, 1_000_000n)).wait();
  await (await token.mint(bob.address, 1_000_000n)).wait();

  const Auction = await ethers.getContractFactory("PulseAuction", deployer);
  const auction = await Auction.deploy(
    await resolveOpenTime(ethers, startDelaySec),
    K,
    GENESIS_PRICE,
    GENESIS_FLOOR,
    PTS,
    await token.getAddress(),
    treasury.address,
    ethers.ZeroAddress
  );
  await auction.waitForDeployment();

  const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
  const adapter = await Adapter.deploy(await auction.getAddress(), FIRST_ID);
  await adapter.waitForDeployment();

  await (await auction.initializeMintAdapter(await adapter.getAddress())).wait();
  await (await token.connect(alice).approve(await auction.getAddress(), ethers.MaxUint256)).wait();
  await (await token.connect(bob).approve(await auction.getAddress(), ethers.MaxUint256)).wait();

  return { deployer, alice, bob, treasury, token, auction, adapter };
}

export async function deployETHEnv(ethers, { startDelaySec = 0n } = {}) {
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

  const Auction = await ethers.getContractFactory("PulseAuction", deployer);
  const auction = await Auction.deploy(
    await resolveOpenTime(ethers, startDelaySec),
    K,
    GENESIS_PRICE,
    GENESIS_FLOOR,
    PTS,
    ethers.ZeroAddress,
    treasury.address,
    ethers.ZeroAddress
  );
  await auction.waitForDeployment();

  const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
  const adapter = await Adapter.deploy(await auction.getAddress(), FIRST_ID);
  await adapter.waitForDeployment();

  await (await auction.initializeMintAdapter(await adapter.getAddress())).wait();

  return { deployer, alice, bob, treasury, auction, adapter };
}

export async function deployEvilEnv(ethers, { startDelaySec = 0n } = {}) {
  const [deployer, alice, bob, treasury] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20", deployer);
  const token = await Token.deploy("PayToken", "PAY", 18);
  await token.waitForDeployment();

  await (await token.mint(alice.address, 1_000_000n)).wait();
  await (await token.mint(bob.address, 1_000_000n)).wait();

  const Auction = await ethers.getContractFactory("PulseAuction", deployer);
  const auction = await Auction.deploy(
    await resolveOpenTime(ethers, startDelaySec),
    K,
    GENESIS_PRICE,
    GENESIS_FLOOR,
    PTS,
    await token.getAddress(),
    treasury.address,
    ethers.ZeroAddress
  );
  await auction.waitForDeployment();

  const Evil = await ethers.getContractFactory("EvilAdapter", deployer);
  const evil = await Evil.deploy(await auction.getAddress());
  await evil.waitForDeployment();

  await (await auction.initializeMintAdapter(await evil.getAddress())).wait();
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

export async function getSettledEventFromReceipt(adapter, receipt) {
  const logs = await adapter.queryFilter(
    adapter.filters.Settled(),
    receipt.blockNumber,
    receipt.blockNumber
  );

  if (logs.length === 0) {
    throw new Error("Settled event not found in receipt block");
  }

  return logs[0].args;
}
