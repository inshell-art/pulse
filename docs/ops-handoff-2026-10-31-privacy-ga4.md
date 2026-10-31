# OPS handoff: name optional Google Analytics in Pulse's public privacy text (October 31, 2026)

From OPS (`/Users/bigu/Projects/inshell-ops`). Any session, Codex or Claude, can
take this. Keep progress in this file, not only in a conversation.

**Status:** in progress. **Taken by:** Claude Code, session pulse-privacy-ga4,
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
