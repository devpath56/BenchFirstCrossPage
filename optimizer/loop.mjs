// The lightweight eval-optimizer loop with a cross-page memory layer.
//
//   run benchmark (baseline)  ->  retrieve memory by signature
//     ->  generate candidate fixes (memory-ranked; skip known losers)
//     ->  score each by MEASURED delta  ->  promote best
//     ->  refuse "done" until best beats baseline  ->  write result back to memory
//
import { signature } from '../bench/signature.mjs';
import { measure, readProfile } from '../bench/harness.mjs';
import { pickOrder } from './picker.mjs';
import { submitVerdict } from '../memory/writer.mjs';
import * as memory from '../memory/s3-store.mjs';

const THRESHOLD = 20; // a candidate must cut render time by >=20% to count as a real win
// The candidate fixes the optimizer can try (baseline = the request-waterfall we beat).
// `spinner` is a cosmetic non-fix that does NOT cut load time — memory learns to skip it.
const ALL_FIXES = ['parallel', 'spinner'];

export async function optimize({ browser, url, pageId, runs = 3 }) {
  const profile = await readProfile(browser, url, pageId);
  const sig = signature(profile);
  const mem = await memory.load();
  const known = mem[sig];

  // 1. Baseline benchmark — the number every candidate must beat.
  const baseline = await measure(browser, url, pageId, 'baseline', runs);

  const report = {
    pageId,
    signature: sig,
    warmStarted: !!known,
    baselineMs: +baseline.mean.toFixed(1),
    baselineCov: baseline.cov,
    candidates: [],
    benchRuns: baseline.n,
    memorySource: memory.source(),
  };

  // 2. Decide candidate order. The picker PROPOSES (Bedrock when configured, the
  //    deterministic fallback otherwise); the benchmark below still DISPOSES.
  const { order, skippedLosers, source } = await pickOrder({ signature: sig, allFixes: ALL_FIXES, known });
  report.skippedKnownLosers = skippedLosers;
  report.orderSource = source;

  // 3. Score candidates by measured delta.
  for (const strat of order) {
    const m = await measure(browser, url, pageId, strat, runs);
    report.benchRuns += m.n;
    const deltaPct = ((baseline.mean - m.mean) / baseline.mean) * 100;
    const beat = deltaPct >= THRESHOLD;
    report.candidates.push({
      strategy: strat,
      ms: +m.mean.toFixed(1),
      deltaPct: +deltaPct.toFixed(1),
      beat,
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
      firstSeenPage: known?.firstSeenPage ?? pageId,
      updatedByPage: pageId,
    },
  });

  return report;
}
