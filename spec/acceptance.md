# BenchFirst — Acceptance = Behavior (the ship bar)

> **"Done" is measured against the eval bar, not matched to a screenshot.** v1 ships only when the
> **running** demo clears every clause below. The bar is checked in `scripts/demo.mjs` (`SHIP:` line),
> not asserted in prose — so, like the contract and state matrix, it can't drift.

## The ship bar (composite — all must hold)
| # | Clause | Threshold | Measured in | Why |
|---|---|---|---|---|
| 1 | warm run tests fewer candidates | **≥50% fewer** (B ≤ A/2) | `demo.mjs` ship gate | memory actually saved work (transfer paid off) |
| 2 | time-to-settled cut, both pages | **≥60%** (calibrated + capped) | `demo.mjs` | the fix is real *and* transfers |
| 3 | shipped (warm) verdict is trustworthy | **confidence ≥ CONF_MIN = 0.5** | `verdict.confidence` | not shipping noise |
| 4 | regression checks | **6/6** acceptance checks PASS | `demo.mjs` `verifyPromises` | nothing regressed |

## Where it runs
`npm run demo` prints **`SHIP: YES ✅`** / **`SHIP: HOLD`** after the acceptance block. The **6/6 checks own
the process exit code** (the regression gate for CI); the `SHIP:` line is the higher **v1-readiness**
gate. A green Δ is necessary but not sufficient — clause 3 makes trust a first-class condition.

## Decisions folded in (see `docs/decisions.md`)
- **CONF_MIN = 0.5** (D8) · **confidence = covTrust × marginTrust** (D11) · **composite bar** (D10).
- **The measurement is calibrated — the goalpost is not lowered** (D12): the harness's fixed overhead
  is measured (a zero-model-time run) and subtracted, then the result is **capped at the structural
  limit** (a fix can't settle faster than its longest component). So the cut honestly reflects the app
  (~62–66% Appointments, ~84% Registration) and the **60%** floor holds without gaming it.

## Done when
- `npm run demo` prints `SHIP: YES` on a normal run.
- Every clause resolves to a **measured** check in `demo.mjs` — no prose-only clause.
