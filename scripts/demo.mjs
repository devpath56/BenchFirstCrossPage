// The money shot: a COLD run (Page A, empty memory) vs a WARM run (Page B,
// memory carried over from Page A). Same pathology class -> Page A's win
// warm-starts Page B, which beats baseline testing fewer candidates.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch } from '../bench/harness.mjs';
import { optimize } from '../optimizer/loop.mjs';
import * as memory from '../memory/s3-store.mjs';

const dist = path.resolve('dist');

function ensureBuild() {
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.log('· no dist/ found — building (npm run build)...');
    execSync('npm run build', { stdio: 'inherit' });
  }
}

function printReport(r) {
  const tag = r.warmStarted ? 'WARM (memory hit)' : 'COLD (empty memory)';
  console.log(`\n  Page ${r.pageId.toUpperCase()}  ·  signature="${r.signature}"  ·  ${tag}`);
  console.log(`  baseline: ${r.baselineMs}ms time-to-settled  (CoV ${r.baselineCov})`);
  if (r.skippedKnownLosers.length) console.log(`  skipped known losers: ${r.skippedKnownLosers.join(', ')}`);
  for (const c of r.candidates) {
    const mark = c.beat ? '✓ beats' : '✗ misses';
    console.log(
      `    candidate ${c.strategy.padEnd(9)} ${String(c.ms).padStart(7)}ms  Δ ${String(c.deltaPct).padStart(5)}%  ${mark}`
    );
  }
  if (r.done) console.log(`  → winner: ${r.winner}  (−${r.winnerDeltaPct}% time-to-settled)  · tested ${r.candidates.length} candidate(s), ${r.benchRuns} bench runs`);
  else console.log(`  → ${r.refusal}`);
}

function printContrast(a, b) {
  console.log('\n' + '='.repeat(64));
  console.log('  COLD vs WARM  (what the memory layer bought us)');
  console.log('='.repeat(64));
  const row = (label, x, y) => console.log(`  ${label.padEnd(26)} ${String(x).padStart(14)} ${String(y).padStart(16)}`);
  row('', 'Page A (cold)', 'Page B (warm)');
  row('candidates tested', a.candidates.length, b.candidates.length);
  row('benchmark runs', a.benchRuns, b.benchRuns);
  row('winner', a.winner, b.winner);
  row('time-to-settled cut', `−${a.winnerDeltaPct}%`, `−${b.winnerDeltaPct}%`);
  row('warm-started from memory', 'no', b.warmStarted ? `yes (from ${b.candidates.length ? 'Page A' : '—'})` : 'no');
}

// The acceptance test — BenchFirst "refuses done until it beats its own baseline",
// encoded as deterministic checks. Exit non-zero if any promise is broken.
function verifyPromises(a, b) {
  const checks = [
    ['Page A beat its baseline', a.done === true],
    ['Page B beat its baseline', b.done === true],
    ['Page B warm-started from memory', b.warmStarted === true],
    ['same fix transferred across pages', a.winner === b.winner],
    ['warm run tested fewer candidates', b.candidates.length < a.candidates.length],
    ['warm run did fewer benchmark runs', b.benchRuns < a.benchRuns],
  ];
  console.log('\n  Acceptance checks:');
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`    ${pass ? 'PASS' : 'FAIL'}  ${label}`);
    ok = ok && pass;
  }
  console.log(`\n  RESULT: ${ok ? 'PASS ✅' : 'FAIL ❌'}`);
  return ok;
}

async function main() {
  ensureBuild();
  await memory.reset(); // start every demo from an empty memory so "cold" is honest
  const server = await startServer(dist);
  const browser = await launch();
  try {
    const a = await optimize({ browser, url: server.url, pageId: 'a', runs: 3 });
    printReport(a);
    const b = await optimize({ browser, url: server.url, pageId: 'b', runs: 3 });
    printReport(b);
    printContrast(a, b);
    const ok = verifyPromises(a, b);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
