# F17 — verdict-writer identity gate: verification status

## What is proven

The enforcement path is proven **end-to-end with a MOCK OIDC IdP** (navikt/mock-oauth2-server),
using the real `pomerium/config.yaml` (global `jwt_claims_headers: {x-pomerium-claim-email: email}`
map) and the real writer image `ishamishra0408/benchfirst-writer:v1` with its identity gate on.
Only the IdP endpoints were swapped to the mock — routes, policy, the writer, and the
`jwt_claims_headers` map were unchanged.

Pomerium v0.28.0 → writer, three cases through the proxy:

| Case | Mock-issued identity | Result | Where it was decided |
|------|----------------------|--------|----------------------|
| no identity | (none — no session) | **401** (API/`Accept: application/json`) / **302** to login (browser) | Pomerium edge; never reaches writer |
| wrong identity | attacker@evil.example | **403** `email-unauthorized` | Pomerium policy; never reaches writer |
| correct identity | ishamishra0408@gmail.com (== `BENCHFIRST_VERDICT_IDENTITY`) | **200** `{"ok":true}` | Pomerium allowed → writer gate matched |

- **X-Pomerium-Claim-Email reached the writer**: yes. The writer's gate does a string
  equality of `x-pomerium-claim-email` against `BENCHFIRST_VERDICT_IDENTITY`; the 200 in the
  correct-identity case is only reachable if that header arrived with the matching value.
  (Header injection was also directly observed on an echo upstream — see
  `f17-headers-global-claims-fix.txt`.)
- **Defence-in-depth confirmed**: in the no-identity and wrong-identity cases the request never
  reached the writer at all — Pomerium blocked it at the edge.

### Note on the "no identity" status code
HTTP-correct behavior: no session → **401 Unauthorized** (not authenticated) for a machine/API
caller, or a **302** redirect to login for a browser. **403** is reserved for *authenticated but
forbidden* — which is exactly the wrong-identity case. The earlier standalone writer test
(Stage 3.6) showed the writer's own fail-closed backstop returns 403 when hit directly with no
identity header; behind Pomerium the request is stopped before it gets there.

## What is NOT yet proven

Real **Google** login is **blocked on localhost** by the OAuth client's redirect-URI
restriction: Pomerium's authenticate service uses
`https://authenticate.localhost/oauth2/callback`, but the Google client only authorizes
`https://localhost/oauth2/callback` (see `f17-pomerium-callback-mismatch.txt`). A real Google
interactive consent also cannot be completed from a headless environment.

**Real-IdP (Google) verification is deferred to Stage 5**, once a real domain + real
certificates exist and the correct `…/oauth2/callback` URL is registered in the Google console.

## Evidence files
- `f17-pomerium-no-identity-MOCKIDP.txt` — 401 (machine) / 302 (browser)
- `f17-pomerium-wrong-identity-MOCKIDP.txt` — 403 `email-unauthorized`
- `f17-pomerium-correct-identity-MOCKIDP.txt` — 200 `{"ok":true}`
- `f17-headers-global-claims-fix.txt` — Pomerium injecting `X-Pomerium-Claim-Email` (echo upstream)
- `f17-pomerium-callback-mismatch.txt` — the real-Google redirect_uri blocker
