# Pulse site and lab

This is the first-party Pulse website. It explains the decentralized automatic auction mechanism, offers a read-only lab backed by the released Sepolia Core, and maintains an optional [off-chain project directory](../../docs/site/project-listing.md). A project can call Core or import the math without registering or appearing in the directory. The directory is editorial discovery, not a contract registry, auction-state source, or endorsement.

Both pages follow the system light/dark preference automatically, including chart colors and form controls. No theme preference is stored.

The public site is **https://pulse.inshell.art**, served by the Cloudflare Worker `pulse-site`. First published on 2026-09-26, with HTTPS routes and read-only Sepolia Core calculations verified. Latest tagged website release: [`pulse-site-v1.0.2`](https://github.com/inshell-art/pulse/tree/pulse-site-v1.0.2), commit `32adfe39e1bf775f387ddab698780f256ed0cc81`. The October 16 static review confirmed index r7 is already published. The October 31 release added optional consent-first analytics and shipped the Issues configuration; see [Publish on Cloudflare](#publish-on-cloudflare). Local preview remains available for development.

The narrative separates the proposition (waiting drops, buying pumps), its mechanisms (Dutch auction decay and Price–Time Scale), and Core V1's practical floor policy (next floor equals previous sale price). A dedicated **Pulse Core implementation** section follows the lab, before the Core V1 use cases. It explains the floor ratchet, its simplicity and intended constraint on further issuance, and the separation between Core's calculations and application-owned state. The ratchet is a practical choice, not a requirement of the broader proposition, a fixed supply cap, or a guarantee that sales eventually stop. The waiting-time convention and V1-specific mathematics sit in a collapsed disclosure here. The Sepolia-call and rounding footnotes also live here, linked from the lab’s calculation readouts. Core V1 attribution, network verification status, the explorer link, and RPC details are grouped here too. The lab keeps the experiment, controls, results, a brief privacy note, and plain-language notices for pending calculations, local previews, or service failures. The lab demonstrates this released V1 policy.

The home page reads as one column: question → proposition → examination. Its opening states the supply–demand question; one highlighted equation connects the waiting time with the Price–Time Scale. The proposition’s continuous drop and PTS equations sit in its mathematics disclosure; the floor-dependent next-curve equation and integer calculations belong to the implementation section. The lab leads with one chart and a plain-language result; calculation details, rule settings, and purchase history are optional disclosures. The mechanism explanation flows from waiting and buying into their market meaning: participants shape the price under public, fixed rules. **Decentralized Automatic Auction (DAA)** names that conclusion, with success and failure both treated as outcomes to learn from. The optional mathematics follows this complete narrative. The Core implementation section explains that each project must enforce the commitment in its own application; the stateless calculator alone cannot guarantee it. The `#daa` link remains available. The **Where Pulse Core V1 fits** section follows Core implementation, scoping the examples to V1’s floor ratchet rather than the broader proposition. It distinguishes experimental art that makes the auction part of the work from studies of Core V1 through simulations or separate auctions with different fixed settings. A compact project list follows, with a name, stage, and one-line description per project. The header jumps to this section; `/projects` retains the full summaries and evidence links. Both views use the same `projects.json` data. A compact **Build with Pulse** section follows the projects, explaining shared-Core calls and source-library imports, with links to integration instructions, the calculation source, and the Core V1 release. The header links to both sections; Build is the final section. A simulated purchase leaves the clock at the purchase instant so the immediate price jump is visible; the visitor moves time forward to make the next purchase.

## Ask your agent

Both pages have a compact **Ask your agent about Pulse** guidance strip immediately below the header. **Get prompt** expands the copyable prompt and links to `/docs/agent-index.json` and `/docs/agent-prompt.txt`. The prompt points to the current origin, so local previews use their own unpublished index. Clipboard failure selects the visible prompt for manual copying. The public prompt file uses the canonical `https://pulse.inshell.art` URL.

