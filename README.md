# BenchFirst · cross-page memory

**An agent that writes a deterministic benchmark first, then optimizes a slow React page and refuses to
say "done" until it re-runs the benchmark and beats its own baseline — with a memory that carries the
winning fix from one page to the next.**

Inspired by Siadhal Magos' Metaview post *Improving React page performance with AI agents*. That loop is
powerful but **amnesiac** (shared markdown, cold every run). BenchFirst adds the missing piece: a memory
over the optimize loop.

## The app it optimizes
A faithful React port of the legacy **California DMV online services** — deliberately slow. Two pages:
- **Registration** — look up a vehicle, then the fees **stream in one row at a time while "Amount Due" climbs**.
- **Appointments** — office lookup: results header → office cards → map, each resolving staggered; the **map is the long pole**.

The shared anti-pattern is a **request waterfall**: components fetch one-after-another (a classic React
data-fetching mistake), so time-to-interactive is the *sum* of the parts, dominated by the long pole.

## The loop (lightweight eval → optimizer)
```
run benchmark (baseline time-to-settled)   ← the deterministic "scale" the agent trusts
  → retrieve memory by problem signature   ← what fixed this class of problem before?
  → propose candidate fixes                ← (Bedrock; offline fallback = fixed order)
  → score each by MEASURED time-to-settled ← real elapsed, not an opinion
  → promote the best                       ← biggest measured cut wins
  → refuse "done" until it beats baseline
  → write the verdict back to memory
```

### Candidate fixes (for a waterfall)
| Strategy | What it does | Result |
|---|---|---|
| baseline | fetch waterfall (settle = sum of parts) | the slow page |
| **parallel** | fetch concurrently (settle = the longest part) | **the real fix** |
| spinner | cosmetic only (settle unchanged) | a plausible non-fix → recorded as a loser |

### Memory: warm-start + cross-page transfer
The memory key is the **problem class** (`waterfall-load`), not the page — so a fix learned on
**Registration transfers to Appointments** by design (`bench/signature.mjs`). On a warm page the agent
tries the known winner first and **skips known losers**.

## The demo — cold vs warm
```
npm install
npm run demo        # builds, then runs the loop headless
```
Optimizes Registration cold (empty memory), then Appointments warm (memory from Registration).
Representative run:

| | Registration (cold) | Appointments (warm) |
|---|:---:|:---:|
| candidates tested | 2 | **1** |
| benchmark runs | 9 | **6** |
| winner | parallel | parallel |
| time-to-settled cut | −67% | −60% |
| warm-started from memory | no | **yes** |

The agent discovers `spinner` doesn't help, records it as a loser, and Appointments **skips it automatically**.

## Why the benchmark is trustworthy
The premise collapses if the benchmark can't tell a real fix from noise. `bench/harness.mjs` launches
real Chromium, replays the scripted interaction time-compressed, discards a warm-up run, and reports the
**coefficient of variation** with every number (CoV ~1–3% here vs 60%+ fix deltas). A Phase-0 probe
gated this before any build was allowed.

## Run / drive it
- `npm run dev` — open the DMV app (`#page=a` Registration, `#page=b` Appointments). Trigger states via
  inputs: default → success · `NONE`/`00000` → empty · `FAIL`/`ERROR` → error.
- **Agent / CLI / MCP hooks** (the stable interface): `window.__dmv` (`setInput` / `submit` / `getState`)
  and `window.__benchfirst.runInteraction() → { ms, settleModelMs }`.

## Layout
```
src/pages/dmvlist.jsx   config-driven DMV engine (state machine + staggered loads + agent hooks)
src/pages/pageA.jsx     Registration  (data + renderStage only)
src/pages/pageB.jsx     Appointments  (data + renderStage only)
bench/harness.mjs       Chromium + scripted replay → measured time-to-settled + CoV
bench/signature.mjs     the problem-class key that makes cross-page transfer work
optimizer/loop.mjs      retrieve → score → promote → refuse/writeback
memory/store.mjs        local JSON memory (the "scar file")
memory/s3-store.mjs     scar file on S3 (BENCHFIRST_S3_BUCKET / _S3_KEY env; local fallback when unset)
scripts/demo.mjs        the cold-vs-warm demo + deterministic acceptance checks
```

## Sponsor architecture (in progress)
The loop is designed to wrap three sponsor tools, each load-bearing:
- **Bedrock (Claude)** proposes candidate fixes (`optimizer/picker.mjs`; offline fallback today).
- **Akash** runs the deterministic benchmark on a lease, gated by the CoV preflight.
- **Pomerium** guards the write path so only a validated **verdict** — never the agent's opinion —
  reaches the **S3** scar file (`schema/verdict.json`).

## Provenance
Built under the three-prong **Trident** harness (a Do-er, a user-loyal intent guard, and a
different-model Auditor over one failures-log). A Phase-0 gate probed the riskiest assumption before any
code; the acceptance checks in `scripts/demo.mjs` are the machine-checkable form of "refuses done until
it beats its own baseline."

## Notes
- Fixes are selected **strategies** (`#page=a&variant=parallel`), not live code edits — the honest
  thin-slice boundary. Emitting a real diff is the natural next step.
