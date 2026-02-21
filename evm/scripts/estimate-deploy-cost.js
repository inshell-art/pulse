import hre from "hardhat";

const START_DELAY_SEC = 0n;
const K = 600n;
const GENESIS_PRICE = 1_000n;
const GENESIS_FLOOR = 900n;
const PTS = 1n;
const FIRST_ID = 10_000n;
const DUMMY_ADAPTER_ADDRESS = "0x000000000000000000000000000000000000dEaD";

function parsePositiveNumber(raw, name) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number. Received: ${raw}`);
  }
  return n;
}

function parseScenarioList(raw) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => parsePositiveNumber(s, "GAS_SCENARIOS_GWEI"));
}

async function fetchJson(url, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveGasPriceGwei(provider) {
  if (process.env.GAS_PRICE_GWEI) {
    return {
      gwei: parsePositiveNumber(process.env.GAS_PRICE_GWEI, "GAS_PRICE_GWEI"),
      source: "env:GAS_PRICE_GWEI"
    };
  }

  // Try Etherscan gas oracle first (mainnet snapshot).
  const etherscanUrls = [
    "https://api.etherscan.io/v2/api?chainid=1&module=gastracker&action=gasoracle",
    "https://api.etherscan.io/api?module=gastracker&action=gasoracle"
  ];

  for (const url of etherscanUrls) {
    try {
      const data = await fetchJson(url);
      const candidate =
        data?.result?.ProposeGasPrice ??
        data?.result?.suggestBaseFee ??
        data?.result?.SafeGasPrice;
      if (candidate) {
        const gwei = parsePositiveNumber(candidate, "etherscan gas price");
        return { gwei, source: `etherscan:${url}` };
      }
    } catch {
      // Try next source.
    }
  }

  // Fallback to connected provider fee data.
  const feeData = await provider.getFeeData();
  const gasPriceWei = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPriceWei) {
    throw new Error(
      "Failed to resolve gas price. Set GAS_PRICE_GWEI explicitly, e.g. GAS_PRICE_GWEI=20"
    );
  }

  const gwei = Number(gasPriceWei) / 1e9;
  return { gwei, source: "provider:getFeeData" };
}

async function resolveEthUsd() {
  if (process.env.ETH_USD) {
    return {
      usd: parsePositiveNumber(process.env.ETH_USD, "ETH_USD"),
      source: "env:ETH_USD"
    };
  }

  try {
    const data = await fetchJson(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    const usd = data?.ethereum?.usd;
    if (usd) {
      return { usd: parsePositiveNumber(usd, "coingecko ETH/USD"), source: "coingecko" };
    }
  } catch {
    // Fallback to no USD conversion.
  }

  return { usd: null, source: "unavailable" };
}

function formatUsd(usd) {
  return `$${usd.toFixed(2)}`;
}

function formatCost(gasUsed, gasPriceGwei, ethUsd) {
  const gas = Number(gasUsed);
  const eth = (gas * gasPriceGwei) / 1e9;
  return {
    eth,
    usd: ethUsd == null ? null : eth * ethUsd
  };
}

function printRow(label, gasUsed, gasPriceGwei, ethUsd) {
  const cost = formatCost(gasUsed, gasPriceGwei, ethUsd);
  const usdPart = cost.usd == null ? "n/a" : formatUsd(cost.usd);
  console.log(
    `${label.padEnd(14)} gas=${gasUsed.toString().padStart(8)}  cost=${cost.eth
      .toFixed(9)
      .padStart(12)} ETH  (${usdPart})`
  );
}

async function estimateDeploymentGas(ethers, deployer) {
  const Adapter = await ethers.getContractFactory("StubAdapter", deployer);
  const adapterTx = await Adapter.getDeployTransaction(ethers.ZeroAddress, FIRST_ID);
  adapterTx.from = deployer.address;
  const adapterGas = await ethers.provider.estimateGas(adapterTx);

  const Auction = await ethers.getContractFactory("PulseAuction", deployer);
  const auctionTx = await Auction.getDeployTransaction(
    START_DELAY_SEC,
    K,
    GENESIS_PRICE,
    GENESIS_FLOOR,
    PTS,
    ethers.ZeroAddress,
    deployer.address,
    DUMMY_ADAPTER_ADDRESS
  );
  auctionTx.from = deployer.address;
  const auctionGas = await ethers.provider.estimateGas(auctionTx);

  return {
    adapterGas,
    auctionGas,
    totalGas: adapterGas + auctionGas
  };
}

async function main() {
  const conn = await hre.network.connect();
  const { ethers } = conn;
  const [deployer] = await ethers.getSigners();

  const { adapterGas, auctionGas, totalGas } = await estimateDeploymentGas(ethers, deployer);
  const gasPrice = await resolveGasPriceGwei(ethers.provider);
  const ethUsd = await resolveEthUsd();

  const scenarioGasPrices = process.env.GAS_SCENARIOS_GWEI
    ? parseScenarioList(process.env.GAS_SCENARIOS_GWEI)
    : [1, 5, 10, 20, 30];

  console.log("[estimate-deploy-cost]");
  console.log(`network: ${conn.networkName}`);
  console.log(`gas price source: ${gasPrice.source}`);
  console.log(`ETH/USD source: ${ethUsd.source}`);
  console.log(`assumed gas price: ${gasPrice.gwei} gwei`);
  if (ethUsd.usd != null) {
    console.log(`assumed ETH/USD: ${ethUsd.usd}`);
  }
  console.log("");

  console.log("Estimated deployment gas:");
  printRow("StubAdapter", adapterGas, gasPrice.gwei, ethUsd.usd);
  printRow("PulseAuction", auctionGas, gasPrice.gwei, ethUsd.usd);
  printRow("TOTAL", totalGas, gasPrice.gwei, ethUsd.usd);

  console.log("");
  console.log("Scenario table (override with GAS_SCENARIOS_GWEI=1,5,10,...):");
  for (const gwei of scenarioGasPrices) {
    const totalCost = formatCost(totalGas, gwei, ethUsd.usd);
    const usdPart = totalCost.usd == null ? "n/a" : formatUsd(totalCost.usd);
    console.log(
      `  ${gwei.toString().padStart(6)} gwei -> ${totalCost.eth
        .toFixed(9)
        .padStart(12)} ETH  (${usdPart})`
    );
  }

  await conn.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
