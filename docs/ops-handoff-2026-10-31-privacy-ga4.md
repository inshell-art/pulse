# OPS handoff: name optional Google Analytics in Pulse's public privacy text (October 31, 2026)

From OPS (`/Users/bigu/Projects/inshell-ops`). Any session, Codex or Claude, can
take this. Keep progress in this file, not only in a conversation.

**Status:** done: live in production November 1, ~07:37 China (see Outcome). **Taken by:** Claude Code, session pulse-privacy-ga4,
November 1, 2026, 07:01 China time. Before you start, replace "none yet"
with your agent and session and the China time; when you stop, write the
outcome at the end of this file.

## Why

Since October 31, the site offers optional consent-first Google Analytics (see
`docs/ops-handoff-2026-10-31-ga4.md` and the "Optional analytics" section of
`evm/playground/README.md`). The public privacy text does not say so. Line 9 of
`evm/playground/docs/playground.md`, indexed as "Site, simulation, directory,
and privacy", names only Cloudflare and RPC providers. On October 31 the
operator decided to fix this as a normal release.

## Operator decision and approvals

- Approved: change the text, update the digest and the index revision, and
  release through staging.
- Production needs the operator's separate yes, asked after staging checks pass.
- Deploy credential: the operator supplies it in their own terminal. Never read,
  print or record its value. The Inshell Worker deploy token created for the
  GA4 release lapses November 7; after that, a newly approved one is needed.

## To do

