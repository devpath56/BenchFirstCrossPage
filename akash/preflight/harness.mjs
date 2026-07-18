import { chromium } from 'playwright';

const RUNS = 10;
const URL = 'http://localhost:8080/target.html';

async function measure() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(URL);
  await page.waitForSelector('#btn');

  const t0 = performance.now();
  await page.click('#btn');
  await page.waitForSelector('#done', { state: 'attached' });
  const t1 = performance.now();

  await browser.close();
  return t1 - t0;
}

const results = [];
await measure(); // discard warm-up
for (let i = 0; i < RUNS; i++) {
  const ms = await measure();
  results.push(ms);
  console.log(`run ${i + 1}: ${ms.toFixed(1)} ms`);
}

const mean = results.reduce((a, b) => a + b, 0) / results.length;
const variance = results.reduce((a, b) => a + (b - mean) ** 2, 0) / results.length;
const stddev = Math.sqrt(variance);
const cov = stddev / mean;

console.log('\n=== PREFLIGHT RESULT ===');
console.log(`mean:   ${mean.toFixed(1)} ms`);
console.log(`stddev: ${stddev.toFixed(1)} ms`);
console.log(`CoV:    ${cov.toFixed(4)}`);
console.log(cov <= 0.08 ? '✅ PASS — Akash is trustworthy' : '❌ FAIL — too noisy for verdict gate');