The index separates project intent, site behavior, frozen Core semantics, reference integrations, release records, directory entries, and gateway status. Core documentation and artifacts use immutable Git commit URLs with SHA-256 digests. Local topic documents and the curated project list also have digests. Status at `/api/status` is explicitly a cached identity check without an observation block/time, not an application auction state. Discovery is GET/HEAD only and never authorizes wallets or transactions. If an agent's browsing service cannot retrieve a source, the prompt permits one attempt at the same URL through another available read-only HTTP tool. It requires successful retrieval and reading before the readiness acknowledgement; an agent with no working fetch tool must report the missing source instead.

When updating an indexed document or project list, update its digest and the index revision. `node --test evm/playground/knowledge.test.js evm/playground/worker.test.js` checks source consistency, the exact public build contents, static GET/HEAD routes and media types, and gateway boundaries. `public-assets.js` is the shared allowlist for the Node preview, Worker, and build; server source and private files are never copied by a directory-wide glob.

## Document downloads

Published index revision `2026-09-27-r6` adds one complete JSON export for each of the ten reviewed static sources. See [the public format and coverage specification](docs/document-format.md). Original `url`, `sourceCommit`, and source `sha256` semantics remain intact. Each additive `download` descriptor supplies the same-origin file URL, schema, media type, byte length, and final envelope hash. A JSON source is retained as text, preserving large numbers and formatting.

`docs/agent-index.json` remains the single authored catalog, including an explicit empty media inventory for these ten sources. **The served index is generated:** `generate-knowledge.js` adds descriptors without modifying the catalog file. It reads the local topic documents/project list and pinned Git objects offline, rejecting stale hashes or invalid UTF-8. `public-assets.js` derives document and companion-asset routes from that catalog; neither the Worker nor browser imports the Node generator. The build writes only to `output/pulse-site`; no Core artifact changes. The Node preview generates the same bytes once at startup, so restart it after catalog or document changes.

The index's pinned Git objects must exist in the checkout. A shallow clone missing them must obtain the reviewed commits before building; the generator does not silently use current files or fetch remote replacements. Linked code/tests/reviews and historical plans are references, not automatically exported evidence. Scope and media inventory are documented in the format specification.

Local review URLs:

- `http://127.0.0.1:4173/#agent-guide`
- `http://127.0.0.1:4173/docs/agent-index.json`
- `http://127.0.0.1:4173/docs/documents/core-api.json`
- `http://127.0.0.1:4173/docs/document-format.md`

Validation:

```bash
node --test evm/playground/knowledge.test.js evm/playground/worker.test.js
node evm/playground/build-site.js
python3 evm/playground/smoke-public-access.py http://127.0.0.1:4173
# Separate website/playground regression, including live Sepolia calls:
python3 evm/playground/smoke-site.py http://127.0.0.1:4173
# Download/save/local-analysis workflow, in an authorized directory:
python3 evm/playground/smoke-public-access.py http://127.0.0.1:4173 --ids core-api core-abi --save-dir /tmp/pulse-doc-review
python3 evm/playground/smoke-public-access.py --offline-dir /tmp/pulse-doc-review
```

The public-access smoke client supports r6 and later downloads. Its default checks require no website runtime, RPC or GitHub access. It first saves the index and selected JSON files, then disables Python socket/DNS/HTTP access before hashing, parsing, extracting and searching local documents. `--offline-dir` repeats analysis in a fresh process with networking disabled from the start. Without `--save-dir`, it uses an automatically cleaned temporary workspace. The integration suite runs a copied standalone client outside the repository, checks all ten extracted texts and both hashes, exercises Node without RPC configuration, tests wrong-chain rejection, and checks the bundled Worker against actual built assets. Downloads remain accessible during gateway failure. No broad CORS or Cloudflare security setting changes are needed.

