# OPS handoff: Pulse GA4 release follow-up (October 31, 2026)

From OPS (`/Users/bigu/Projects/inshell-ops`). Any session, Codex or Claude, can
take this. Keep progress in this file, not only in a conversation.

**Status:** done; the operator approved item 4 (see Outcome). **Taken by:** Claude Code (Opus 5.5), side session of
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

Claude Code, October 31, 2026, about 09:35 China.

- **Pull request:** [inshell-art/pulse#4](https://github.com/inshell-art/pulse/pull/4),
  branch `claude/ga4-followup-f0abaa` from this handoff commit on `origin/main`
  `d1ba783`. Docs only.
- **Item 1, site tests:** 37 of 37 pass on `main` `d1ba783` content
  (`analytics.test.js` 25, `knowledge.test.js` 7, `worker.test.js` 5), Node
  22.16.0. The pre-commit compile and the pre-push `npm test` (223 passing) also
  ran. A local build produces 26 public files.
- **Item 2, README** (`evm/playground/README.md`):
  - Intro: "the pending Issues configuration is separate" now says the October 31
    release added optional analytics and shipped Issues.
  - New October 31 release paragraph: production `65d09b2d` (`ga4-consent-f512df7`),
    staging `2a5fcdc2` checked first, smoke check passed, 25 of 26 files
    byte-identical plus `robots.txt` with Cloudflare's managed prefix, no new Git
    release tag.
  - Dated provider record is now October 31: serving `65d09b2d`, rollback
    `77aae848`. The October 11 record is kept as superseded.
  - Worker paragraph (was line 102): Issues enabled in production, Logs and
    Traces off; Google receives page views only after consent. "This candidate
    has not been deployed" removed; issue detection and alert delivery are still
    stated as not qualified.
  - "Pending Issues configuration" renamed "Issues configuration (prepared
    October 12; revised October 21; live October 31)". It records the release,
    the before-and-after read-back, the October 21 staging withdrawal as history
    and the October 31 staging Worker. The batch's pre-release guidance became
    guidance for later releases (now including staging).
  - Release checks: 26-file asset parity, not 24. The October 16 validation note
    points to the current staging target instead of "only the default production
    target remains".
  - The site README is not an indexed document, so no digest or index revision
    changed.
- **Item 3:** no session, process or recent edit was using
  `/Users/bigu/Projects/pulse`, and its tree was clean. Its local `main` was
  fast-forwarded from `8e3fdee` to `d1ba783` (level with GitHub).
- **Item 4, raised, not implemented:** should `docs/playground.md` (index entry
  "Site, simulation, directory, and privacy") name the optional Google Analytics
  beside Cloudflare and RPC providers? Yes means a new digest, a new index
  revision after `2026-09-27-r7`, and a normal release: staging, then production
  with the operator's yes and a freshly approved deploy credential.
  **Operator's answer, October 31: yes**, given in the OPS session. It
  supersedes the no recorded here earlier. The change is not made in this pull
  request: it is the release handoff `docs/ops-handoff-2026-10-31-privacy-ga4.md`
  on branch `ops/privacy-ga4-handoff-20261031`, stacked on this branch, for any
  session to take. Production still needs the operator's separate yes.
- **Seen, outside this handoff:** CI's "Run website and gateway tests" step
  (`.github/workflows/evm-local-devnet-checks.yml`) runs only `knowledge.test.js`
  and `worker.test.js`, so the 25 analytics tests do not run in CI.
