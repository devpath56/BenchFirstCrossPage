# BenchFirst — Demo UI test cases (write these before the overlay pane)

> **These are not invented — each derives from a spec we already wrote or the demo flow we designed.**
> The overlay control pane is built to PASS these; the tests are the contract for the UI (same
> discipline as `acceptance.md`: behavior, not a screenshot). `from:` names the source of each case.

Format: `ID — title` · **Given/When** · **Then (PASS)** · **Fail signature** · `from:`

---

## A. Control pane — the optimize loop  (from: demo flow + `optimizer/loop.mjs`)
- **T-A1 — loop counter advances**
  When Run is clicked · Then a loop counter ticks 1,2,3…, and each iteration shows the candidate tried + its measured Δ + a score · Fail: counter static, or an iteration shows no candidate/score · from: demo flow beat 3.
- **T-A2 — score climbs, best-so-far kept**
  When loops run · Then the score gauge moves toward the best candidate and never shows a worse score as "current best" · Fail: gauge regresses or shows a beaten candidate as leader · from: eval-optimizer re-rank.
- **T-A3 — stop on a *trustworthy* win, not any win**
  When a candidate beats baseline AND clears the ship bar · Then the loop stops and surfaces "fix found" · Fail: stops on a beat that fails confidence/correctness, or never stops · from: `acceptance.md`.
- **T-A4 — side-by-side race is visible**
  When a fix is found · Then baseline (slow) and fixed (fast) load **simultaneously** and the fixed side visibly finishes first · Fail: only one loads, or they're sequential/instant · from: demo decision (side-by-side).

## B. The five states  (from: `spec/state-matrix.md`)
Each must be reachable (via the dev state-switcher) and render its designed treatment.
- **T-B1 loading** — skeletons + progress + "measuring… n/N"; inputs locked · from: state-matrix `loading`.
- **T-B2 empty** — "no scar yet — exploring all candidates" · from: `empty`.
- **T-B3 success** — winner + −Δ + "verdict written" · from: `success`.
- **T-B4 low-confidence** — ⚠ "beat by X% but confidence < 0.5 — may be noise; needs human" · from: `low-confidence` (the drawn state).
- **T-B5 error** — "benchmark untrusted/unavailable — here's why; Try Again" · from: `error`.

## C. Decision Report — 3 rows  (from: the 3-row card + `spec/contract.md` verdict)
- **T-C1 — renders 3 rows + recommendation**
  When a fix is found · Then the report shows **Impact**, **Provenance**, **Nothing-else-broke**, and a **Recommendation** · Fail: a row missing, or recommendation absent · from: card design.
- **T-C2 — Impact matches the measured winner**
  Then Impact's before/after ms and Δ equal the loop's calibrated winner (`report.winnerDeltaPct`, adjusted ms) · Fail: card number ≠ engine number · from: `contract.md` (card reads the verdict, doesn't recompute).
- **T-C3 — happy: all green → SHIP**
  When win is real (row 2 ✓) and safe (row 3 ✓) · Then Recommendation = **SHIP**, Approve enabled · Fail: SHIP with a red row · from: `acceptance.md` ship rule.
- **T-C4 — fail row 2 (measurement): REVIEW**
  When the winning candidate's `confidence < CONF_MIN` (noisy CoV / thin margin) · Then Provenance row is ⚠ and Recommendation = **REVIEW** ("win may be noise"), Approve routed to review · Fail: SHIP on low confidence · from: `state-matrix.md` low-confidence + `verdict.confidence`.
- **T-C5 — fail row 3 (correctness): REVIEW**
  When a candidate is faster BUT a flow assertion fails (e.g. a fee dropped → Amount Due ≠ $224) · Then Nothing-else-broke shows ✗ with the specific break and Recommendation = **REVIEW** ("faster, but broke X") · Fail: SHIP despite a broken flow · from: fired-metric guard (new correctness check).

## D. Approve / review path  (from: `acceptance.md` + `schema/verdict.json`, mocked write)
- **T-D1 — Approve ships → aha**
  When Approve on a SHIP recommendation · Then the patch "goes live": the app reloads visibly fast + a ship confirmation · Fail: nothing changes, or slow app persists · from: demo aha beat.
- **T-D2 — Send for review holds**
  When Send-for-review (or a REVIEW recommendation) · Then no auto-ship; the verdict is queued for a human · Fail: it ships anyway · from: `acceptance.md` (low-confidence/error → hold).
- **T-D3 — write is verdict-only**
  Then the recorded payload matches `schema/verdict.json` (winner, candidates{deltaPct,beat}, confidence, provenance) — **no raw opinion / no PII** · Fail: payload carries non-verdict content · from: `contract.md` + Pomerium write-guard.

## E. Ship gate  (from: `spec/acceptance.md`)
- **T-E1 — Approve gated on the ship bar**
  Approve is only offered when: warm tests ≥50% fewer candidates · time-to-settled cut ≥60% · confidence ≥0.5 · correctness ✓. Otherwise the only action is Send-for-review · Fail: Approve offered on a failing bar · from: `acceptance.md`.

## F. Warm-transfer aha  (from: memory transfer, built)
- **T-F1 — page 2 warm-starts**
  After shipping the Registration fix, switch to Appointments · Then it warm-starts (fixed in 1 loop) and the report notes "remembered from Registration" · Fail: page 2 re-explores from scratch · from: `optimizer/loop.mjs` cross-page transfer.

## G. Agent-drivable (CLI/MCP)  (from: `spec/contract.md`)
- **T-G1 — pane is drivable without clicks**
  The pane's actions (Run, read loop state, read report, approve) are reachable via `window.__dmv` / a control API, not only the mouse · Fail: behavior only exists in click handlers · from: `contract.md` stable interface.

## H. Regression  (from: Trident CF-063 / `regression-cases.md`)
- **T-H1 — no hang**
  Any run/measure the pane triggers resolves within a bounded timeout · Fail: a run never settles after a state transition · from: CF-063 (effect-deps timer-cancel).

---

## Coverage note
Every case above traces to a `from:` source. **Two cases require a new build** the specs don't yet cover:
`T-C5` and the fired-metric half of `T-E1` need a **flow-correctness check** (assert the DMV flow still
works after a fix). That check is the one genuinely new thing — and it's also what powers the
graceful-failure beat, so it's worth designing next.