Work in your own git worktree. Start from this branch, which sits on
[PR #4](https://github.com/inshell-art/pulse/pull/4); if #4 is merged by then,
start from `origin/main`.

1. **Text.** In `evm/playground/docs/playground.md`, add one or two plain
   sentences near line 9. The facts must match the site's own disclosure in
   `evm/playground/index.html` (the `analytics-settings` dialog):
   - analytics is optional and off until the visitor allows it;
   - when allowed, Google Analytics measures broad page categories (Home or
     Projects), approximate country, browser visits and engagement time;
   - Google receives network and browser information, including the IP address;
   - no calculator inputs, auction values, wallet data, prompts or downloaded
     documents are included, and advertising and personalization are off;
   - the visitor can change the choice under "Analytics choices".
   Keep the existing Cloudflare and RPC sentence.
2. **Digest and revision.** In `evm/playground/docs/agent-index.json`, set the
   `playground` entry's `sha256` to the new file's SHA-256, and move `version`
   from `2026-09-27-r7` to the next revision. The README says "update its digest
   and the index revision"; follow its `YYYY-MM-DD-rN` pattern with the release
   date. Check `docs/agent-prompt.txt` and the other indexed documents for
   privacy wording that now needs the same fact.
3. **Release record.** The `site-release` entry points to the tagged v1.0.1
   notes. Like the September 27 publications and the GA4 release, this release
   creates no Git release tag, so leave that entry unless the operator asks for
   a tagged release. Record the release in `evm/playground/README.md` the way
   the October 31 GA4 release is recorded.
4. **Checks.** Run
   `node --test evm/playground/knowledge.test.js evm/playground/worker.test.js evm/playground/analytics.test.js`,
   the build (`node build-site.js` from `evm/playground`) and both dry runs:
   `npx wrangler@4.147.0 deploy --env staging --dry-run` and
   `npx wrangler@4.147.0 deploy --env="" --dry-run --no-autoconfig`. Scan the
   built assets for secrets.
5. **Preflight.** Before deploying, add an operation preflight for this release
   to `/Users/bigu/Projects/inshell-ops/docs/ga4-rollout-pulse-gallery-2026-10-30.md`
   (or a new dated record beside it) in the same form as the GA4 preflights:
   - destination;
   - access;
   - candidate commit and dry-run result;
   - capacity;
   - rollback, which is the version serving production when you read it
     (`65d09b2d-9b8d-4414-8f2d-fdd963281830` as of October 31).
6. **Staging.** Ask the operator to run, in their terminal with their token:
   `CLOUDFLARE_ACCOUNT_ID=7fc68967a9445609a0788d8c94e45de0 npx wrangler@4.147.0 deploy --env staging --tag <candidate tag> --message "<summary>"`,
   from `evm/playground`. Then verify `https://pulse-staging.inshell.art`:
   - `python3 evm/playground/smoke-site.py https://pulse-staging.inshell.art`;
   - `/docs/playground.md` and `/docs/agent-index.json` match the build byte
     for byte;
   - the served index shows the new revision and digest.
   If the local proxy cannot reach the host, check directly at Cloudflare's
   edge: `curl --noproxy '*' --resolve pulse-staging.inshell.art:443:104.21.6.16 …`.
7. **Production, only after the operator's yes.** Use the README's
   existing-binding flow:
   1. `npx wrangler@4.147.0 versions upload --env="" --tag <tag>`;
   2. `npx wrangler@4.147.0 versions deploy <version>@100% --env="" --yes`.
   Read the serving version first and keep it as the rollback. Verify:
   - `python3 evm/playground/smoke-site.py https://pulse.inshell.art`;
   - asset parity with the build, allowing for Cloudflare's managed
     `robots.txt` prefix;
   - Issues still on, Logs and Traces still off.
8. Open a pull request with the changes and this file's Outcome. Push over
   HTTPS, since SSH fails through the local proxy.

## Boundaries

- No change to analytics behaviour, consent, measurement ID or CSP; this is
  documentation and its index only.
- No new Core deployment, GA4 setting, Cloudflare setting or alert rule.
- Not in scope, but seen during the GA4 follow-up: CI runs only
  `knowledge.test.js` and `worker.test.js`, so the 25 analytics tests don't run
  in CI. Note it in the Outcome; don't change the workflow unless the operator asks.

## Outcome

Write here when you stop:
- the pull request and the new index revision;
- test results;
- staging version and checks;
- the production version and its rollback, or why it stopped before production.

**Progress, November 1, ~07:20 China (Claude Code, pulse-privacy-ga4):**
candidate `6e249312734c6e4dd27ca04db5c786413d0a9010` is ready (text, digest,
index `2026-11-01-r8`); 37 of 37 site tests, build (26 files), both dry runs and
gitleaks pass. Preflight written to
`/Users/bigu/Projects/inshell-ops/docs/ops-pulse-privacy-text-release-2026-11-01.md`.
Waiting for the operator to run the staging deploy.

**First staging attempt, November 1, 07:07 China: refused, nothing changed.**
`CLOUDFLARE_API_TOKEN` was not set in the shell that ran the command (this
chat's `!` shell), so Wrangler fell back to its saved OAuth login for the
Gallery account (`a54e5847…`). All three calls returned `Authentication error
[code: 10000]`; nothing was read or deployed. Log kept as
`output/privacy-staging-deploy-attempt1.log` in the worktree (not committed).

**Guarded command, at the operator's request (via OPS).** The staging deploy now
runs from `output/privacy-staging-deploy.sh` in the worktree (not committed;
`output/` is ignored). In order, it stops unless:
1. `CLOUDFLARE_API_TOKEN` is set (checked without printing it);
2. `evm/playground` is byte-identical to candidate `6e24931`;
3. `wrangler whoami --json` reports `User API Token` or `Account API Token`, not
   `OAuth Token`, and lists account `7fc68967a9445609a0788d8c94e45de0`.
Only then does it read both serving versions and deploy staging, writing
`output/privacy-staging-deploy.log`. Checked locally: it stops with no token,
and the identity check rejects an OAuth login or a missing Inshell account. The
production command will carry the same guard.

**Outcome, November 1, ~07:35 China (Claude Code, pulse-privacy-ga4). Stopped
before production; it needs the operator's separate yes.**

- **Pull request:** [inshell-art/pulse#6](https://github.com/inshell-art/pulse/pull/6),
  branch `claude/privacy-ga4-release-0d0bc7` into `main`. Not merged.
- **What changed:**
  - `evm/playground/docs/playground.md`: a new paragraph after the Cloudflare
    and RPC sentence (unchanged). Four short sentences carry the dialog's facts:
    optional and off until allowed; cookies; page categories (Home or
    Projects), approximate country, browser visits and engagement time; Google
    receives network and browser information, including the IP address; no
    calculator inputs, auction values, wallet data, prompts or downloaded
    documents; advertising and personalization off; change the choice under
    "Analytics choices" in the page footer.
  - `evm/playground/docs/agent-index.json`: index `2026-09-27-r7` →
    `2026-11-01-r8`; playground digest `eeef35c9…` →
    `b501ee3c58ac90af49c2350f7364ccd3790a32fbe257236069974f7ea1653a07`; its
    `useFor` adds "privacy, including optional analytics".
  - No other indexed document carries privacy wording, `agent-prompt.txt`
    included, so nothing else changed. `site-release` entry left as is (no Git
    release tag).
  - `evm/playground/README.md`: the release recorded as staged, beside the
    October 31 GA4 record.
- **Candidate:** `6e249312734c6e4dd27ca04db5c786413d0a9010`. Later commits on
  this branch touch only `docs/` and the README, which are not deployed.
- **Tests:** 37 of 37 site tests pass (analytics 25, knowledge 7, worker 5),
  Node 22.16.0. Build: 26 public files. Both dry runs pass (`--env staging`;
  `--env="" --no-autoconfig`): 176.99 KiB, binding `ASSETS` only. gitleaks: no
  leaks in the built assets or the docs. The pre-push hook ran the 223 EVM tests,
  all passing.
- **Deploy token:** after the refused first attempt, the operator rolled
  `pulse-worker-deploy-ga4-2026-11` in Cloudflare (~07:20 China) and pasted the
  new value at a hidden prompt; the value was never seen or recorded. It still
  lapses November 7. OPS's credential inventory should note the roll.
- **Staging:** deployed ~07:22 China through the guarded script: token check
  passed (`User API Token`, Inshell account visible). Worker
  `pulse-site-staging` now serves version
  `eb717fa8-f7ae-4dd7-a1d3-9737a66a1054` (tag `privacy-ga4-6e24931`). Cloudflare
  uploaded exactly 3 changed files (`docs/playground.md`,
  `docs/documents/playground.json`, `docs/agent-index.json`); 23 were unchanged.
  Staging rollback: `2a5fcdc2-a540-4e61-bfdc-77b27b9762e0`, read just before.
- **Staging checks** (direct to Cloudflare's edge, `104.21.6.16`, since the local
  proxy cannot resolve the host):
  - asset parity: 26 of 26 files match the build byte for byte (`robots.txt`
    ends with the built text after Cloudflare's managed prefix). Before the
    deploy, only the 3 changed files differed;
  - served index is `2026-11-01-r8`; its playground digest equals the served
    `docs/playground.md`, and the served download envelope matches its
    `download.sha256` and carries the same text;
  - `smoke-site.py`: PASS (14 routes; document digests and HEAD; verified
    Sepolia identity; initialize/quote/advance/next quote; 3 invalid-request
    checks);
  - security headers on `/` (CSP, nosniff, referrer and others) identical to
    production's;
  - browser, desktop 1280 and mobile 375: page and chart render, `/api/status`
    and `/api/call` return 200, no horizontal overflow, zero requests to Google
    (analytics never loads on staging, as designed);
  - `smoke-public-access.py` (Python's default user agent) gets 403, Cloudflare
    error 1010, on staging only. The BIC exception covers only
    `pulse.inshell.art`, so this is the staging host's zone setting, unchanged
    by this release; production returns 200. The same download-and-replay logic
    passes against the identical build in `knowledge.test.js`. Run it on
    production after release.
- **Production:** not run. Serving version read at the staging deploy:
  `65d09b2d-9b8d-4414-8f2d-fdd963281830` (`ga4-consent-f512df7`), the rollback.
  When approved: the README's `versions upload --env=""` then
  `versions deploy <id>@100% --env="" --yes`, behind the same token guard; then
  `smoke-site.py`, `smoke-public-access.py`, asset parity, and Issues on with
  Logs and Traces off.
- **Left:** the operator's production yes, the production deploy and checks,
  then the README's production record and dated provider record. CI still runs
  only `knowledge.test.js` and `worker.test.js`, so the 25 analytics tests don't
  run in CI (not changed; needs the operator's ask).

**Operator's production yes, November 1, ~07:45 China, given in this session:**
"Yes: release the staged privacy-text build (candidate 6e24931) to production
pulse-site, with 65d09b2d as rollback." Production runs from
`output/privacy-production-deploy.sh` (same token guard; reads the serving
version, `versions upload --env=""`, then `versions deploy <id>@100% --env="" --yes`).

**Production outcome, November 1, ~07:50 China (Claude Code, pulse-privacy-ga4).**

- **Live:** `pulse-site` serves version `3b775d90-63c6-41a5-8a8e-88b98fc1e349`
  (tag `privacy-ga4-6e24931`) at 100% since 07:37:15 China, from candidate
  `6e24931`. Uploaded with `versions upload --env=""` and deployed with
  `versions deploy 3b775d90…@100% --env="" --yes`; the existing
  `pulse.inshell.art` binding was kept. Cloudflare uploaded only the 3 changed
  files.
- **Rollback:** `65d09b2d-9b8d-4414-8f2d-fdd963281830` (`ga4-consent-f512df7`),
  read from the provider by the same script just before the upload.
- **How it ran:** `output/privacy-production-deploy.sh`, with the token pasted
  at a hidden prompt in a terminal tab. The guard's first production run stopped
  before any Cloudflare call because its source check counted the site README,
  which is not deployed; the check now excludes only `evm/playground/README.md`.
  A second run from the chat's `!` shell stopped at the token check. The third
  run passed the guard (`User API Token`, Inshell account) and deployed.
- **Production checks** (direct to Cloudflare's edge):
  - asset parity: 26 of 26 files match the build byte for byte (`robots.txt`
    with Cloudflare's managed prefix and the built text at the end);
  - served index `2026-11-01-r8`; playground digest and download hash match
    the served files; the new paragraph is served;
  - `smoke-site.py`: PASS (14 routes; document digests and HEAD; verified
    Sepolia identity; initialize/quote/advance/next quote; 3 invalid-request
    checks);
  - `smoke-public-access.py` with Python's default user agent: PASS (10
    complete downloads verified and analyzed offline);
  - security headers on `/` unchanged from before the release;
  - browser, desktop 1280 and mobile 375: consent notice shown, lab
    (`/api/status`, `/api/call` 200) and chart working, no horizontal overflow,
    zero Google requests and no analytics cookies before consent. Allow was not
    clicked.
- **Observability read-back** (read-only, `script-settings` API, 07:44 China,
  `output/privacy-observability-readback.sh`): `pulse-site` and
  `pulse-site-staging` both `enabled=false issues=true logs=false
  traces=false`. Read after the release only; it equals the October 31
  before-and-after record.
- **Records:** `evm/playground/README.md` now holds the production release, and
  the dated provider record is November 1 (serving `3b775d90`, rollback
  `65d09b2d`).
- **Left for OPS:** note the token roll (~07:20 China) in the credential
  inventory; the operator should close the terminal tabs that still hold the
  token. CI still runs only `knowledge.test.js` and `worker.test.js`, so the 25
  analytics tests do not run in CI (unchanged; needs the operator's ask). The PR
  is open, not merged.