Local validation on 2026-09-27: all 12 knowledge/gateway tests passed, including exact Node/bundled-Worker GET/HEAD bodies and a standalone ordinary-HTTP client outside the repository. Both local smoke checks passed with real read-only Sepolia calculations. The generated 24-file website passed a redacted gitleaks scan. Desktop review confirmed the guide, preview-origin prompt, copy-button success state, and rendered chart (five SVG paths; no horizontal page overflow). Clipboard contents could not be independently verified through the browser bridge. A fresh mobile check was not completed: native browser interaction was interrupted and the bridge requested an extension update. Layout styles are unchanged by this download-layer task; earlier mobile checks remain recorded above.

This supports agents with a permitted HTTP tool; it does not make a URL appear in a hosted search index, override a tool's policy, or guarantee compatibility with all agents. Source links remain provenance and status remains separate optional evidence. The prompt in local previews continues to use the preview origin.

**Published follow-up, index r7:** the primary prompt workflow is direct HTTP download from a known URL → save in the agent’s authorized workspace → read and analyze locally. No search engine or hosted reader is a prerequisite. Documentation readiness needs no pricing execution, rendering script, gateway status or chain verification. Live verification requires a distinct user request. The September 27 local checks passed all 12 knowledge/gateway tests, including ten-document offline replay and selective downloads. On October 16, OPS verified all 24 allowlisted public static files match the offline-generated source byte-for-byte, including index `2026-09-27-r7`. This supersedes the earlier unpublished-r7 wording; static parity does not establish fresh Worker configuration, RPC identity, browser behavior or alert delivery.

## Calculation terminology

The controls use the Core contract names: **Genesis price** (`genesisPrice`), **Genesis floor** (`genesisFloor`), and **Price–Time Scale (PTS)** (`pts`). Genesis price is an initial target; the opening ask can differ after integer rounding. **Current floor price** refers to `state.floorPrice`, which changes after each simulated purchase. **Initial time to halfway** is a convenience control, not a Core field: the lab derives `k = (genesisPrice − genesisFloor) × initialHalfwaySeconds`. PTS is displayed in ETH/hour and converted to raw payment units/second for Core. **Target price increase**, **Actual price increase**, and **Next ask** are derived readouts, not additional configuration fields. Browser storage keys remain unchanged so saved scenarios still load.

## Run locally

From the repository root:

```bash
cd evm && npm install
cd .. && npm run playground
```

Open <http://127.0.0.1:4173>. Set `PULSE_PLAYGROUND_PORT` to change the local port. The server binds to `127.0.0.1` by default. It reads `PULSE_RPC_URL` or `SEPOLIA_RPC_URL`, falling back to `~/.opsec/path/env/sepolia.env` for the local workspace. The RPC URL stays on the server.

Static documents start without RPC configuration. On the first gateway request, the server checks the Sepolia chain ID, Core runtime code hash, Core version, and a sample calculation against the [release record](../releases/pulse-core-v1/sepolia.json). If the configured endpoint is `ethereum-sepolia-rpc.publicnode.com`, it also verifies `sepolia.gateway.tenderly.co` as a fallback. An explicitly configured private RPC does not get a public fallback. Failed verification returns 503 and may be retried after five seconds; concurrent initial requests share verification. No calculation runs before identity verification. Successful local verification is retained for the process lifetime.

## Publish on Cloudflare

Agent-guide publication (2026-09-27): Worker version `cff6f7a8-a9dd-4ec9-a668-ed94f8c9ee9e`, tagged `site-20260927-agent-guide`, was deployed at 100% before the public-access update below. All 12 public assets were verified byte-for-byte against the reviewed build. Production smoke checks passed for 13 routes, indexed document digests and HEAD requests, the released Sepolia identity, initialize/quote/advance/next-quote calculations, and invalid-request rejection. Desktop and mobile browser checks passed for the agent prompt, narrative, Core details, and chart with no horizontal overflow. Pulse Core and its release are unchanged. This publication did not create a new Git release tag.

The public-access update on 2026-09-27 deployed Worker version `ff09d48f-304f-45d6-93c4-346718599511` (`site-20260927-public-access`) at 100%. It adds the public `robots.txt` route; the other 12 assets are unchanged. Its Worker rollback target is `cff6f7a8-a9dd-4ec9-a668-ed94f8c9ee9e`. The earlier `pulse-site-v1.0.1` Worker version is `29a3d668-3654-43f3-ab15-a58ce7701daf`.

