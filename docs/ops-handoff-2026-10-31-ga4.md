# OPS handoff: Pulse GA4 release follow-up (October 31, 2026)

From OPS (`/Users/bigu/Projects/inshell-ops`). Any session, Codex or Claude, can
take this. Keep progress in this file, not only in a conversation.

**Status:** in progress. **Taken by:** Claude Code (Opus 5.5), side session of
OPS session `local_027a84cf`, worktree `ga4-followup-f0abaa`, branch
`claude/ga4-followup-f0abaa`, October 31, 2026, 09:23 China. Before you start, replace "none yet"
with your agent and session and the China time; when you stop, write the
outcome at the end of this file.

## What already happened (do not redo)

- At the operator's request, OPS built optional consent-first GA4 for the Pulse
  site and released it. Source: commit `f512df7` on `main` `8e3fdee`, merged as
  [PR #3](https://github.com/inshell-art/pulse/pull/3) (merge commit `d1ba783`)
  on October 31, 08:38 China, with CI passing.
- Changed in `evm/playground`:
  - `analytics-core.js` and `analytics.js` (new): measurement ID `G-HPR2KD6JEP`;
    analytics runs only on `https://pulse.inshell.art`.
  - `analytics.test.js`: 25 tests.
  - `index.html`, `projects.html`: consent notice, "Analytics choices" footer
    button and dialog.
  - `styles.css`, `public-assets.js`.
  - `worker.js`, `server.js`: the CSP adds only Google's tag and collection hosts.
  - `worker.test.js`.
  - `README.md`: new "Optional analytics" section.
  - `wrangler.jsonc`: new `env.staging`.
- Staging now exists: Worker `pulse-site-staging` at
  `https://pulse-staging.inshell.art`, version `2a5fcdc2-a540-4e61-bfdc-77b27b9762e0`.
- Production: `pulse-site` version `65d09b2d-9b8d-4414-8f2d-fdd963281830` at
  100% since about 07:51 China. Rollback: `77aae848-5919-41a9-a12d-aedfae1df011`.
  `smoke-site.py` passed; 25 of 26 files are byte-identical to the build, and
  `robots.txt` carries Cloudflare's managed prefix.
- `f512df7` sits on `main`, so production also runs main's Issues setting:
  Issues on, Logs and Traces off (read back before and after; Issues was
  already saved on). The working part of the saved October batch is live.
- OPS evidence: `/Users/bigu/Projects/inshell-ops/docs/ga4-rollout-pulse-gallery-2026-10-30.md`
  and `docs/evidence/ops-progress-2026-10-08/round-2-coverage-2026-10-11/ga4-pulse-gallery-release-2026-10-31.json`
  in that repository.

## To do

Work in your own git worktree on a branch from `origin/main`, and open a pull
request. The shared checkout at `/Users/bigu/Projects/pulse` may be in use by
another session.

1. Run the site tests (`evm/playground/*.test.js`) on current `main`.
2. Correct the now-stale text in `evm/playground/README.md`, in a docs-only change:
   - Line 84, "Dated provider record, October 11": production now serves
     `65d09b2d` (rollback `77aae848`).
   - Line 102: "This candidate has not been deployed" is no longer true for Issues.
   - The "Pending Issues configuration" section: Issues is live in production,
     and the staging Worker is provisioned, so "the separate staging proposal
     was withdrawn" no longer holds.
   Bring the saved October batch notes in line with this.
3. When no session is using `/Users/bigu/Projects/pulse`, fast-forward its local
   `main` (it is 2 commits behind `origin/main`: `f512df7`, `d1ba783`). SSH to
   GitHub may fail through the local proxy; HTTPS works.
4. Raise this for the operator's decision; do not implement it without a yes.
   The public privacy text (`docs/playground.md`, and the "Site, simulation,
   directory, and privacy" document in `docs/agent-index.json`) names
   Cloudflare and RPC providers but not the optional Google Analytics. Adding
   it changes indexed documents. That means new digests, a new index revision
   and a normal release: staging, then production with the operator's yes.

## Boundaries

- No analytics event may carry addresses, wallet data, calculator inputs or
  RPC values. Page categories stay the closed list (Home, Projects).
- The deploy token used for this release lapses November 7. Future deploys
  need a freshly approved credential.
- Known and not part of this handoff: `http://pulse.inshell.art` serves 200
  without redirecting to https. It's a Cloudflare zone setting and predates
  this release.
- This handoff authorizes no deployment, provider or Cloudflare change.

## Outcome

Write here when you stop: the pull request, test results, what changed in the
README, and the question raised on item 4.
