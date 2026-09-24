import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const mathSource = readFileSync(new URL("src/core/PulseMath.sol", root), "utf8");
const consumerSource = readFileSync(new URL("src/mocks/PulseConsumerHarness.sol", root), "utf8");
const mathTarget = new URL("src/mocks/PulseEmbeddedMathBenchmark.sol", root);
const consumerTarget = new URL("src/mocks/PulseEmbeddedConsumerBenchmark.sol", root);
const banner = "// GENERATED BENCHMARK CONTROL — run npm run benchmark:core:generate after source changes.\n";

function replaceExactly(source, before, after, count = 1) {
  const actual = source.split(before).length - 1;
  if (actual !== count) throw new Error(`Expected ${count} occurrences of ${JSON.stringify(before)}, found ${actual}`);
  return source.replaceAll(before, after);
}

export function expectedControls() {
  let math = mathSource;
  math = replaceExactly(math, "library PulseMath {", "library PulseEmbeddedMathBenchmark {");
  math = replaceExactly(math, "calldata", "memory", 8);
  math = banner + math;

  let consumer = consumerSource;
  consumer = replaceExactly(consumer,
    'import {IPulseCore} from "../interfaces/IPulseCore.sol";',
    'import {IPulseCore} from "../interfaces/IPulseCore.sol";\nimport {PulseEmbeddedMathBenchmark} from "./PulseEmbeddedMathBenchmark.sol";');
  consumer = replaceExactly(consumer, "contract PulseConsumerHarness {", "contract PulseEmbeddedConsumerBenchmark {");
  consumer = replaceExactly(consumer, `    struct Binding {
        address core;
        bytes32 runtimeCodeHash;
        uint256 chainId;
    }

`, "");
  consumer = replaceExactly(consumer, "    error InvalidCore();\n    error WrongChain();\n", "");
  consumer = replaceExactly(consumer,
    "    event CoreBound(address indexed core, bytes32 runtimeCodeHash, uint256 chainId);\n", "");
  consumer = replaceExactly(consumer,
    "    IPulseCore public immutable pulseCore;\n    bytes32 public immutable coreRuntimeCodeHash;\n    uint256 public immutable boundChainId;\n", "");
  consumer = replaceExactly(consumer,
    `    constructor(Binding memory binding, IPulseCore.Config memory config, Application memory app) {
        if (binding.chainId != block.chainid) revert WrongChain();
        if (binding.core.code.length == 0 || binding.core.codehash != binding.runtimeCodeHash) {
            revert InvalidCore();
        }
`,
    "    constructor(IPulseCore.Config memory config, Application memory app) {\n");
  consumer = replaceExactly(consumer,
    "        pulseCore = IPulseCore(binding.core);\n        coreRuntimeCodeHash = binding.runtimeCodeHash;\n        boundChainId = binding.chainId;\n", "");
  consumer = replaceExactly(consumer,
    "        emit CoreBound(binding.core, binding.runtimeCodeHash, binding.chainId);\n", "");
  consumer = replaceExactly(consumer, "pulseCore.initialize", "PulseEmbeddedMathBenchmark.initialize", 2);
  consumer = replaceExactly(consumer, "pulseCore.advance", "PulseEmbeddedMathBenchmark.advance", 2);
  consumer = replaceExactly(consumer, "pulseCore.quote", "PulseEmbeddedMathBenchmark.quote");
  consumer = replaceExactly(consumer,
    "/// @notice Test-only application demonstrating a shared Pulse core integration.\n/// @dev The issuance ledger is intentionally not a complete ERC721 implementation.\n///      No pricing implementation is imported or deployed by this consumer.",
    "/// @notice Generated embedded-math A control for the shared-core B consumer.\n/// @dev The issuance ledger is intentionally not a complete ERC721 implementation.");
  consumer = banner + consumer;
  return [{ target: mathTarget, source: math }, { target: consumerTarget, source: consumer }];
}

export function checkControls() {
  for (const { target, source } of expectedControls()) {
    if (readFileSync(target, "utf8") !== source) {
      throw new Error(`${fileURLToPath(target)} is stale; run npm run benchmark:core:generate`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--write") {
    for (const { target, source } of expectedControls()) writeFileSync(target, source);
  } else {
    checkControls();
  }
}
