# Pulse project directory

The Pulse site may show projects experimenting with the auction mechanism. Listing is optional. An application can import Pulse calculation source or call a released Core contract without registering with Pulse or appearing on this site. The directory is maintained off-chain by editing [`projects.json`](../../evm/playground/projects.json); it is not a contract registry or a source of auction state.

## Suggest a project

Use the [public project suggestion issue](https://github.com/inshell-art/pulse/issues/new). The repository includes a dedicated issue form for this workflow once the site changes are published. A GitHub issue is public, so send public URLs and addresses only. A maintainer reviews the evidence and edits the JSON by hand. A project's own site and application contract remain the source of its current availability, ask, payments, delivery and sale history.

## Record and display rules

Each JSON entry has a stable `id`, public `name`, short `summary`, canonical `url`, `stage` and `stageLabel`, `integration` and `integrationLabel`, `evidenceUrl`, `auctionUrl` or `null`, and `checkedAt`. The file also has an `updatedAt` date. Maintain human-readable labels alongside machine values so visitors can see the exact stage without decoding a badge.

- `exploring` means no working Pulse auction is asserted.
- `local-rehearsal` means a local development path exists, with no public auction implied.
- `public-testnet` or `live` requires a public application address, chain ID, auction page, and evidence of the asserted Pulse integration. A Core address alone does not prove an application has made a sale.
- `integration` distinguishes a source import, a call to shared Core, an older standalone Pulse auction, and no integration yet. None is automatically a safer or approved project.
- Set `auctionUrl` only to the project's actual auction page after checking its public application contract and status. Keep it `null` otherwise.

Before adding or promoting an entry, open its public links and compare its claim with the project's own public source or deployment record. If it claims the shared Core, check the chain, address and runtime code hash against the corresponding Pulse release. If it claims live bidding, check the application address and its documented read/sale path; Core quotes alone are hypothetical calculations. Record the check date and revisit stale or disputed entries. A listing is editorial discovery, not certification or an endorsement of a project's contracts, payments, or promises.

The initial entries are deliberately labelled as work in progress. PATH's published v0.5.0 handoff still uses its standalone `PulseAuction` locally. signatures.gallery's current public README describes a local open-mint flow with no Pulse auction. Neither is shown as a live shared-Core adopter. Their future integration belongs in those application repositories.
