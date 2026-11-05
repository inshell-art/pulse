# Pulse site and lab

This is the first-party Pulse website. It explains the decentralized automatic auction mechanism, offers a read-only lab backed by the released Sepolia Core, and maintains an optional [off-chain project directory](../../docs/site/project-listing.md). A project can call Core or import the math without registering or appearing in the directory. The directory is editorial discovery, not a contract registry, auction-state source, or endorsement.

Both pages follow the system light/dark preference automatically, including chart colors and form controls. No theme preference is stored.

The public site is **https://pulse.inshell.art**, served by the Cloudflare Worker `pulse-site`. First published on 2026-09-26, with HTTPS routes and read-only Sepolia Core calculations verified. Latest tagged website release: [`pulse-site-v1.0.2`](https://github.com/inshell-art/pulse/tree/pulse-site-v1.0.2), commit `32adfe39e1bf775f387ddab698780f256ed0cc81`. The October 16 static review confirmed index r7 is already published. The October 31 release added optional consent-first analytics and shipped the Issues configuration; see [Publish on Cloudflare](#publish-on-cloudflare). The November 1 release names that optional analytics in the indexed privacy text (index `2026-11-01-r8`). Local preview remains available for development.

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

Privacy-text release on 2026-11-01: `docs/playground.md` now names the optional Google Analytics beside Cloudflare and RPC providers, with the same facts as the site's **Analytics choices** dialog. Its digest changed to `b501ee3c58ac90af49c2350f7364ccd3790a32fbe257236069974f7ea1653a07` and the index moved from `2026-09-27-r7` to `2026-11-01-r8`; no code, consent, measurement or CSP change. Candidate `6e24931`. Staging Worker `pulse-site-staging` serves version `eb717fa8-f7ae-4dd7-a1d3-9737a66a1054` (tag `privacy-ga4-6e24931`, deployed at about 07:22 China time; previous staging version `2a5fcdc2`). On staging, all 26 public files match the build byte-for-byte (`robots.txt` with Cloudflare's managed prefix), the smoke check passes, security headers equal production's, and desktop and mobile browsers show the lab and chart working with no Google requests. After those checks and the operator's separate approval, production `pulse-site` serves version `3b775d90-63c6-41a5-8a8e-88b98fc1e349` (same tag) at 100% since about 07:37 China time, uploaded and deployed with the existing-binding flow below; Cloudflare uploaded only the three changed files. Rollback: `65d09b2d`, read just before. In production, all 26 public files match the build byte-for-byte (`robots.txt` with the managed prefix), the index is `2026-11-01-r8` with matching digests, `smoke-site.py` and `smoke-public-access.py` pass (the latter with Python's default user agent, 10 complete downloads), security headers are unchanged, and desktop and mobile browsers show the consent notice and a working lab with no Google requests before consent. Read back after the release: Issues on, Logs and Traces off for both `pulse-site` and `pulse-site-staging`, as on October 31. No new Git release tag was created.

**Dated provider record, November 1:** serving version `3b775d90-63c6-41a5-8a8e-88b98fc1e349` (`privacy-ga4-6e24931`); rollback target `65d09b2d-9b8d-4414-8f2d-fdd963281830` (`ga4-consent-f512df7`), read from the provider as the serving version before the release. Staging `pulse-site-staging` serves `eb717fa8-f7ae-4dd7-a1d3-9737a66a1054` (rollback `2a5fcdc2`). This supersedes the October 31 record (serving `65d09b2d`, rollback `77aae848-5919-41a9-a12d-aedfae1df011`), which superseded the October 11 record (serving `77aae848`, previous `7a6cdf91-ba2c-4a3f-8f4b-5d202e0ad5c1`). Before any release, read the actual serving version and settings and retain that version as rollback. Do not use the historical r6 label as current production or automatically select it for recovery.

### Public agent access

Cloudflare configuration rule **Pulse public read-only sources - BIC exception** (`b41c00536f404145b0b0d045cf9f34cd`) disables only Browser Integrity Check for this expression:

```text
(http.host eq "pulse.inshell.art" and http.request.method in {"GET" "HEAD"} and (starts_with(http.request.uri.path, "/docs/") or http.request.uri.path in {"/" "/projects" "/projects/" "/projects.json" "/api/status" "/robots.txt"}))
```

The existing staging configuration rule was preserved. Other hosts, methods, and paths remain outside the exception, including POST `/api/call`. The rule was applied through the authenticated dashboard because the operational deployment token lacks permission to manage security/configuration rules. To roll back this exception, disable this named rule; Worker rollback does not change zone rules.

Run `python3 evm/playground/smoke-public-access.py https://pulse.inshell.art` to test agent discovery with Python's unmodified default User-Agent. The r5 check verified nine public GET/HEAD routes, all ten original source digests, crawler guidance, and the Sepolia identity. These checks passed after that publication; previously default Python requests received Cloudflare 403 / error 1010. `robots.txt` permits public documentation and the read-only status endpoint while disallowing crawler access to other `/api/` paths. Robots guidance is not access control.

On 2026-09-27, the session's separate web-reading service still returned opaque inaccessible-URL errors for Pulse and the parent Inshell knowledge index. Default HTTP requests and diagnostic requests carrying ChatGPT-User, Claude-User, and Perplexity-User headers received HTTP 200 with the expected index. These header tests do not prove requests from those providers' infrastructure work. Cloudflare's Pulse-filtered sampled security events showed no corresponding new block, and AI Crawl Control showed ChatGPT-User and OAI-SearchBot allowed. The sampled records cannot prove a request never reached Cloudflare. A temporary Worker trace could not connect (`ECONNRESET`), so it supplied no additional evidence. No broader security exception was applied. The reader-service failure remains unconfirmed; the prompt's alternate HTTP fetch supports agents that have that capability, but does not repair or establish compatibility with every browsing service.

The Cloudflare Worker serves the allowlisted browser assets, public documentation, and a read-only Sepolia gateway. The default environment binds only `pulse.inshell.art` and disables the workers.dev and preview addresses. Updates to the existing Worker use the version upload/deploy flow below, with `--env=""` explicitly selecting that default target. Use the existing Cloudflare account and an authorized Worker deployment credential, supplied through the standard `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables. Keep credentials outside this repository. No signer, database, KV namespace, or paid-plan change is needed.

The Worker uses public Sepolia RPC endpoints with failover, verifies the chain, released runtime hash and version before calculations, and refreshes that verification every five minutes per isolate. Only `initialize`, `quote`, and `advance` calls to the pinned Core address are accepted. Inputs have byte-size and ABI-width bounds; upstream calls have timeouts. Rate and concurrency limits apply per isolate, not as an account-wide quota. The application does not persist calculation requests. Cloudflare Issues is enabled in production; Workers Logs and Traces remain disabled. Cloudflare and RPC providers still handle network requests. This local candidate replaces the prior optional GA4 installation as described under [Optional statistics](#optional-statistics-local-only-candidate). Issues collection is saved on, but actual issue detection and alert delivery are not yet qualified.

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

### Optional statistics (bounded automatic-pilot candidate)

Historical November 1 preparation on `codex/cf-analytics-local-20261101` started from
`dbf624fac23c405d53472da43a097157a0e54acb`, the authoritative main containing
November 1's privacy release. It is separate from the saved October functionality
batch. That preparation did not authorize publication or provider changes.
The November 5 pilot continuation below starts from actual merged main
`5ba47eb45e051e06a5d6697d46dc8b32811be773`; earlier local-only and provider
records are dated history. Current authority permits local preparation/checks
only, with collection OFF and publication/deployment pending.

GA4 installation, its cookie/consent panel and Google CSP destinations are removed.
A quiet **Privacy** disclosure retains the existing `pulse.analytics.excluded.v1`
boolean. Old consent records, analytics history and cookies are not deleted;
saved scenarios, authentication/functional storage and Core/gateway behavior are
unchanged. No new visitor ID, collector endpoint, proxy or reporting credential
is added to the frontend. Served HTTP Referrer-Policy remains `no-referrer`.
Only the eligible Projects loader appends a `strict-origin` document meta after
every existing check succeeds and immediately before appending the SDK. The
whole measured document then has an origin-only default: later requests using
it may send Pulse’s origin without the page path or query. Explicit `noreferrer`
links and the SDK file’s `no-referrer` fetch keep their stricter policies.
No meta is inserted for OFF/private/other/ineligible or unreadable-storage
documents or when an existing collector blocks the owner loader. This affects
more than collector transport; the quiet Privacy disclosure states the tradeoff.
Incoming referrers are still checked, not rewritten or sanitized by the meta.

The released OFF source has all five client values false. This local pilot
candidate proposes `enabled`, `production`, `automaticInjectionDisabled`,
`sourceCountryPolicyQualified` and `documentLifecycleQualified` as **true only
for the bounded static Projects contract below**. The verified public beaconToken
stays unchanged. Ordinary builds remain OFF: **`PULSE_MEASUREMENT_DOCUMENT_ENV`
is absent from default/staging Wrangler settings**, so the trusted server marker
is off and the loader cannot run. Staging also rejects the production-only host.
These proposed values are not blanket browser qualification or permission to
publish/activate. No provider change here. Live source flags remain at the last
accepted OFF release until separately authorized promotion.
A reporting API token is not a public beacon token or collection permission. The existing root snippet/public-token and reporting-record pairing was explicitly
verified read-only on November 2; Pulse subdomain reuse follows the documented root relationship.
This does not verify receiver acceptance or actual report ingestion. REST `site_tag` is a separate reporting/query identity; tests use
distinct synthetic values and only `beaconToken` goes into `data-cf-beacon.token`.
Account reporting API credentials are a third type and stay server-side. Automatic injection is not bypassed or managed by this candidate.

A later separately reviewed configuration needs the exact production origin
`https://pulse.inshell.art`, an approved 32-hex public `site_token` in `beaconToken` and all qualified
gates. The extended candidate permits only canonical `/projects/`; Home stays off. Unknown paths, queries
(including an empty `?`), fragments (including `#`), docs/prompts, APIs, sensitive
work/handle/wallet/auth flows, previews/local/CI, known automation, unreadable
exclusion storage and explicitly excluded browsers stay off. Incoming same-origin
referrers must also be the exact Projects route; Home-to-Projects entries are
currently excluded. Blank/direct referrers can qualify. External referrers require
an explicit reviewed origin allowlist and must expose only that origin; the
current external allowlist is empty. Unknown or sensitive paths are skipped.
These statistics would cover only part of Projects traffic, not all Pulse visits
or people. Missing coverage is not reported as zero demand.

#### Projects document lifecycle — local only, November 2

The supported scope is one exact static `/projects/` document with ordinary
full-document navigation. The current Projects and agent scripts do not mutate
history or implement a router. `spa: false` is not an immediate-stop API. Excluding
a measured browser saves only the existing exclusion boolean and reloads that
page; the next document checks the exclusion before loading a beacon. The closing
public Projects document may still send a final performance report, including
after the exclusion action. Removing an exclusion does not start measurement in
the existing document. Saved scenarios and functional storage stay unchanged.

OPS's November 2 bounded fixture used the pinned unmodified official SDK,
synthetic inputs and browser-enforced `connect-src none`. Normal Projects-to-Home
navigation kept the final report location on `/projects/`; Home loaded no SDK.
Exclusion saved the boolean, reloaded and left the next document excluded without
a beacon, while the closing Projects document attempted a final report. Every
upload was blocked. The operator accepted this finite next-document behavior;
this is not collection activation, a global privacy/legal guarantee or release
approval. This copy-only continuation runs no additional SDK tests.

The earlier synthetic `history.pushState` private-path final-send **FAIL remains
real and unsupported**, not waived or relabeled passed. Do not add a History API
patch, router or navigation redesign for measurement. Script removal and reload
do not promise cancellation of vendor handlers or a final report. Retained November 4
upload-blocked fixtures showed cross-tab reload, native opaque-origin storage
denial and blank/unsafe local HTTP referrers, then a trusted native tab-hide/resume
pair and one real BFCache restoration followed by the source-owned reload into
an excluded/no-SDK document. No post-exclusion SDK send was captured in that
single Back case. Broader native HTTPS referrers, normal first-party storage
policies, universal lifecycle/cache behavior and the automatic pilot remain
unqualified. The origin-only change does not broaden their accepted scope.
The existing public token/report record pairing is verified, with OPS reports scoped
to the exact Pulse host and `/projects/` path. A later bounded origin-only
diagnostic returned one successful SDK POST and a correlated processed report;
it was not organic audience or routine activation.
Home/calculator/APIs, unsafe referrers and all other excluded routes remain
unmeasured; Home's pending work is outside this boundary. All master and
qualification flags remain false, the verified public beaconToken is configured and document binding
unset. Home and Projects both remain OFF. Native receiving-colo behavior is
unverified and not an equivalent mandatory source-country gate; `lite=true` alone
is not proof of it. No geolocation service, hosting move,
paid plan, synthetic regional proof or live vendor send is part of preparation.

Run focused offline checks with existing dependencies/lockfile:

```sh
node --test evm/playground/analytics.test.js evm/playground/measurement-region.test.js evm/playground/knowledge.test.js evm/playground/worker.test.js
node evm/playground/build-site.js
```

These tests substitute DOM/transport objects; they do not download or execute a
vendor beacon or qualify live collection. The existing CI site-check command also
includes the offline analytics fixtures. Public documentation has a new candidate
digest and index revision `2026-11-05-r13-candidate`; this local integration is not published.

Rollback source is the exact base above. A future live rollback must separately
capture its actual serving Worker version, collector settings and collection-stop
behavior. No historical audience series is merged across GA4 and Cloudflare.
Next approval boundary: review this local diff; separately authorize any source
publication, provider site/mode/injection configuration, controlled vendor/browser
qualification, staging or production release. Collector activation is blocked
until the source-country policy, exact-site, referrer and lifecycle conditions
are established, with receiver/report acceptance separately tested under M4.

#### Projects country-bit extension — local only, November 1

The existing Worker can now add one coarse `pulse-measurement-region` HTML meta
value (`eligible` or `off`), using only trusted inbound `request.cf.country`.
Known ISO countries outside the proposed 32-country deny list are prospective;
unknown/missing/malformed values and caller country headers never qualify.
The operator’s November 4 technical contract is the visitor’s trusted Cloudflare
source country (`request.cf.country`), with the same 32 denied countries and
missing/unknown countries kept off. Native RUM receiving-colo restriction remains
unverified and is not an equivalent mandatory gate for this pilot. This policy
does not guarantee worldwide legal eligibility. No qualification flag is enabled
by this design decision or preparation.

Only HTTPS production `/projects/` is prospective. `/projects` continues serving
its existing alias but gets `off`; `/projects.html` remains 404. Home, APIs and
query/hash variants are excluded. Server fragments are normally not transmitted;
the browser also rejects every fragment before considering a manual loader.
The new non-secret existing-Worker binding `PULSE_MEASUREMENT_DOCUMENT_ENV` must
be explicitly `production` before even a geographic eligible bit is emitted.
It is NOT configured in this candidate; local/staging/preview/CI default off.
A bit alone cannot enable collection: master enabled/production remain false,
the existing verified public beaconToken is unchanged, and
`sourceCountryPolicyQualified`/injection/lifecycle flags remain false. The renamed
source-country flag still requires authorized real Projects country/cache proof;
mocked headers, trace loc, route availability and old SDK fixtures cannot set it
true. The old `regionalManualModeQualified` property does not qualify the new gate.

HTML remains `Cache-Control: no-store`. The marker is generated per request after
raw ASSETS reads; it is never stored back into static assets/cache. Transformed
HTML loses stale ETag/length/encoding/modified validators. Raw JS/CSS/docs assets
remain byte-identical and independent of the marker. Node preview has no trusted
country and emits no marker, which denies the loader. Tests cover both country
orders and missing markers. No geography cookie, visitor ID, API or proxy exists.

The prior checkpoint is retained at
`/private/tmp/pulse-cf-analytics-evidence-20261101`; the extension's new handback
and artifacts are at `/private/tmp/pulse-cf-projects-region-evidence-20261101`.
The initial Projects extension failed shared-cache-header review; its evidence
is historical, not the current accepted cache artifact. The corrected cache
checkpoint is preserved at
`/private/tmp/pulse-cf-projects-cachefix-evidence-20261101/handback.json`. The
November 2 copy/document-scope continuation has a separate local handback at
`/private/tmp/pulse-cf-projects-lifecycle-evidence-20261102/handback.json`.
Collection remains OFF, with the remaining provider/SDK/lifecycle qualification
and all source publication or staging/production deployment pending separate
approval.


#### M3 source-country alignment — local only, November 4

This continuation uses local commit `ed3595caf305424f176a95377bb4b1d241e0fed5`,
whose exact tree `bea7a46c6ecb6ef69266cf44e33ac43af89c4243` matches released
PR7/main `dd6bdb4f724a53ed51194e8274e0d3a41fbcddfc`. The earlier preparation
sections and provider version records above are dated history. Owner main and
the saved functionality batch are preserved. The gate is now named
`sourceCountryPolicyQualified`; its actual value stays false. No country list,
Worker/header/cache logic, public scope, browser guard or Core calculation changes.

OPS’s separately executed SG/GB/SG trace sequence establishes existing route
capability only. It does not establish Projects’ `request.cf.country` output,
cache ordering or RUM receiving-colo behavior. The refreshed proposal uses the
existing SG05 and UK routes, exact production `/projects/`, and a temporary
`PULSE_MEASUREMENT_DOCUMENT_ENV=production` binding while every SDK master and
qualification flag remains false. Apply/rollback source/config identities, both
country orders, request/time ceilings and stop conditions need review before
any distinct live operation. Missing/unknown-country denial remains covered by
simulated Worker fixtures; it must not be manufactured with caller headers or
reported as a real Cloudflare observation. Different POPs limit shared-cache proof.

This section records the November 4 M3 preparation. Later bounded M3 observations
and the M4 origin-only diagnostic are described below; no qualification flag is
automatically enabled by them. Collection stays OFF, deployment pending and M6
parked. This candidate adds no framework, pipeline or new gate.


#### M4 eligible-document origin policy — local only, November 5

This integration builds on the independently reviewed M3 source-country tree
`913c03fd03fd8f22b9efc38bfde8ee20258f009a`, preserving its exact static Projects
scope, denied32/missing/unknown country policy, browser/referrer/storage exclusions
and actual false master/qualification values. After eligibility and existing-SDK
checks pass, one `meta name="referrer" content="strict-origin"` is appended
immediately before the official SDK. The SDK script still has explicit
`referrerPolicy="no-referrer"`; Worker/Node HTTP no-referrer and CSP are unchanged.
This is a document default change, not a collector-only request setting.

OPS’s bounded native diagnostic combined a real Projects document with strict-origin,
manual receiver mode and a longer experimental settling margin. One event1 POST
returned204 with an actual origin-only Referer/Origin and matching ACAO; the exact
site/host/path/time aggregate contained count1/visits1 in allBots and bot0 with
sampleInterval1. This is diagnostic correlation, not organic audience or event-ID
proof. The earlier404 cause is not isolated. Exact Disable was restored within
229.785seconds; all source/reader flags remain false. November5 China remains
quarantined for both shared host reports; firstFullProductionDay stays null.
This preparation changes no reader or provider record.

The local automatic path has not been deployed or proved against the real receiver.
The existing reload/possible-final-public-report contract and unsupported private
same-document final-send FAIL remain. No sender/fetch wrapper, forged Referer, proxy,
new panel, lifecycle interception or broad HTTPS/storage qualification is added.
After independent review, a separately approved OFF staging release may verify
assets/headers/absence of policy meta and SDK; eligible real production activation
and processed-report checks remain distinct approvals/workloads. Reuse the existing
site pipeline and exact serving/config rollback, without a new release gate.


#### M4 automatic Projects pilot — local preparation, November 5

Base: actual merged main `5ba47eb45e051e06a5d6697d46dc8b32811be773`, tree
`5f64a693dd9aa6a6ebb6dd8e3fbcc646fab05b84`. The existing automatic `analytics.js`
imports immutable config; no runtime facade, console SDK insertion or old Allow
preference enables it. Only a separately approved temporary production binding
can yield eligibility. Preserve all guards, country32/unknownOFF, source/SDK URL,
public token, policy order and `spa:false`. No new control, endpoint, framework,
credential, operator allowlist or functionality-batch change. Local fixtures
never fetch/evaluate the SDK and write no real browser preference/storage.

| Proposed value | Narrow retained evidence | Limit / live precondition |
| --- | --- | --- |
| `enabled=true`, `production=true` | Existing exact production Projects scope and mandatory server-marker gate | Experiment control, not proof of automatic receipt or routine activation |
| `automaticInjectionDisabled=true` | Reviewed first-party GA4 removal/one-loader code; native M4 Manual/no-auto-injection and single SDK diagnostic | Live preflight must reverify exact Manual/no-auto-injection and no competitor; shared Disable unchanged now |
| `sourceCountryPolicyQualified=true` | Accepted M3 trusted-source-country contract; repeated SGeligible/UKoff responses and OFF restoration; denied32/unknown/spoof/cache source tests | Not raw same-request country attribution, universal same-POP cache isolation, RUM-colo restriction or legal exemption |
| `documentLifecycleQualified=true` | Accepted static full-document/reload contract: cross-tab exclusion, opaque-storage failure, hide/resume and one Back/BFCache restoration into source-owned reload/exclusion | Closing public report may remain; broader HTTPS/referrer/storage/lifecycle unqualified; private same-document final-send FAIL still unsupported |

OPS retains the M3 coverage disposition/live-execution result, resumed native M4
origin diagnostic and independent local-origin/production reviews dated November5.
The table transfers only those bounded observations. No authored Projects History
or SPA router exists; adding private content/routing/changed scripts requires
re-review. Empty external allowlist remains: blank/direct or safe exact Projects
referrers only. Owned pilot enters directly with blank referrer. Source checks
for safe Projects do not claim new native HTTPS evidence. Unreadable storage
fails closed; next-document exclusion is not immediate cancellation.

A pilot is a **short public exposure**, not operator-only. Other eligible visitors
can load; their traffic is not capped by our owned-tab budget. Already-open old
manual SDK documents under shared Inshell/Pulse registration may send too.
Restoring Disable and the prior OFF source/version closes new eligibility, but
cannot recall an issued report or stop a stale SDK immediately. Both restorations
must be independently verified. Quarantine every China date touched by the shared
window/final sends for both hosts; firstFullProductionDay stays null and reader
qualification remains off. No report row is automatically operator/organic traffic.

**Later ordinary PR/OFF staging proposal, not executed:** publish exact feature
candidate, normal PR CI success, one existing-binding staging build/upload/deploy;
no main merge yet. Estimate15active minutes excluding CI/provider queues, at most
12static GET/HEAD (reserve2OPS) plus one Projects view. Retain fresh rollback/config,
match26asset digests and returned version. No document binding/default override
or hidden staging-eligibility bypass. OFF staging cannot qualify automatic receipt.

**Later production apply/restore proposal, not executed:** separate exact main
promotion/pilot approval and normal main CI. Retain fresh actual OFF production
version/settings/assets; last accepted version `0d2da4a5-c72a-4f87-b1c5-4392895c6c4e`,
deployment `6dafe62a-68dd-4356-ab7f-c4cd4a0b9245` is a dated anchor, not fresh
readiness or authority. Use existing Wrangler4.147.0 versions upload, explicit
`--env=""`, and only on that temporary version
`--var PULSE_MEASUREMENT_DOCUMENT_ENV:production` (no `--keep-vars`). The binding
is never authored in default/staging. Preserve ASSETS/domain/IssuesON/Logs+TracesOFF;
verify returned version bindings/assets before traffic deploy. Upload is not
serving. No new grant/API fallback/restore control is assumed.

Future preflight must establish fresh access/headroom/TLS, exact candidate/SDK,
supported native capture and working provider/restore controls. Record report
baseline and closed windows; upload candidate before opening receiver. Change
shared Disable to Manual/no-auto-injection with native/API agreement, then deploy
the exact returned pilot version at100%; one ordinary direct Projects navigation,
one departure. Start600wall-second window at first Manual change; begin restoration
by minute8 and verify exact Disable plus fresh prior OFF version by minute10.
Version restore uses the same existing explicit-environment exact-version deploy
flow, not a new binding patch or automatic redeploy of main. Verify OFF marker,
old client bytes, bindings/settings/domain and Disable separately; record deliberate
main/production divergence. Failed restore is an immediate unresolved state,
not successful recovery. Closing the document may permit its accepted final report.

Proposed live ceiling:15active minutes excluding queues, never extending the
separate10minute receiver window. One candidate upload, one pilot deploy, one
planned OFF restore; two shared mode changes; one inertSDKsourcefetch/nativeSDKload;
owned tab≤40first-party requests,≤2SDKPOSTattempts/≤2OPTIONS, no resend. Staticchecks
≤12with2reservedOPS; aggregateHTTPreads≤6across≤4fixed checkpoints, no polling/timer.
Other public/stale-tab traffic is outside owned budget. Reports are read after
restoration; do not keep collection open waiting for arrival. Correlated receipt
is not event-ID attribution, unique people or a clean full production day.

Local checks transfer no publication/deployment/provider/live-send authority.
M6parked, functionality batch saved, Lab email unchanged, working route untouched.
