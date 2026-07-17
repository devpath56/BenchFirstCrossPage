# BenchFirst — Decision Log

A running record of the choices behind the build, so nothing is decided silently. Each row says **who
decided** (you / me / a Trident audit) and its **status**. Open decisions that need your call are at the
bottom — I hold on those until you answer.

## Decided
| # | Decision | Why | Alternative not taken | Decided by | Status |
|---|---|---|---|---|---|
| D1 | Memory = **A warm-start + B cross-page transfer** | fixes the amnesiac loop; scales across pages | RAG / recruiting-domain memory | **you** | accepted |
| D2 | Sponsors = **Bedrock + Akash + Pomerium** (+ S3) | each load-bearing in the trust story | Buildkite / Zero / Cursor | **you** | accepted |
| D3 | Substrate = **DMV pain-mock** (real anti-pattern app) | believable hero to optimize live | keep synthetic HeavyList | **you** | accepted |
| D4 | Optimizer fixes = **`parallel` (win) / `spinner` (loser)**; metric = **time-to-settled** | matches the waterfall pathology of the DMV app | keep memo/windowed | me | accepted |
| D5 | Signature keys on the **problem class** (`waterfall-load`) | makes Registration→Appointments transfer by design | key on rowCount/page | me | accepted |
| D6 | Contract = **verdict-based; spec points at code** | BenchFirst emits a verdict, not a reply; pointing prevents drift | copy `{reply,confidence,needs_human}` | me (first-principles) | accepted |
| D7 | `confidence` = **explicit emitted field** | consumers read it, don't re-derive | leave it derived | **you** (formula: me) | accepted |
| D9 | Determinism gate = **cov ≤ 0.08** | inherited from the Phase-0 probe that gated the whole build | pick another band | me / probe | accepted |

## Open — need your call (I'm holding)
| # | Decision | My proposal | Options | For |
|---|---|---|---|---|
| D8 | **`CONF_MIN`** — the confidence floor splitting `success` from `low-confidence` | **0.5** (coin-flip floor) | 0.5 · 0.6 · 0.7 · other | state matrix / ship rule |
| D10 | **The ship number** (Loop 3, acceptance = behavior) | see Loop 3 options | — | what "done" means for v1 |
| D11 | `confidence` formula | `covTrust × marginTrust` (both must be high) | product · weighted avg · min | how strict confidence is |

> Convention going forward: each loop's key decision lands here as **proposed** first; I build only
> after you accept (or edit) it.
