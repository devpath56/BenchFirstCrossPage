# BenchFirst — Prompt Contract (the stable interface)

> **This spec POINTS at the running artifacts; it does not restate them.** The code is the single
> source of truth, so this contract cannot drift the way the README once did. If a field changes,
> it changes in `schema/verdict.json` (or the exposed interface) and this doc's references still
> resolve. Prose that duplicates a field list is a bug in this file.

## First principles — why not `out = JSON {reply, confidence, needs_human}`
BenchFirst has no "reply." Its only trustworthy output is a **measured verdict** — did a candidate
fix beat the baseline, by how much, and can we trust the measurement. Copying a chatbot template
would be reasoning by analogy. The contract below is derived from what the agent actually produces.

## The interface — single source of truth is the code
| Concern | SSOT (read here) | Do NOT restate in prose |
|---|---|---|
| Output / memory record shape | [`schema/verdict.json`](../schema/verdict.json) | the field list |
| Driving interface | `window.__benchfirst.runInteraction() → { ms }` · `window.__dmv` (`setInput` / `submit` / `getState`) — in [`src/pages/dmvlist.jsx`](../src/pages/dmvlist.jsx) | method signatures |
| Problem signature | [`bench/signature.mjs`](../bench/signature.mjs) | the keying rule |
| Refusal logic | [`optimizer/loop.mjs`](../optimizer/loop.mjs) | the threshold |

## Input → Output
- **Input:** a page under a variant + its problem signature (`{ interaction }`, via `bench/signature.mjs`).
- **Output:** a **verdict** conforming to `schema/verdict.json` — `winner`, per-candidate `{ deltaPct, beat }`, and `provenance { runner, cov }`.
- **`confidence`** is an **explicit field emitted with the verdict** (`schema/verdict.json`, written by `optimizer/loop.mjs`): a 0–1 scalar = measurement trust (from `provenance.cov`) × the winner's margin over the threshold. Consumers read it; they never re-derive it.
- **`needs_human` (refusal)** is true iff **(a)** no candidate beats baseline (*refuse-done*) **OR (b)** `cov > 0.08` (*benchmark untrusted*). **(a)** is enforced today in `optimizer/loop.mjs`; **(b)** is the planned determinism preflight (`bench/preflight.mjs`, engineering track) — not decided by prose.
- **Never PII:** a verdict is perf data only — timings, deltas, strategy names. No user content ever enters the payload.

## Stable vs changeable (the pillar's core question)
| STABLE — the interface (breaking it breaks consumers) | CHANGEABLE — wording (safe to iterate) |
|---|---|
| verdict JSON shape (`schema/verdict.json`) | labels, copy, colors |
| refusal semantics: refuse-done (today) · cov-gate _(planned)_ | candidate display order |
| verdict-only write guard (Pomerium → S3) _(planned)_ | strategy names in prose |
| `window.__benchfirst` / `window.__dmv` method names | dashboard / demo layout |

## Drift-proofing rule (the elegant part)
A reviewer verifies this contract by **running the prototype and inspecting the emitted verdict**,
not by reading prose. If prose and code disagree, **the code wins and this doc is wrong by
definition.** That inversion — spec points at code, code is truth — is what stops the drift the
README suffered.

## Done when (acceptance for this spec pillar)
- Every claim here resolves to a named file / interface that **exists**.
- **No field list** is duplicated from `schema/verdict.json`.
- The refusal semantics stated here **match** `optimizer/loop.mjs`.