Previous production: Worker version `067a4f85-b5e3-48f8-9eb2-f46de53a190b` (`site-20260927-reader-fallback`), deployed at 100% on 2026-09-27. Only the prompt and knowledge index assets changed from the public-access update; index revision is `2026-09-27-r5`. At publication, both assets matched the then-current local source byte-for-byte. All eight local knowledge/gateway checks and both production smoke checks passed. The published prompt was also verified through the site's disclosure. Roll back this publication to `ff09d48f-304f-45d6-93c4-346718599511`; the existing BIC rule is unchanged. No new Git release tag was created.

Historical r6 publication: Worker version `7a6cdf91-ba2c-4a3f-8f4b-5d202e0ad5c1` (`site-20260927-document-downloads`), deployed at 100% on 2026-09-27. Index revision was `2026-09-27-r6`. It published all ten complete JSON exports, additive download descriptors and the format guide. All 25 public routes (24 unique files) matched the reviewed build byte-for-byte, private/unknown paths returned 404, and both production smoke checks passed, including ordinary default-HTTP document downloads and live read-only Sepolia calculations. Browser asset verification used a browser User-Agent; documentation acceptance used Python's default User-Agent. No Cloudflare security or domain binding change was made. That publication's rollback target was `067a4f85-b5e3-48f8-9eb2-f46de53a190b`; no new Git release tag was created at that step.

