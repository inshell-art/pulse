# Pulse site and playground

Authority: first-party site behavior. This document describes the simulation and directory, not a live application auction.

## Try the proposition

The playground makes hypothetical calculations using the released Pulse Core V1 on Ethereum Sepolia. It does not connect a wallet, take payment, mint an asset, or submit a purchase transaction. A simulated purchase calculates an ask and a proposed next state; its history belongs to the visitor's browser.

The browser draws previews and calls the site's read-only gateway for Core calculations. Individual calculation inputs reach an RPC provider. The site does not persist scenario history. Cloudflare and RPC providers still process network requests.

The interactive lab presents the scenario, controls, results, and local-preview or service-failure notices. The following Pulse Core implementation section holds the Core V1/Sepolia explanation, verification status, explorer link, and RPC details. The lab links to that section and keeps a brief privacy notice beside its results.

The controls are Genesis price, Genesis floor, Initial time to halfway, and Price–Time Scale (PTS). The first, second, and fourth correspond to Core configuration fields. Initial time to halfway is a convenience control used to derive k. Changing a rule starts a new hypothetical scenario; it does not change a deployed auction's rules.

Genesis price is a target; integer rounding can change the opening ask. Core V1 counts waiting from the last purchase, or opening for the first purchase, with a one-second minimum for the increase calculation. Rounding can make the actual increase exceed the PTS target; targets above k are capped by the curve. Read the indexed Core API for the exact algorithms.

## Projects and building

The project directory is optional, off-chain, and manually curated. Check each record's status, evidence links, and checkedAt date. A listing does not prove that a project currently uses the shared Core, has a live auction, or has immutable application rules.

Developers can call the released Core contract or import the calculation source. Application contracts own configuration, activation, auction state, payments, delivery, and events. PATH and signatures.gallery maintain their integrations in their own repositories. Their current auction state cannot be read from Pulse Core.

Inshell's documentation about its PATH/Pulse application describes that application's integration. It is not a substitute for the shared Core V1 specification.

## Read-only service status

GET /api/status reports the gateway's configured network, chain ID, Core address, runtime hash, version, and verification result. It is not an auction quote or application state. Production verification is cached for up to five minutes per Worker instance; the local Node preview verifies on its first gateway request and retains that identity check for the process lifetime. Static documentation remains available without RPC. The response does not provide an observation block or verification timestamp, so do not invent one or claim a fresh, block-specific chain observation.

The browser uses POST /api/call for hypothetical initialize, quote, and advance calculations. The discovery prompt only authorizes reading indexed GET/HEAD sources; it does not authorize calculator submissions, wallet actions, signatures, purchases, or changes to any application.
