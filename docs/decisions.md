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

| D8 | **`CONF_MIN` = 0.5** — floor splitting `success` from `low-confidence` | coin-flip floor; below it a win is as likely noise as signal | 0.6 / 0.7 (stricter) | **you** | accepted |
| D10 | **Ship bar = composite** (spec/acceptance.md) | measured, defensible; already mostly checked by the demo | single headline metric | **you** | accepted |
| D11 | **`confidence` = covTrust × marginTrust** (product) | a shaky benchmark never reads confident, however big the win | weighted avg / min | **you** | accepted |
| D12 | Ship clause 2 = **≥60%**, made honest by **calibrating the ruler** (measure & subtract harness overhead) + **capping at the structural limit** | don't lower the goalpost — fix the instrument; the cut then holds ~62–66% (Appointments) / ~84% (Registration) | lower floor to 50% (goalpost-moving) · model-only | **you** (#1+#3) + me | accepted |

> Convention going forward: each loop's key decision lands here as **proposed** first; I build only
> after you accept (or edit) it.
