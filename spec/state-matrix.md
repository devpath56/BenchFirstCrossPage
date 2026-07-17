# BenchFirst — State Matrix

> One row per state, each with a **designed treatment** — so the unhappy rows are on the page, not
> discovered in the demo. Like the contract, this **points at the code** that drives each state
> (`optimizer/loop.mjs`, `verdict.confidence`, `src/pages/dmvlist.jsx`) so it can't drift.

## First principles — two state machines, don't conflate them
- **User surface** — the DMV app: `idle → loading → success | empty | error` (implemented in
  `src/pages/dmvlist.jsx`, driven by input triggers). This is what a person sees.
- **Agent / verdict surface** — the ship / needs-human / refuse decision. This is where the
  **unhappy rows hide**: `low-confidence` is not a DMV state, it is an *eval* state driven by the
  `confidence` field the contract now emits.

**This matrix is the agent surface.**

## The matrix
| State | Trigger (in contract terms) | Driving field / code (SSOT) | Designed treatment | Status |
|---|---|---|---|---|
| **loading** | benchmark is running | `window.__benchfirst.runInteraction()` · `bench/harness.mjs` | "measuring under throttle… run _n/N_"; inputs locked; no verdict shown | today |
| **empty** | cold — no memory for this signature | `memory.load()[sig]` absent | "no scar yet — exploring **all** candidates" | today |
| **success** | ≥1 candidate beats baseline **AND** `confidence ≥ CONF_MIN` | `optimizer/loop.mjs` winner · `verdict.confidence` | **AHA:** "−X% winner, transferred; verdict written" | refuse-done + `confidence` today; the `CONF_MIN` gate _(planned)_ |
| **low-confidence** ⭐ | a candidate **beat** baseline **BUT** `confidence < CONF_MIN` (noisy `cov` and/or thin margin) | `verdict.confidence` | ⚠ "Beat by X% but **confidence 0.21** — benchmark too noisy / margin thin. `needs_human` = true; **do not auto-ship**; re-run or tighten before promoting." | **undrawn → defined here**; enforcement = Loop 4 / demo check |
| **error** | benchmark can't run, crashes, or determinism gate `cov > 0.08` | `bench/preflight.mjs` _(planned)_ · harness errors · `dmvlist.jsx` error state | "Refuse: the benchmark is untrusted or unavailable — _here's why_. Try Again." | app error today; cov-gate _(planned)_ |

## The ship rule (why the matrix matters)
```
success        → ship (write verdict, promote, transfer)
low-confidence → needs_human (hold — the win may be noise)
error          → refuse (never ship on an untrusted benchmark)
```
`low-confidence` and `error` both set `needs_human = true`. A green Δ alone is **not** enough — the
measurement has to be trustworthy (`confidence ≥ CONF_MIN`).

## The one decision this pillar adds
- **`CONF_MIN = 0.5`** — the confidence floor that separates `success` from `low-confidence`. A
  coin-flip floor: below it, the win is as likely noise as signal. Tunable; stated here so it is a
  choice, not an accident. (The cold demo run at `confidence 0.21` lands in `low-confidence`; the warm
  run at `0.88` is `success`.)

## Done when (acceptance for this pillar)
- Every state has a **trigger in contract terms** and a **designed treatment** (no bare list).
- `low-confidence` is **drawn** — it has a treatment and a numeric threshold, not just a name.
- Every state points at the **code / field** that drives it; planned enforcement is marked _(planned)_.
