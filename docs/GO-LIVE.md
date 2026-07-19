# i7 Go-Live Runbook (Path B)

Everything below needs credentials this repo does not (and must not) contain. The
code is done and offline-verified; this is the ordered, credential-gated handoff.
After each stage, run `npm run verify-live` — it turns that stage green.

**Path B recap:** the benchmark runs on your Mac (Akash failed the CoV preflight).
Akash hosts the **write path** — the verdict writer fronted by Pomerium — so the
trust story is *verdict-only write enforced on decentralized compute*.

Prereqs to install locally: `aws` CLI, Akash `provider-services` CLI, `docker`
(already have it). Then `cp .env.example .env` and fill as you go.

---

## Stage 1 — AWS: S3 scar file (closes F9)
Two identities, deliberately different scopes:
1. Create a bucket: `aws s3 mb s3://benchfirst-scar-<unique> --region us-west-2`
2. **Writer runtime identity** (deployed to Akash) — scope to ONLY `s3:PutObject`
   + `s3:GetObject` on `arn:aws:s3:::benchfirst-scar-<unique>/benchfirst/memory.json`
   (the exact key). This narrow scope is what makes "opinion can't reach S3" real
   (F13) — no other identity can PUT, and the writer itself can't touch other keys.
3. **Your local dev/admin creds** (what runs `verify-live` from your laptop) need
   `s3:PutObject` + `s3:GetObject` + `s3:DeleteObject` on
   `.../benchfirst/memory.json*` — verify-live round-trips a throwaway
   `benchfirst/memory.json.preflight` key and deletes it, so it needs the wildcard
   + delete that the narrow writer identity intentionally lacks.
4. Put your dev creds + `BENCHFIRST_S3_BUCKET` in `.env` (NOT the writer identity —
   that one goes in the Akash deploy at Stage 5).
5. `set -a; . ./.env; set +a && npm run verify-live` → **S3 round-trip** + **S3
   loud-throw** go green.

## Stage 2 — AWS: Bedrock picker (closes F6)
1. In the Bedrock console (same region), request access to a Claude model; wait
   for "Access granted".
2. Set `BENCHFIRST_BEDROCK_MODEL` in `.env`. On-demand invocation in most regions
   now requires a **cross-region inference-profile id** (the `us.`-prefixed form),
   not the bare model id — copy the exact id the Bedrock console shows for the
   model you were granted (e.g. `us.anthropic.claude-3-5-sonnet-20241022-v2:0`).
   A bare id can throw ValidationException.
3. `npm run verify-live` → **Bedrock pick** goes green (model ranks candidates;
   the benchmark still disposes).
4. **Verify the greedy JSON parse** (F6): if the ranked order looks wrong, check
   `optimizer/picker.mjs` bedrockRank — the model may be wrapping the array in prose.

## Stage 3 — Push the writer image (closes part of F18)
1. `docker login`
2. `docker build -f akash/writer/Dockerfile -t <user>/benchfirst-writer:v1 .`
   (amd64-pinned; builds on Apple Silicon via emulation)
3. `docker push <user>/benchfirst-writer:v1`
4. Update the image tag in `akash/deploy.yaml` if `<user>` differs.

## Stage 4 — Pomerium secrets + config (closes F17)
1. Generate secrets:
   `head -c32 /dev/urandom | base64` → `POMERIUM_COOKIE_SECRET`, `POMERIUM_SHARED_SECRET`.
2. Generate the signing key:
   `openssl ecparam -genkey -name prime256v1 -noout -out pomerium/signing-key.pem`
   (gitignored).
3. Stand up an IdP / service account; fill `BENCHFIRST_IDP_*` and `BENCHFIRST_DOMAIN`.
   `BENCHFIRST_VERDICT_IDENTITY` is set on the **writer container/deploy** (Stage 5),
   NOT in your loop-side `.env` — it turns the writer's fail-closed backstop on and
   must equal the identity Pomerium's allow-policy admits.
4. `envsubst < pomerium/config.yaml > pomerium/config.rendered.yaml` (Pomerium does
   NOT expand `${ENV}` itself).
5. **Confirm the header name** (F17): boot Pomerium against an echo upstream and
   check it injects `x-pomerium-claim-email` — if your Pomerium version uses
   `jwt_claims_headers` instead, adjust config + `BENCHFIRST_IDENTITY_HEADER`.

## Stage 5 — Deploy to Akash (closes rest of F18)
1. Redeem the Akash coupon in the console (funds the wallet).
2. `provider-services tx deployment create akash/deploy.yaml --from <wallet>`
3. Pick a bid, create the lease, send the manifest.
4. **Verify network isolation** (F18): confirm the `writer` service is reachable
   ONLY from `pomerium` (the SDL exposes it `to: [service: pomerium]`, not global).
   From outside, only `:443`/Pomerium should answer.
5. Point the loop at it: `BENCHFIRST_WRITER_URL=https://verdict.<domain>` in `.env`.
6. `npm run verify-live` → **Writer gate** goes green (healthz ok; anonymous write
   blocked).

## Stage 6 — i8 live capture
With all legs green in `verify-live`, run the demo through the live stack and
capture it (see the i8 task). **Idle-machine discipline (F15):** quit Docker
Desktop + heavy apps first so the local benchmark stays under CoV 0.08. Capture
one **rejected** opinion-write too — that's the trust money-shot.

---

### Rollback / safety
- Everything is env-gated: unset the vars and the loop/demo fall back to fully
  offline (local memory, deterministic picker, ungated writer). No code change to
  revert a bad live leg.
- `.env` and `*.pem` are gitignored — never commit them.
- F8: with a real bucket set, `npm run demo`'s startup reset would wipe the shared
  S3 scar file. Decide reset semantics before pointing the demo at the live bucket.
