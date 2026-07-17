// The lightweight eval-optimizer loop with a cross-page memory layer.
//
//   run benchmark (baseline)  ->  retrieve memory by signature
//     ->  generate candidate fixes (memory-ranked; skip known losers)
//     ->  score each by MEASURED delta  ->  promote best
//     ->  refuse "done" until best beats baseline  ->  write result back to memory
//
import { signature } from '../bench/signature.mjs';
import { measure, readProfile } from '../bench/harness.mjs';
import * as memory from '../memory/store.mjs';

const THRESHOLD = 20; // a candidate must cut render time by >=20% to count as a real win
// The candidate fixes the optimizer can try (baseline = the request-waterfall we beat).
// `spinner` is a cosmetic non-fix that does NOT cut load time — memory learns to skip it.
const ALL_FIXES = ['parallel', 'spinner'];

export async function optimize({ browser, url, pageId, runs = 3 }) {
  const profile = await readProfile(browser, url, pageId);
  const sig = signature(profile);
  const mem = memory.load();
  const known = mem[sig];

  // 1. Baseline benchmark — the number every candidate must beat.
  const baseline = await measure(browser, url, pageId, 'baseline', runs);

  const report = {
    pageId,
    signature: sig,
    warmStarted: !!known,
    baselineMs: +baseline.mean.toFixed(1),
    baselineCov: baseline.cov,
    baselineRowRenders: baseline.rowRenders,
    candidates: [],
    benchRuns: baseline.n,
    skippedKnownLosers: [],
  };

  // 2. Decide candidate order. With memory: try the known winner first and skip
  //    strategies memory already proved don't beat baseline (A: skip known losers).
  let order;
  if (known) {
    const losers = new Set(
      Object.entries(known.candidates)
        .filter(([, v]) => !v.beat)
        .map(([k]) => k)
    );
    report.skippedKnownLosers = [...losers];
    order = [known.winner, ...ALL_FIXES.filter((s) => s !== known.winner && !losers.has(s))];
  } else {
    order = [...ALL_FIXES]; // cold: explore every candidate
  }

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
      rowRenders: m.rowRenders,
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

  // 5. Write back to memory (merge new knowledge with any prior knowledge).
  const mergedCandidates = known ? { ...known.candidates } : {};
  for (const c of report.candidates) {
    mergedCandidates[c.strategy] = { deltaPct: c.deltaPct, beat: c.beat };
  }
  mem[sig] = {
    winner: report.winner,
    candidates: mergedCandidates,
    firstSeenPage: known?.firstSeenPage ?? pageId,
    updatedByPage: pageId,
  };
  memory.save(mem);

  return report;
}
