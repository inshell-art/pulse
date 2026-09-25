# Pulse site and lab

This is the first-party Pulse website. It explains the decentralized automatic auction mechanism, offers a read-only lab backed by the released Sepolia Core, and maintains an optional [off-chain project directory](../../docs/site/project-listing.md). A project can call Core or import the math without registering or appearing in the directory. The directory is editorial discovery, not a contract registry, auction-state source, or endorsement.

Both pages follow the system light/dark preference automatically, including chart colors and form controls. No theme preference is stored.

The chosen public domain is **`pulse.inshell.art`**, a subdomain of `inshell.art`; no separate domain registration is needed. The site remains a **local preview** for review. Public hosting and DNS setup are pending.

The narrative separates the proposition (waiting drops, buying pumps), its mechanisms (Dutch auction decay and Price–Time Scale), and Core V1's practical floor policy (next floor equals last sale). The floor policy and its rationale sit in a collapsed implementation note, outside the main explanation. The full floor ratchet is a simple special case intended to constrain eventual issuance through price, not a requirement of the broader proposition or a guarantee of a fixed final supply. The lab demonstrates this released V1 policy.

The home page reads as one column: question → proposition → examination. Its opening states the supply–demand question; one highlighted equation connects the waiting time with the Price–Time Scale. The detailed continuous and integer mathematics sit in a closed disclosure. The lab leads with one chart and a plain-language result; calculation details, rule settings, and purchase history are optional disclosures. The project directory lives on `/projects`, linked from the header and footer. A simulated purchase leaves the clock at the purchase instant so the immediate price jump is visible; the visitor moves time forward to make the next purchase.

## Run locally

From the repository root:

```bash
cd evm && npm install
cd .. && npm run playground
```

Open <http://127.0.0.1:4173>. Set `PULSE_PLAYGROUND_PORT` to change the local port. The server binds to `127.0.0.1` by default. It reads `PULSE_RPC_URL` or `SEPOLIA_RPC_URL`, falling back to `~/.opsec/path/env/sepolia.env` for the local workspace. The RPC URL stays on the server.

On startup the server checks the Sepolia chain ID, Core runtime code hash, Core version, and a sample calculation against the [release record](../releases/pulse-core-v1/sepolia.json). If the configured endpoint is `ethereum-sepolia-rpc.publicnode.com`, it also verifies `sepolia.gateway.tenderly.co` as a fallback. An explicitly configured private RPC does not get a public fallback.

## Publish on Cloudflare

The Cloudflare Worker serves the same seven browser assets and a read-only Sepolia gateway. From `evm/playground/`, run `npx wrangler@4.94.0 deploy --dry-run` to build, then `npx wrangler@4.94.0 deploy` to publish. The configuration binds only `pulse.inshell.art` and disables the workers.dev and preview addresses. Use the existing Cloudflare account with Worker deployment and custom-domain/zone permissions, supplied through the standard `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables. Keep credentials outside this repository. No signer, database, KV namespace, or paid-plan change is needed.

The Worker uses public Sepolia RPC endpoints with failover, verifies the chain, released runtime hash and version before calculations, and refreshes that verification every five minutes per isolate. Only `initialize`, `quote`, and `advance` calls to the pinned Core address are accepted. Inputs have byte-size and ABI-width bounds; upstream calls have timeouts. Rate and concurrency limits apply per isolate, not as an account-wide quota. Worker observability is disabled, and the application does not persist calculation requests. Cloudflare and RPC providers still handle network requests.

Run `node --test evm/playground/worker.test.js` from the repository root for gateway boundary tests. After deployment, run `python3 evm/playground/smoke-site.py https://pulse.inshell.art` to verify HTTPS routes and actual Sepolia calculations.

## Publish on a Node host

The site needs a Node server behind HTTPS because the lab forwards selected read-only calls to Sepolia. A static GitHub Pages upload alone will not run the current lab. Configure the host with a private `PULSE_RPC_URL`, a listening `PORT`, and `PULSE_SITE_HOST=0.0.0.0`; run `npm --prefix evm run playground`. Keep the RPC URL in the host's environment, outside the repository. For publication, configure DNS for `pulse.inshell.art` to point at the selected host and validate HTTPS and the production smoke checks. The server includes input bounds, request timeouts, and basic per-connection/global request limits; a public host should also enforce traffic limits at its edge. The site does not require a signer.

The project entries on `/projects` come from [`projects.json`](projects.json) and can be edited by a maintainer after reviewing a public [suggestion issue](https://github.com/inshell-art/pulse/issues/new). Changing an entry does not affect any auction. A live label or auction link requires application-level evidence as described in the [listing policy](../../docs/site/project-listing.md).

## Lab privacy and scope

The browser stores settings and simulated purchases in its own `localStorage` under `pulse-core-playground/v1`. No scenario history is saved by the server. Each `initialize`, selected `quote`, and `advance` input is forwarded to the Sepolia RPC for a read-only call, so those individual inputs leave the device even though the history stays local. The chart uses the same integer rule locally for smooth scrubbing and checks the selected ask against the deployed contract. No wallet, payment, mint, transaction, or real auction state is involved. “Start again” replaces the saved sequence with a fresh one.
