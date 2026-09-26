# Pulse site V1.0.1

Website patch release: `pulse-site-v1.0.1`.

This release makes Pulse's proposition, implementation, and intended uses easier to follow, and packages the Cloudflare hosting used at https://pulse.inshell.art.

## Changes since V1.0.0

- Separate the interactive experiment from Core V1's floor policy, timing conventions, and exact calculations. Clarify the Sepolia read-only call and rounding footnotes, and use the Core's configuration names in the controls.
- Place **Pulse is a DAA** immediately after Core implementation. Explain the commitment to public, fixed rules and openness to both success and failure, with application-level immutability left to each project's contract.
- Add **Where Pulse fits**, with concrete uses in experimental art and studies of price and participation.
- Bring the compact project list and **Build with Pulse** guidance onto the home page. Rename the directory's return link to **Back home**.
- Include Cloudflare Worker hosting, a bounded read-only Sepolia gateway, gateway boundary tests, and a production smoke-check script.

## Validation

The Worker build and five gateway boundary tests pass. Local desktop and mobile browser checks verify the section order, both color schemes, chart rendering, and read-only Sepolia calculations with no horizontal overflow.

Release publication also runs the repository's required EVM checks. The production smoke command is `python3 evm/playground/smoke-site.py https://pulse.inshell.art`; it checks eight public routes, the released Core identity, initialize/quote/advance calculations, and invalid-request rejection.

## Release boundary

Pulse Core V1, its ABI, release artifacts, and Sepolia deployment are unchanged. Downstream applications continue to pin `pulse-core-v1.0.0`. The site remains a simulation: it submits no purchase transactions, and scenario history stays in the visitor's browser.
