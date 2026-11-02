# Pulse site and playground

Authority: first-party site behavior. This document describes the simulation and directory, not a live application auction.

## Try the proposition

The playground makes hypothetical calculations using the released Pulse Core V1 on Ethereum Sepolia. It does not connect a wallet, take payment, mint an asset, or submit a purchase transaction. A simulated purchase calculates an ask and a proposed next state; its history belongs to the visitor's browser.

The browser draws previews and calls the site's read-only gateway for Core calculations. Individual calculation inputs reach an RPC provider. The site does not persist scenario history. Cloudflare and RPC providers still process network requests.

Pulse does not ask visitors for analytics consent. Google Analytics and its consent panel are removed in this local candidate. Optional Cloudflare audience statistics are disabled in this build: the public beacon/report dataset mapping, regional manual-mode behavior, competing-injection exclusion and remaining lifecycle conditions are not yet qualified. A future eligible configuration may measure only the exact static public /projects/ document with full-document navigation (Home/calculator remains excluded), skipping queries, fragments, sensitive referrers, downloads, prompts, APIs and automated or explicitly excluded browsers. Blank/direct or exact Projects referrers may qualify; Home-to-Projects referrers are excluded and the current external-referrer allowlist is empty. This is partial Projects coverage, not a count of all Pulse visits or people. The native beacon observes actual URLs and referrers; coarse event labels do not sanitize it. Calculator inputs are not sent as analytics events.

The existing Worker may attach a coarse country-eligibility marker to Projects HTML after a trusted request-country check; absence or off prevents any future loader. This candidate leaves its production-document setting unconfigured and all collection flags off. IP-country suppression is not proof of native RUM regional processing or worldwide legal eligibility. HTML remains no-store and raw assets do not retain the marker.

A quiet Privacy disclosure in the footer explains the measurement limits and lets visitors exclude this browser using the existing `pulse.analytics.excluded.v1` boolean. Saved scenarios, earlier analytics preferences and other functional storage are preserved; removing an exclusion is not an analytics grant and does not start measurement on that page. Excluding a measured browser saves the existing boolean and reloads that page; the next document checks the exclusion before loading a beacon. A final performance report for the already-open public Projects page may still be sent while it closes, including after exclusion. The operator accepted this next-document behavior for the finite static Projects scope; it is not activation or release approval. Removing a loaded script is not a supported stop mechanism, and reload does not guarantee cancellation of that closing-page report. Arbitrary same-document path changes are unsupported: the separate synthetic private-path final-send failure remains a failure, not a passed test or a demonstrated current production leak. Cross-tab exclusion, other lifecycle cases, actual referrer negatives, native region/cache behavior, exact site mapping and receiver ingestion remain unqualified. All qualification flags remain false. Optional collection stays off; this candidate creates no analytics cookies, new visitor IDs or custom collection proxies. Cloudflare and RPC providers still process the network requests needed to serve the site and run the separate hypothetical calculator.

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
