# Pulse site and playground

Authority: first-party site behavior. This document describes the simulation and directory, not a live application auction.

## Try the proposition

The playground makes hypothetical calculations using the released Pulse Core V1 on Ethereum Sepolia. It does not connect a wallet, take payment, mint an asset, or submit a purchase transaction. A simulated purchase calculates an ask and a proposed next state; its history belongs to the visitor's browser.

The browser draws previews and calls the site's read-only gateway for Core calculations. Individual calculation inputs reach an RPC provider. The site does not persist scenario history. Cloudflare and RPC providers still process network requests.

Pulse does not ask visitors for analytics consent. Google Analytics and its consent panel have been removed. The released site is OFF. This local automatic-pilot candidate proposes all five existing client values (`enabled`, `production`, `automaticInjectionDisabled`, `sourceCountryPolicyQualified`, `documentLifecycleQualified`) as true for a bounded static Projects experiment; it is not published or activated. Ordinary/default/staging configuration omits `PULSE_MEASUREMENT_DOCUMENT_ENV`. Without that separately approved temporary production binding the Worker emits an off marker, so even the proposed client cannot load a collector. Provider Manual mode alone cannot activate it.

Only exact `https://pulse.inshell.art/projects/` with no query or fragment is prospective. Home/calculator, docs/prompts/downloads/APIs, previews/local/staging, known automation, unreadable exclusion storage and excluded browsers stay off. Blank/direct or exact safe Projects referrers may qualify; Home-to-Projects entries are excluded and the current external-referrer allowlist is empty. Trusted `request.cf.country` must be a recognized country outside the fixed 32 denied countries; missing/unknown stay off. This source-country contract is not RUM receiving-data-center suppression or worldwide legal eligibility. HTML is no-store, and raw assets retain no country marker. Public scope is partial Projects coverage, not all Pulse visits or people.

The proposed true qualification values mean only the accepted narrow contract: observed M3 allowed/denied response behavior with source/cache tests, the reviewed no-competing-injection/manual configuration, and static full-document navigation with next-document exclusion. Retained tests observed cross-tab reload, opaque-origin storage failure, tab-hide/resume and one BFCache restoration followed by source-owned reload/exclusion. Broader native HTTPS referrers, normal first-party storage policies and universal lifecycle/cache behavior remain unqualified. The separate private-path final-send FAIL remains unsupported; the page must not gain private/SPA/same-document routing without review. No gate is removed, no external referrer is added, and no test result is promoted to general browser safety.

After all guards and duplicate-SDK checks pass, the loader sets a strict-origin document meta immediately before one SDK; the SDK file uses no-referrer and `spa:false`. The served HTTP policy stays no-referrer. The whole measured document then has an origin-only default for later requests; explicit noreferrer links and the SDK file keep stricter policies. This does not sanitize incoming referrers or SDK payload URLs. Other/ineligible documents get no policy meta. The existing Privacy disclosure explains this tradeoff and browser exclusion. Saved scenarios, old analytics preferences and functional storage are preserved. Exclusion reloads an already measured document; a final public performance report may remain, including after exclusion. Removing exclusion does not start collection on that document. Script removal is not a reliable stop mechanism.

A later automatic pilot would be a short public window, not operator-only: other eligible visitors and old manual-SDK documents sharing the receiver may send. Cloudflare receives normal page URL/referrer/performance and request/browser metadata. Its per-tab observation budget is not a cap on public traffic, and report rows cannot all be attributed to the operator. OPS's earlier native origin-only diagnostic returned one accepted SDK POST and correlated processed receipt; it changed the settling margin too, so it did not isolate earlier receiver rejection or prove this automatic path. A live pilot still requires separate source/staging/production/provider authority, capture capability, fresh SDK/access/capacity checks and exact OFF restoration. Restoration closes new eligibility; it cannot recall already-issued or stale-tab reports. Diagnostic dates for both shared hosts remain quarantined, firstFullProductionDay stays null and reader qualification flags remain off. No cookies, visitor IDs, custom sender/proxy or operator allowlist is introduced. Calculator inputs are not analytics events; Cloudflare and RPC providers still handle the separate site/gateway requests.

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