Consent-first analytics release on 2026-10-31: Worker version `65d09b2d-9b8d-4414-8f2d-fdd963281830` (`ga4-consent-f512df7`), built from `f512df7` and merged in [PR #3](https://github.com/inshell-art/pulse/pull/3), deployed at 100% at about 07:51 China time. The same source was first checked on the staging Worker `pulse-site-staging` (version `2a5fcdc2-a540-4e61-bfdc-77b27b9762e0`). The production smoke check passed for 14 routes, indexed document digests, the released Sepolia identity, read-only calculations and invalid-request rejection. 25 of 26 public files matched the build byte-for-byte; `robots.txt` carries Cloudflare's managed prefix with the built text intact. The release also shipped the Issues configuration below. No new Git release tag was created.

**Dated provider record, October 31:** serving version `65d09b2d-9b8d-4414-8f2d-fdd963281830` (`ga4-consent-f512df7`); rollback target `77aae848-5919-41a9-a12d-aedfae1df011` (`site-20260927-local-doc-workflow`), read from the provider as the serving version before the release. This supersedes the October 11 record (serving `77aae848`, previous `7a6cdf91-ba2c-4a3f-8f4b-5d202e0ad5c1`). Before any release, read the actual serving version and settings and retain that version as rollback. Do not use the historical r6 label as current production or automatically select it for recovery.

### Public agent access

Cloudflare configuration rule **Pulse public read-only sources - BIC exception** (`b41c00536f404145b0b0d045cf9f34cd`) disables only Browser Integrity Check for this expression:

```text
(http.host eq "pulse.inshell.art" and http.request.method in {"GET" "HEAD"} and (starts_with(http.request.uri.path, "/docs/") or http.request.uri.path in {"/" "/projects" "/projects/" "/projects.json" "/api/status" "/robots.txt"}))
```

The existing staging configuration rule was preserved. Other hosts, methods, and paths remain outside the exception, including POST `/api/call`. The rule was applied through the authenticated dashboard because the operational deployment token lacks permission to manage security/configuration rules. To roll back this exception, disable this named rule; Worker rollback does not change zone rules.

Run `python3 evm/playground/smoke-public-access.py https://pulse.inshell.art` to test agent discovery with Python's unmodified default User-Agent. The r5 check verified nine public GET/HEAD routes, all ten original source digests, crawler guidance, and the Sepolia identity. These checks passed after that publication; previously default Python requests received Cloudflare 403 / error 1010. `robots.txt` permits public documentation and the read-only status endpoint while disallowing crawler access to other `/api/` paths. Robots guidance is not access control.

On 2026-09-27, the session's separate web-reading service still returned opaque inaccessible-URL errors for Pulse and the parent Inshell knowledge index. Default HTTP requests and diagnostic requests carrying ChatGPT-User, Claude-User, and Perplexity-User headers received HTTP 200 with the expected index. These header tests do not prove requests from those providers' infrastructure work. Cloudflare's Pulse-filtered sampled security events showed no corresponding new block, and AI Crawl Control showed ChatGPT-User and OAI-SearchBot allowed. The sampled records cannot prove a request never reached Cloudflare. A temporary Worker trace could not connect (`ECONNRESET`), so it supplied no additional evidence. No broader security exception was applied. The reader-service failure remains unconfirmed; the prompt's alternate HTTP fetch supports agents that have that capability, but does not repair or establish compatibility with every browsing service.

The Cloudflare Worker serves the allowlisted browser assets, public documentation, and a read-only Sepolia gateway. The default environment binds only `pulse.inshell.art` and disables the workers.dev and preview addresses. Updates to the existing Worker use the version upload/deploy flow below, with `--env=""` explicitly selecting that default target. Use the existing Cloudflare account and an authorized Worker deployment credential, supplied through the standard `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables. Keep credentials outside this repository. No signer, database, KV namespace, or paid-plan change is needed.

The Worker uses public Sepolia RPC endpoints with failover, verifies the chain, released runtime hash and version before calculations, and refreshes that verification every five minutes per isolate. Only `initialize`, `quote`, and `advance` calls to the pinned Core address are accepted. Inputs have byte-size and ABI-width bounds; upstream calls have timeouts. Rate and concurrency limits apply per isolate, not as an account-wide quota. The application does not persist calculation requests. Cloudflare Issues is enabled in production; Workers Logs and Traces remain disabled. Cloudflare and RPC providers still handle network requests, and Google receives page views only from visitors who allow [optional analytics](#optional-analytics). Issues collection is saved on, but actual issue detection and alert delivery are not yet qualified.

Run `node --test evm/playground/worker.test.js` from the repository root for gateway boundary tests. After deployment, run `python3 evm/playground/smoke-site.py https://pulse.inshell.art` to verify HTTPS routes and actual Sepolia calculations.

The initial publication used the Worker custom-domain API after Wrangler uploaded the site: the deployment credential permitted custom domains but not the zone's Worker-route listing. The domain connection was checked for conflicts and added without replacing existing DNS records or services. For separately authorized code and asset updates on that existing binding, use `npx wrangler@4.147.0 versions upload --env="" --tag <reviewed-candidate-tag>`, then `npx wrangler@4.147.0 versions deploy <uploaded-version-id>@100% --env="" --yes`. Replace the tag placeholder with the reviewed candidate's identifier, record the returned version ID, and deploy that exact version; this flow leaves the existing domain binding in place. A full `wrangler deploy` also needs access to the zone's Worker routes.

### Issues configuration (prepared October 12; revised October 21; live October 31)

Issues is live in production. It shipped on October 31 with the consent-first
analytics release (Worker version `65d09b2d`, source `f512df7`). Read back
before and after that release: Issues on, Logs and Traces off; Issues was
already saved on before it. `wrangler.jsonc` enables `observability.issues.enabled`
while keeping the default observability switch, Logs and Traces off, for both the
default and staging targets. Use Wrangler 4.147.0; the old 4.94.0 commands do not
support the Issues flag. Issues requires Wrangler 4.134.0 or newer
([provider documentation](https://developers.cloudflare.com/workers/observability/issues/)).
The Issues change does not alter application, Core, RPC, assets or alert rules.
The October 16 candidate also included the local-devnet smoke timing fix, now
committed separately at `21854bd`. On October 21 the staging proposal was dropped
because Issues alone needed no new Worker. The analytics release then provisioned
the staging Worker `pulse-site-staging` at `pulse-staging.inshell.art` on
October 31. The default production domain remains unchanged.

Reuse Inshell's existing enabled account-level **Inshell ops - Worker runtime
issues** rule (`aecd0b3941254c1c856524105b845790`) and its current this.inshell/private
email routing. No duplicate rule or new phone relay is needed. This records the
reviewed configuration, not a guarantee that each issue produces a delivered alert.
Issues detects new exceptions, invocation failures, HTTP 5xx and logged errors;
it does not backfill historical traffic. Routine successful traffic alone cannot
qualify real issue detection or delivery. Do not generate a production failure or
send a notification test without separate authorization.

Before a later release, review the exact candidate and the existing Worker's
capacity, deployment access, serving version and observability settings. Follow
local checks → staging → candidate review → production approval → update →
verification. Freeze the exact candidate source/configuration and verify its public
assets against the build. Record the actual uploaded/deployed source and Worker
version. Preserve the existing domain/security rules and Core identity. Gallery's
scoped Wrangler profile is not an Inshell/Pulse deployment credential.

Saved collection is confirmed by the October 31 read-back. Actual issue detection
and notification receipt are tracked separately and are not yet qualified. After
any later rollout, read back Issues enabled with Logs/Traces disabled, confirm the
existing account rule and recipients remain intact, and verify public pages/docs.
Live gateway checks require separate authorization. Keep the currently serving
version as rollback and read its identity before release; a code rollback may
affect observability settings, so verify those separately. A source rollback
should revert only the monitoring change through review.
No new subscription, credentials, signer or deployment is authorized by this note.

### Release checks and recovery

Build from an isolated candidate checkout with the catalog's pinned Git objects.
The build replaces `output/pulse-site` inside that checkout; do not build two
candidates concurrently in one checkout. Run the existing knowledge/Worker suites,
verify 26-file asset parity and scan the built assets for secrets. The Issues
configuration alone does not require a new Core deployment or browser layout
qualification.

Local-only preparation, from `evm/playground/`:

```sh
npx wrangler@4.147.0 deploy --env="" --dry-run --no-autoconfig
```

Before an authorized update, record the actual serving version and saved
observability settings for `pulse-site`. Preserve `pulse.inshell.art`, its existing
binding, BIC exception, all other protection and alert recipients. After approval,
use the existing-binding version upload/deploy commands above and retain the
returned candidate version ID. A version upload alone does not prove saved Issues
state. Use `--env=""` for all version upload/deploy and recovery commands.

| Recovery layer | Required action and verification |
| --- | --- |
| Source | Retain the reviewed base and candidate; revert only the monitoring delta through review, preserving subsequent unrelated changes. |
| Worker/code/assets | Read and retain the actual serving version before promotion. Restore that explicit same-Worker version, then verify serving identity and public asset hashes. |
| Observability | Read back Issues, Logs and Traces after promotion or rollback. If needed, restore the recorded pre-change settings explicitly; do not assume a code rollback alone restores collection. Keep Logs/Traces off. |
| Zone and account settings | Worker rollback does not restore domain/DNS/Access/BIC/security rules or notification policies. These are unchanged by this batch; verify them independently and do not alter them as an incidental recovery step. |

After release, verify the serving version, saved Issues on/Logs+Traces off,
public-document download/replay and public asset parity. Cloudflare's managed
`robots.txt` prefix can differ from the built file; verify that its original
content remains intact. Keep the existing domain/security rules and account alert
settings unchanged. Actual issue detection and notification receipt remain
separate natural-event evidence; no failure injection, notification test or
THOUGHT Agent canary is required by this candidate.

### Local-devnet CI timing repair

The September 27 [CI run](https://github.com/inshell-art/pulse/actions/runs/36314378523)
passed 223 unit tests and deployment, then failed the smoke bid's gas estimate.
Its retained node log records `AUCTION_NOT_OPEN`: deployment schedules opening
60 seconds ahead while the old smoke script bid immediately. Pre-open quoting
is valid and does not imply the auction accepts bids.

`smoke-local-eth.js` now requires localhost/chain 31337, reads the contract's
opening time, and advances/mines the devnet to opening when needed before
quoting and estimating. It also fails on settlement/state check mismatches.
The deployment delay and contract opening guard remain intact. No Core or
dependency change is part of this fix.

For local verification, run `npm test` in `evm`, start a fresh `npm run node`,
then run `npm run deploy:local:eth`, `npm run smoke:local:eth` and
`npm run scenario:local:eth`. Require the scenario report's five steps and
`summary.allChecksPass === true`; its existing script prints this result without
failing the process on false. Check the smoke once before opening and again
after opening so neither path depends on wall-clock waiting.

Local candidate validation on October 16: all 223 EVM tests and all 12
knowledge/gateway tests passed. A fresh chain-31337 devnet passed deployment,
the pre-open smoke path, the already-open smoke path and all five cascade steps
with every recorded check true. Wrangler 4.147.0 resolved both configurations
and passed local-only dry runs; Issues is true and Logs/Traces false in each.
All 24 built public files match the October 16 recorded r7 hashes. These are
local results, not a new GitHub Actions result, live Sepolia/browser verification
or proof of issue collection/alert delivery. The staging configuration checked
then was withdrawn on October 21. The October 31 analytics release added the
current staging target (`env.staging`, Worker `pulse-site-staging`).

## Publish on a Node host

The site needs a Node server behind HTTPS because the lab forwards selected read-only calls to Sepolia. A static GitHub Pages upload alone will not run the current lab. Configure the host with a private `PULSE_RPC_URL`, a listening `PORT`, and `PULSE_SITE_HOST=0.0.0.0`; run `npm --prefix evm run playground`. Keep the RPC URL in the host's environment, outside the repository. For publication, configure DNS for `pulse.inshell.art` to point at the selected host and validate HTTPS and the production smoke checks. The server includes input bounds, request timeouts, and basic per-connection/global request limits; a public host should also enforce traffic limits at its edge. The site does not require a signer.

The project entries on `/projects` come from [`projects.json`](projects.json) and can be edited by a maintainer after reviewing a public [suggestion issue](https://github.com/inshell-art/pulse/issues/new). Changing an entry does not affect any auction. A live label or auction link requires application-level evidence as described in the [listing policy](../../docs/site/project-listing.md).

## Lab privacy and scope

The browser stores settings and simulated purchases in its own `localStorage` under `pulse-core-playground/v1`. No scenario history is saved by the server. Each `initialize`, selected `quote`, and `advance` input is forwarded to the Sepolia RPC for a read-only call, so those individual inputs leave the device even though the history stays local. The chart uses the same integer rule locally for smooth scrubbing and checks the selected ask against the deployed contract. No wallet, payment, mint, transaction, or real auction state is involved. “Start again” replaces the saved sequence with a fresh one.

### Optional analytics

The site offers optional, consent-first Google Analytics 4 (measurement ID `G-HPR2KD6JEP`, property `561620951`). Nothing loads from Google until the visitor chooses **Allow analytics**; Reject, later withdrawal and **Exclude this browser** are always available from **Analytics choices** in the footer, and the choice lasts 90 days in `localStorage`. Measurement runs only on `https://pulse.inshell.art`: staging, previews, local servers and automated browsers never load Google. Page views use a closed list of two categories (Home and Projects); documents, prompts, API routes, calculator inputs and wallet data are never sent. Advertising signals, Google signals and personalization are off, and a Developer Traffic filter excludes diagnostic visits. The CSP adds only `https://www.googletagmanager.com` for scripts and Google's collection hosts for `connect-src` and `img-src`. `analytics-core.js` is ported from AgentArt.work's consent module; `analytics.test.js` runs its offline fixtures. A staging target, `wrangler deploy --env staging` (Worker `pulse-site-staging` at `pulse-staging.inshell.art`), serves the same code and assets for pre-release checks; analytics never loads there.
