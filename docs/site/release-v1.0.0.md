# Pulse site V1.0.0

Stable source release: `pulse-site-v1.0.0`.

Pulse's first-party site presents the auction proposition as a single reading column: the supply–demand question, waiting drops and buying pumps, then an interactive experiment. Dutch auction decay and Price–Time Scale explain the two movements. Core V1's floor ratchet is documented separately as a practical implementation choice.

## Included

- Read-only Sepolia playground using the released Pulse Core V1, with browser-local settings and simulated purchase history.
- Verified chain, contract runtime hash, and version at gateway startup; bounded calculation requests and sanitized API errors.
- System-controlled light/dark themes, including charts and controls, and a responsive layout.
- Optional, manually curated project directory and a public project suggestion issue form. Initial projects are explicitly labelled as work in progress.
- Updated repository scope and downstream integration pointers.

## Validation

- 223 tests pass under the Core release compiler profile.
- The frozen Core build still matches runtime hash `0xfb48657163202d3cdb28060f1eb511fd1f5b93a6e0eb8657242b5632e2200a90`.
- Site routes and read-only Sepolia initialize, quote, and advance calls pass smoke checks; invalid requests are rejected.
- Desktop/mobile visual checks pass, including both color schemes and live system-theme changes without losing the scenario.
- The staged release files pass a redacted secrets scan.

## Release boundary

This is a website source release. Pulse Core V1, its ABI, release artifacts, and Sepolia deployment remain unchanged; downstream applications continue to pin `pulse-core-v1.0.0`.

The site is available locally with `npm run playground`. The chosen public domain is `pulse.inshell.art`; hosting, DNS, and a production hosting review are pending. The lab simulates purchases and does not move funds, mint assets, or submit transactions. Individual calculation inputs reach the Sepolia RPC, while scenario history remains in the browser.
