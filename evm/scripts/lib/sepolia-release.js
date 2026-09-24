import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { JsonRpcProvider, Wallet, getAddress } from "ethers";

const expectedAddress = "0x3e4fA9f09d8EDe66561145E1ef3bc127F80ED396";
const expandHome = (path) => path.startsWith("~/") ? `${homedir()}/${path.slice(2)}` : path;

function fileEnvironment(path) {
  const entries = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    assert(match, "Sepolia environment file contains a non-assignment line");
    entries[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return entries;
}

export async function sepoliaContext() {
  const envPath = process.env.PULSE_SEPOLIA_ENV_FILE
    ?? `${homedir()}/.opsec/path/env/sepolia.env`;
  const settings = { ...fileEnvironment(envPath), ...process.env };
  const rpcUrl = settings.PULSE_RPC_URL ?? settings.SEPOLIA_RPC_URL;
  const keyStorePath = settings.PULSE_SEPOLIA_KEYSTORE_JSON ?? settings.SEPOLIA_DEPLOY_KEYSTORE_JSON;
  const passwordPath = settings.PULSE_SEPOLIA_PASSWORD_FILE ?? settings.SEPOLIA_DEPLOY_KEYSTORE_PASSWORD_FILE;
  assert(rpcUrl && keyStorePath && passwordPath, "Sepolia RPC/keystore/password paths are incomplete");
  const provider = new JsonRpcProvider(rpcUrl);
  try {
    assert.equal((await provider.getNetwork()).chainId, 11155111n, "Sepolia RPC has the wrong chain ID");
    const password = readFileSync(expandHome(passwordPath), "utf8").trimEnd();
    const wallet = (await Wallet.fromEncryptedJson(readFileSync(expandHome(keyStorePath), "utf8"), password)).connect(provider);
    assert.equal(getAddress(wallet.address), getAddress(expectedAddress), "Unexpected Sepolia deployer");
    return { provider, wallet, deployer: getAddress(wallet.address) };
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

export async function checkedSend(wallet, request, gasLimit) {
  const provider = wallet.provider;
  const fee = await provider.getFeeData();
  assert(fee.maxFeePerGas != null && fee.maxPriorityFeePerGas != null, "Sepolia EIP-1559 fee data unavailable");
  assert(fee.maxFeePerGas <= 20_000_000_000n, "Sepolia max fee exceeds 20 gwei release cap");
  assert(fee.maxPriorityFeePerGas <= 1_000_000_000n, "Sepolia priority fee exceeds 1 gwei release cap");
  const balance = await provider.getBalance(wallet.address);
  assert(balance >= gasLimit * fee.maxFeePerGas + (request.value ?? 0n), "Sepolia signer lacks fee ceiling balance");
  return wallet.sendTransaction({ ...request, gasLimit, type: 2,
    maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas });
}
