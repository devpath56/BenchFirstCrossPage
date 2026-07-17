# BenchFirst · cross-page memory

**An agent that writes a deterministic benchmark *first*, then optimizes a slow React page and refuses to say "done" until it re-runs the benchmark and beats its own baseline — now with a memory that carries wins from one page to the next.**

Built for a one-day hackathon, inspired by Siadhal Magos' Metaview post
[*Improving React page performance with AI agents*](https://www.metaview.ai/resources/blog/improving-react-page-performance-with-ai-agents).
The blog's loop is powerful but **amnesiac**: it tracks progress in a shared
markdown file and starts cold every run — re-deriving fixes it already learned
don't help, and never carrying a win from one page to the next. BenchFirst adds
the missing piece: a **memory layer** over the optimize loop.

## The real problem it solves
Metaview has many React surfaces (Feed, Sourcing, Reports…). Optimizing each one
from scratch means the agent re-explores the same candidate fixes every time. A
cross-page memory of *what actually worked* (measured, not guessed) turns every
future page into a warm start.

## The loop (a lightweight "eval → optimizer" pattern)
```
run benchmark (baseline)         ← the deterministic "scale" the agent trusts
  → retrieve memory by signature ← what worked on this class of problem before?
  → generate candidate fixes     ← memory-ranked; skip known losers
  → score each by MEASURED Δ     ← real render time, not an LLM's opinion
  → promote the best             ← highest measured improvement wins
  → refuse "done" until it beats baseline
  → write the result back to memory
```

### Two memory behaviors
- **A — warm-start.** Before proposing fixes, retrieve past `{symptom → fix → Δ → beat?}`.
  Try the known winner first; **skip strategies memory already proved don't help.**
- **B — cross-page transfer.** The memory key is a *problem signature*, not a page id,
  so a fix learned on Page A is retrieved for any page with the same pathology.

## The demo — cold vs warm
```
npm install          # React + Vite + Playwright
npm run demo         # builds, then runs the whole loop headless
```
`npm run demo` optimizes **Page A** with an empty memory (cold), then **Page B**
using the memory it just built (warm). Representative run:

|                        | Page A (cold) | Page B (warm) |
|------------------------|:-------------:|:-------------:|
| candidates tested      | 3             | **1**         |
| benchmark runs         | 12            | **6**         |
| winner                 | windowed      | windowed      |
| render-time cut        | −88.9%        | −81.9%        |
| warm-started from memory | no          | **yes (from Page A)** |

Page A discovers that `memo-badprops` — a plausible fix (`React.memo` defeated by an
unstable inline prop, a classic real bug) — actually makes things *worse* (−16.4%),
and records it as a loser. **Page B skips it automatically** and warm-starts straight
to the winning strategy. The optimizer also empirically finds that virtualization
(`windowed`) beats memoization for a multi-thousand-row list — which matches
real-world React guidance.

## Why the benchmark is trustworthy (the part that's easy to fake)
The whole premise collapses if the benchmark can't tell a real fix from measurement
noise. So the harness (`bench/harness.mjs`) runs real Chromium under a **4× CPU
throttle**, replays a **scripted interaction**, discards a warm-up run, and reports
the **coefficient of variation (CoV)** alongside every number. In this environment
the baseline CoV is ~2–5% while real fixes move the metric 40–90% — signal well
clear of noise. (This was gated *before* any build via a determinism probe; see
"Provenance" below.)

## Layout
```
src/                 two slow React pages sharing one pathology class
  pages/HeavyList.jsx  the list + the candidate strategies (baseline/memo/memo-badprops/windowed)
  pages/PageA.jsx      "Feed"     (3000 rows)   ── different pages,
  pages/PageB.jsx      "Sourcing" (2000 rows)   ── same problem signature
bench/
  harness.mjs        Chromium + CPU throttle + scripted replay → measured render ms + CoV
  signature.mjs      problem signature (what makes transfer work)
optimizer/
  loop.mjs           the eval-optimizer loop: retrieve → score → promote → refuse/writeback
memory/
  store.mjs          durable JSON memory  ·  memory.json is the store
scripts/
  demo.mjs           the cold-vs-warm demo + deterministic acceptance checks
```

## Notes
- **Browsers:** this environment ships Chromium at `PLAYWRIGHT_BROWSERS_PATH`. Elsewhere,
  run `npx playwright install chromium` once.
- **The "fixes" are strategies, not live code edits** — each page renders under a chosen
  strategy via `#page=a&variant=memo`. This keeps the eval-optimizer loop honest and
  deterministic within a hackathon day; wiring the winner back as an actual code change
  is the natural next step.

## Provenance
Built under a three-prong "Trident" quality harness (a Do-er, a user-loyal intent
checker, and a separate-model Auditor). Before any code, a Phase-0 gate probed the
riskiest assumption — *can the benchmark distinguish a real fix from noise on this
machine?* — and only proceeded once it passed with margin. The acceptance checks in
`scripts/demo.mjs` are the machine-checkable version of "refuses done until it beats
its own baseline."
