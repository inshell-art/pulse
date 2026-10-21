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
  const { ethers, provider } = conn;

  // Timestamp controls belong only to this local-devnet rehearsal.
  const networkInfo = await ethers.provider.getNetwork();
  if (conn.networkName !== "localhost" || networkInfo.chainId !== 31337n) {
    throw new Error("Smoke requires the localhost devnet (chain 31337)");
  }

  const [, buyer] = await ethers.getSigners();
  const auction = await ethers.getContractAt("PulseAuction", deployment.contracts.pulseAuction);
  const adapter = await ethers.getContractAt("StubAdapter", deployment.contracts.stubAdapter);

  const openTime = await auction.openTime();
  const latest = await provider.send("eth_getBlockByNumber", ["latest", false]);
  if (BigInt(latest.timestamp) < openTime) {
    await provider.send("evm_setNextBlockTimestamp", [Number(openTime)]);
    // Mine before quoting/estimating: a pending timestamp alone is not a
    // guarantee that every provider estimates against an open block.
    await provider.send("evm_mine", []);
  }
  if (!(await auction.curveActive())) throw new Error("Devnet did not reach openTime");
  const epochBefore = await auction.epochIndex();
  const nextIdBefore = await adapter.peekNext();
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
  if (!isOpen || treasuryDelta !== salePrice || salePrice > quotedAsk ||
      epochIndex !== epochBefore + 1n || nextId !== nextIdBefore + 1n) {
    throw new Error("Smoke settlement/state checks failed");
  }

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
