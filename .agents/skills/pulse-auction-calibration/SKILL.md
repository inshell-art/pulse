---
name: pulse-auction-calibration
description: Discuss a Pulse V1 auction in natural language and turn its pricing intent into a human decision table of opening prices, decay, and post-sale pumps. Use for Pulse parameter selection, feasibility, or revising Sig, PATH, or other auction candidates.
---

# Calibrate a Pulse V1 auction

Work with the auction owner to express the intended buyer experience, then compare configurations against it. Read [the V1 calibration reference](references/v1-calibration.md) for the mechanism, examples, and integer comparison helper.

## Discuss the intention

- Identify the work, payment unit, pricing version, and when the paid curve opens. Read application rules when relevant. Edition size, free allocation, expiry, and transaction cadence belong to the selling application.
- Ask only for missing choices that affect the comparison. Establish what the first buyer may pay, how low the opening ask may fall, which price should be reachable after how much quiet time, and how much extra a buyer should face after a sale. Clarify whether a percentage applies to the whole ask or the premium above the floor.
- Record each condition in the owner's words and as a measurable expression. Mark hard bounds, preferences with tolerances, and illustrative reference conditions. A preceding sale gap used to define a quote is a reference input. Actual paid units, cadence, and clearing prices are evidence of buying activity. Checkpoints and imposed purchases characterize the mechanism; buyer responses remain open.
- Surface the V1 floor policy early. Every paid sale permanently raises or preserves the next floor at its clearing price. If the owner needs later buyers to reach a lower price, show the conflict before choosing coefficients.

## Compare candidates

1. Set the price band, then derive the decay scale `k` from quiet opening behavior. With `k` in view, derive `pts` from post-sale quote or wait constraints. Translate buyer budgets into when those prices become reachable.
2. For the established Sig calibration policy, use exact powers of ten for raw `k` and `pts`. Confirm the policy for another auction or when the owner changes it. The contract handles a wider integer domain. Record units and the allowed grid or range explicitly. Compare the adjacent candidates when an ideal value is between grid points. For a complete menu, enumerate all pairs admitted by the agreed domain and account for failures and exclusions.
3. Verify opening quotes, subsequent quotes, bounds, and reverts with the intended release's integer implementation or its trusted executable model. Use the application’s actual start time when known. Label an assumed timestamp and an unverified application binding. If exact evaluation is unavailable, mark formula results approximate. For PATH's standalone auction, check that release before applying V1 Core results to it.
4. Show which constraints are incompatible or which candidates miss by how much. Ask the owner which requirement can move when the remaining choices depend on that tradeoff. Preserve the original grid and bounds in the record.

## Return the decision table

State the auction intention in plain language. Give the constraints with their units, timestamps or reference gaps, and priority. Include candidate values, the buyer-facing ETH or token quotes and times, and a pass or miss for each hard bound. Keep rejected candidates or give their counts and reasons if the grid is large. Explain the most relevant tradeoff in ordinary language.

Separate a recommendation from the owner's selection. Record the chosen row and its rationale when the owner supplies them. Deployment and configuration changes require their own authorization.
