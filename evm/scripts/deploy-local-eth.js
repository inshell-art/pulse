import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";

const START_DELAY_SEC = 0n;
const K = 600n;
const GENESIS_PRICE = 1_000n;
const GENESIS_FLOOR = 900n;
const PTS = 1n;
const FIRST_ID = 10_000n;

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const conn = await hre.network.connect();
  const { ethers } = conn;

  const [deployer, , treasury] = await ethers.getSigners();
  const networkInfo = await ethers.provider.getNetwork();

  const Auction = await ethers.getContractFactory("PulseAuction", deployer);
  const auction = await Auction.deploy(
    START_DELAY_SEC,
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

  const deployment = {
    network: conn.networkName,
    chainId: Number(networkInfo.chainId),
    deployer: deployer.address,
    treasury: treasury.address,
    paymentToken: ethers.ZeroAddress,
    contracts: {
      pulseAuction: await auction.getAddress(),
      stubAdapter: await adapter.getAddress()
    },
    config: {
      startDelaySec: START_DELAY_SEC.toString(),
      k: K.toString(),
      genesisPrice: GENESIS_PRICE.toString(),
      genesisFloor: GENESIS_FLOOR.toString(),
      pts: PTS.toString(),
      firstId: FIRST_ID.toString()
    }
  };

  const deploymentsDir = path.resolve(here, "../deployments");
  await fs.mkdir(deploymentsDir, { recursive: true });
  const outFile = path.join(deploymentsDir, `${conn.networkName}-eth.json`);
  await fs.writeFile(outFile, `${JSON.stringify(deployment, null, 2)}\n`, "utf8");

  console.log(`[deploy-local-eth] deployment saved to ${outFile}`);
  console.log(JSON.stringify(deployment, null, 2));

  await conn.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
