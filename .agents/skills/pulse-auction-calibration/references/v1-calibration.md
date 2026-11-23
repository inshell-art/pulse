# Pulse V1 calibration reference

Use the [frozen Core V1 contract](https://github.com/inshell-art/pulse/blob/a08ec26e396b9d3e20ccebd8871f176368bcd713/evm/src/core/PulseMath.sol) and [executable V1 specification](https://github.com/inshell-art/pulse/blob/a08ec26e396b9d3e20ccebd8871f176368bcd713/evm/test/helpers/pulseCoreSpecModel.js) to verify candidate values. Use the relevant application release for deployment constants, activation policy, and settlement behavior.

## Translate the owner’s language

| Owner’s intention | V1 expression and tradeoff |
|---|---|
| I’m comfortable with the first buyer paying about `A` immediately. | Set `genesisPrice` to the opening target. Confirm the actual opening quote, since the contract rounds the anchor to a whole second. An early sale can set a high permanent floor. |
| Before any sale, a patient buyer should be able to approach `F`. | Set `genesisFloor`. Budgets below the floor are out of reach. After the first sale the clearing price replaces this floor. |
| If nobody buys, halve the opening premium in `H` seconds. | Set `k = (A-F) H` in raw price units times seconds. With `A=0.0055` and `F=0.005` ETH, half the premium gives an ask of `0.00525 ETH`. Half the entire ask would be below the floor. |
| After a preceding gap of `w` seconds, a sale should immediately add `R` above the price paid. | Start from `pts = R/w` in raw price units per second and verify integer rounding. Longer preceding gaps target a larger pump. Raising `pts` also raises the surviving premium at a fixed later time with `k` held fixed. Some buyers may then need to wait longer to reach their ceilings. |
| A buyer with ceiling `B` should get a chance to buy within `t` after a sale at `S`. | With `B>S`, solve for the time until the ask reaches `B`. With `B<S`, the last-sale floor makes it unreachable. If further purchases arrive, each starts a new curve. |

## Mechanism and coupled constraints

In the continuous approximation, opening ask at time `t` is `F + (A-F)/(1+t(A-F)/k)`. To reach a whole ask `B` after `t` with `F<B<A`, solve `k = t(A-F)(B-F)/(A-B)`. A deadline needs a quote at or below the target at that time. If the owner specifies the first second it becomes reachable, check both that second and the preceding second with the integer model.

After a purchase at `S`, let `w` be the preceding gap and `u` the elapsed time since that purchase. Set `D = pts * max(w, 1 second)`. The continuous next ask is `S + D/(1+uD/k)`. Its first premium-halving time is `k/D`. A buyer with `B>S` reaches their ceiling after `max(0, k/(B-S)-k/D)` seconds, conditional on no subsequent sale.

Use these expressions for intuition and inverse calibration. For example, to target premium `R` still present after `u`, solve `pts = R/[max(w,1)*(1-R*u/k)]` when `R*u<k`. The exact V1 bound for `u>0` is `quote − S ≤ floor(k/u)` in raw units. That permits a cap on the premium at a stated delay across all preceding gaps, while `k` also sets the opening decay. Exact verification uses integer offsets, integer division, one-second handling, and the deployed release’s validity checks.

## Worked grid example

Illustrative intent. Open at `0.0055 ETH` with a starting floor of `0.005 ETH`. By one quiet minute, the ask should reach `0.00525 ETH` or lower. A purchase following a ten-minute wait should add about `0.000060 ETH` immediately. Treat that pump value as exact only if the owner asks for exactness.

`k=3×10^16` wei·s hits the one-minute target exactly. Under a strict powers-of-ten grid with the same spread, the neighboring candidates are:

| `k` (wei·s) | `pts` (wei/s) | Opening premium half-time | Ask at 60 seconds | Initial premium after a 600-second gap | Premium 600 seconds after that sale | One-minute bound |
|---:|---:|---:|---:|---:|---:|---|
| `10^16` | `10^11` | 20 seconds | 0.005125 ETH | 0.000060241 ETH | 0.000013055 ETH | Pass |
| `10^17` | `10^11` | 200 seconds | 0.005384615 ETH | 0.000060024 ETH | 0.000044131 ETH | Miss |

An exact one-minute requirement admits neither row. Both pump values are rounded for display, and the owner decides whether they fit the intended tolerance. Powers of ten are applied to raw `k` and `pts`. Human-facing amounts can be decimal, such as `10^-2 ETH = 0.01 ETH = 10^16 wei`. A finite grid always makes its exponent range explicit.

## Evaluate the table with the integer model

From the skill directory run `node scripts/compare-v1.mjs path/to/trusted/pulse/evm/test/helpers/pulseCoreSpecModel.js < intake.json`. Use an existing trusted Pulse checkout of the intended release. The helper reads JSON from stdin, executes local pure calculations, and returns every supplied pair with its measured values and status.

```json
{
  "genesisPrice": "5500000000000000",
  "genesisFloor": "5000000000000000",
  "startTime": "1790985600",
  "kValues": ["10000000000000000", "100000000000000000"],
  "ptsValues": ["100000000000"],
  "opening": [
    {"label": "reachable in one minute", "afterSeconds": "60", "maxWei": "5250000000000000"}
  ],
  "afterSale": [
    {"label": "ten-minute wait pump", "priorWaitSeconds": "600", "afterSeconds": "0"},
    {"label": "ten minutes after the sale", "priorWaitSeconds": "600", "afterSeconds": "600"}
  ]
}
```

Amounts, seconds, and coefficients are decimal integer strings. Opening checks measure the ask. Each `afterSale` check advances from the initial state at `startTime + priorWaitSeconds`, then measures the remaining premium above that sale. The premium depends on the preceding gap for any V1 epoch. Add it to an explicitly supplied clearing price when evaluating a later buyer’s absolute ceiling. Use `minWei` and `maxWei` for inclusive hard bounds. Omit them for a checkpoint used to compare preferences. Record preference tolerances and application restrictions in the human decision table.
