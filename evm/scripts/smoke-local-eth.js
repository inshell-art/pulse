import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import hre from "hardhat";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DEPLOY_FILE = path.resolve(here, "../deployments/localhost-eth.json");

async function main() {
  const deployFile = process.env.DEPLOY_FILE ?? DEFAULT_DEPLOY_FILE;
  const raw = await fs.readFile(deployFile, "utf8");
  const deployment = JSON.parse(raw);

  const conn = await hre.network.connect();
  const { ethers } = conn;

  const [, buyer] = await ethers.getSigners();
  const auction = await ethers.getContractAt("PulseAuction", deployment.contracts.pulseAuction);
  const adapter = await ethers.getContractAt("StubAdapter", deployment.contracts.stubAdapter);

  const quotedAsk = await auction.getCurrentPrice();
  const treasuryBefore = await ethers.provider.getBalance(deployment.treasury);

  const tx = await auction.connect(buyer).bid(quotedAsk, { value: quotedAsk });
  const receipt = await tx.wait();

  const saleLogs = await auction.queryFilter(
    auction.filters.Sale(),
    receipt.blockNumber,
    receipt.blockNumber
  );
  if (saleLogs.length === 0) {
    throw new Error("Sale event not found in smoke tx block");
  }
  const salePrice = saleLogs[0].args.price;

  const treasuryAfter = await ethers.provider.getBalance(deployment.treasury);
  const isOpen = await auction.curveActive();
  const epochIndex = await auction.epochIndex();
  const nextId = await adapter.peekNext();
  const treasuryDelta = treasuryAfter - treasuryBefore;

  const summary = {
    deployFile,
    network: conn.networkName,
    buyer: buyer.address,
    txHash: receipt.hash,
    quotedAskWei: quotedAsk.toString(),
    salePriceWei: salePrice.toString(),
    treasuryDeltaWei: treasuryDelta.toString(),
    treasuryDeltaMatchesSalePrice: treasuryDelta === salePrice,
    isOpen,
    epochIndex: epochIndex.toString(),
    adapterNextId: nextId.toString()
  };

  console.log("[smoke-local-eth] bid executed");
  console.log(JSON.stringify(summary, null, 2));

  await conn.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
