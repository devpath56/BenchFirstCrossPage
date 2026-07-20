// The lightweight eval-optimizer loop with a cross-page memory layer.
//
//   run benchmark (baseline)  ->  retrieve memory by signature
//     ->  generate candidate fixes (memory-ranked; skip known losers)
//     ->  score each by MEASURED delta  ->  promote best
//     ->  refuse "done" until best beats baseline  ->  write result back to memory
//
import { signature } from '../bench/signature.mjs';
import { measure, measureOverhead, readProfile, checkCorrectness } from '../bench/harness.mjs';
import { pickOrder } from './picker.mjs';
import { submitVerdict } from '../memory/writer.mjs';
import * as memory from '../memory/s3-store.mjs';

const THRESHOLD = 60; // d4 ship number: a candidate must cut time-to-settled by >=60% to count as a real win
// Determinism gate (same bar as the Akash preflight). A measurement whose
// coefficient of variation exceeds this is too noisy to trust — a jittery run
// can mint a fake "win" (see FLAGS F10/F15), so the loop REFUSES rather than
// writes an unearned verdict. Trust story: the scale must be steady before we read it.
const MAX_COV = 0.08;
const CONF_MIN = 0.5; // confidence floor: below it, hold for a human (D8)
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// The candidate fixes the optimizer can try (baseline = the request-waterfall we beat).
// `spinner` is a cosmetic non-fix that does NOT cut load time — memory learns to skip it.
const ALL_FIXES = ['parallel', 'spinner'];

export async function optimize({ browser, url, pageId, runs = 3 }) {
  const profile = await readProfile(browser, url, pageId);
  const sig = signature(profile);
  const mem = await memory.load();
  const known = mem[sig];

  // Calibrate the ruler: measure the harness's fixed overhead, then subtract it so the
  // cut reflects the app, not the test rig (#1). `adj` is the app-attributable time.
  const overhead = await measureOverhead(browser, url, pageId);
  const adj = (ms) => Math.max(1, ms - overhead);

  // 1. Baseline benchmark — the number every candidate must beat.
  const baseline = await measure(browser, url, pageId, 'baseline', runs);

  const report = {
    pageId,
    signature: sig,
    warmStarted: !!known,
    overheadMs: +overhead.toFixed(1),
    baselineMs: +baseline.mean.toFixed(1),
    baselineAdjMs: +adj(baseline.mean).toFixed(1),
    baselineCov: baseline.cov,
    candidates: [],
    skippedKnownLosers: [],
    benchRuns: baseline.n,
    memorySource: memory.source(),
  };

  // 1a. Determinism gate on the anchor. If the baseline itself is noisy, every
  //     delta measured against it is untrustworthy — refuse before we can lie.
  if (baseline.cov > MAX_COV) {
    report.done = false;
    report.winner = null;
    report.untrusted = true;
    report.refusal =
      `Baseline CoV ${baseline.cov} exceeds ${MAX_COV} — measurement too noisy to trust. ` +
      `Refusing to declare a winner (would risk a false verdict).`;
    return report;
  }

  // 2. Decide candidate order. The picker PROPOSES (Bedrock when configured, the
  //    deterministic fallback otherwise); the benchmark below still DISPOSES.
  const { order, skippedLosers, source } = await pickOrder({ signature: sig, allFixes: ALL_FIXES, known });
  report.skippedKnownLosers = skippedLosers;
  report.orderSource = source;

  // 3. Score candidates by measured delta.
  for (const strat of order) {
    const m = await measure(browser, url, pageId, strat, runs);
    report.benchRuns += m.n;
    // Calibrated measured cut (overhead removed).
    const calDelta = ((adj(baseline.mean) - adj(m.mean)) / adj(baseline.mean)) * 100;
    // Physical ceiling: a fix cannot settle faster than its longest component, so the cut can't
    // exceed the structural (model) cut. Capping here removes the over-subtraction overshoot on
    // fast variants without letting the model inflate anything — min() only ever lowers.
    const modelDelta = baseline.settleModelMs
      ? ((baseline.settleModelMs - m.settleModelMs) / baseline.settleModelMs) * 100
      : calDelta;
    const deltaPct = Math.min(calDelta, modelDelta);
    // A win must clear the threshold AND come from a steady measurement — a
    // noisy candidate run can't be promoted (guards against a jitter-born delta).
    const trusted = m.cov <= MAX_COV;
    const beat = trusted && deltaPct >= THRESHOLD;
    report.candidates.push({
      strategy: strat,
      ms: +m.mean.toFixed(1),
      deltaPct: +deltaPct.toFixed(1),
      cov: m.cov,
      beat,
      ...(trusted ? {} : { untrusted: true }),
    });
    // Warm-start early stop: if memory pointed us at a winner and it beats, we're
    // done — no need to explore the rest. This is the cross-page speed-up (B).
    if (known && beat) break;
  }

  // 4. Promote best — or REFUSE "done" if nothing beat baseline (the core promise).
  const winners = report.candidates.filter((c) => c.beat).sort((a, b) => b.deltaPct - a.deltaPct);
  if (winners.length === 0) {
    report.done = false;
    report.winner = null;
    report.refusal = `No candidate beat baseline by >=${THRESHOLD}%. Refusing to declare done.`;
    return report;
  }
  report.done = true;
  report.winner = winners[0].strategy;
  report.winnerDeltaPct = winners[0].deltaPct;

  // Explicit confidence (0..1) carried WITH the verdict = measurement trust × win margin.
  // Trust is high when the benchmark is tight (low cov) AND the win clears the threshold
  // comfortably. It is emitted, not left for a consumer to re-derive.
  const covTrust = clamp01(1 - baseline.cov / MAX_COV);
  const marginTrust = clamp01((report.winnerDeltaPct - THRESHOLD) / THRESHOLD);
  report.confidence = +(covTrust * marginTrust).toFixed(2);

  // Flow-correctness of the winner — "nothing else broke" (the fired-metric guard). A faster
  // candidate that breaks the flow must NOT ship on speed alone.
  report.correctness = await checkCorrectness(browser, url, pageId, report.winner);
  report.recommendation = report.correctness.ok && report.confidence >= CONF_MIN ? 'SHIP' : 'REVIEW';

  // 5. Write back — through the verdict WRITER, never directly to the store.
  //    The writer re-validates against schema/verdict.json; an unmeasured
  //    "opinion" would be rejected here before it could reach S3.
  const mergedCandidates = known ? { ...known.candidates } : {};
  for (const c of report.candidates) {
    mergedCandidates[c.strategy] = { deltaPct: c.deltaPct, beat: c.beat };
  }
  await submitVerdict({
    signature: sig,
    record: {
      winner: report.winner,
      candidates: mergedCandidates,
      confidence: report.confidence,
      firstSeenPage: known?.firstSeenPage ?? pageId,
      updatedByPage: pageId,
    },
  });

  return report;
}
