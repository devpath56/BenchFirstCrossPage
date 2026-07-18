# Pomerium — the verdict-only write gate (i4)

Pomerium is the identity-aware proxy that fronts the verdict writer. It is the
sponsor-load-bearing piece of the trust story: the target end-state is that
**only the verdict-runner identity can write to the scar file.** That property is
fully enforced only once i5 network-isolates the writer (Pomerium as its sole
ingress) and i7 scopes the S3 credentials — until then this gate is defence in
depth over a convention (in-process callers can still write directly; see FLAGS
F8/F13). i4 delivers the structure and the writer-side backstop.

## Why it exists

The whole BenchFirst promise is that memory holds *earned, measured* verdicts — never
an agent's opinion. Three layers enforce that, defence in depth:

1. **Schema + semantic gate** (`memory/writer.mjs`) — a write must match
   `schema/verdict.json` and carry real measurements with a winner that actually beat
   baseline. Shape-level honesty.
2. **Pomerium identity gate** (this dir) — the writer's HTTP endpoint is only reachable
   through Pomerium, which allows exactly one identity to `POST /verdict`. Nobody else's
   request even arrives.
3. **Scoped S3 credentials** (i7) — only the writer's runtime identity holds
   `s3:PutObject` on the scar-file bucket. Even code that bypassed the writer couldn't
   PUT.

Layer 2 is what turns "opinion can't reach S3" from a code convention (FLAGS F13) into an
enforced property.

## The request path

```
optimizer/loop.mjs
   │  submitVerdict()  → POST https://verdict.<domain>/verdict   (BENCHFIRST_WRITER_URL)
   ▼
Pomerium  ── authenticates caller, checks the allow policy ──►  denies everyone
   │                                                             but the verdict-runner
   │  injects x-pomerium-claim-email (signed JWT identity)
   ▼
writer (http://writer:8787, internal only)
   │  re-checks the identity header (BENCHFIRST_VERDICT_IDENTITY)  ← F13 backstop
   │  validates verdict → merges → PUT
   ▼
S3 scar file  (writer identity is the only s3:PutObject holder — i7)
```

Two things must both hold for the gate to be real:
- **Network isolation** — the writer binds an internal address (`writer:8787`) and is
  *not* publicly reachable; Pomerium is the only ingress. In the container (i5) the
  writer sets `BENCHFIRST_WRITER_HOST=0.0.0.0` but only Pomerium is exposed to the world.
- **Header trust** — Pomerium strips any client-supplied `x-pomerium-*` headers and sets
  its own from the verified JWT, so the writer's header check can't be spoofed by a caller
  that goes through Pomerium.

## What i4 locks vs what i7 fills

**Locked now (`config.yaml` structure):** the route to the writer, `pass_identity_headers`,
and the `allow` policy admitting a single identity. The writer's env-gated identity check
(`BENCHFIRST_VERDICT_IDENTITY`) is wired and tested.

**Filled at i7 (`${ENV}` / `REPLACE_AT_i7` placeholders):** real hostnames
(`BENCHFIRST_DOMAIN`), the IdP / service account, `cookie_secret` / `shared_secret`, and the
signing key. None are committed — they arrive as deploy-time secrets.

## Running the writer with the gate on (dry run, no Pomerium)

The writer's identity backstop is independently testable — simulate what Pomerium injects:

```sh
# gate ON: only the verdict-runner identity may write
BENCHFIRST_VERDICT_IDENTITY=verdict-runner@benchfirst.example \
BENCHFIRST_WRITER_HOST=0.0.0.0 npm run writer

# a request WITHOUT the identity header → 403
curl -s -XPOST localhost:8787/verdict -d '{}'

# a request WITH the verdict-runner header → passes the gate (then hits validation)
curl -s -XPOST localhost:8787/verdict \
  -H 'x-pomerium-claim-email: verdict-runner@benchfirst.example' \
  -H 'content-type: application/json' \
  -d '{"signature":"waterfall-load","record":{"winner":"parallel","candidates":{"parallel":{"deltaPct":63,"beat":true}}}}'
```

Point the loop at the gated writer with `BENCHFIRST_WRITER_URL=https://verdict.<domain>`.
Local/offline (env unset) leaves the writer ungated and the demo unchanged.
