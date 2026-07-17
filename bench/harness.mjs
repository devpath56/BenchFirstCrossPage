// BenchFirst benchmark harness — the deterministic "scale" the agent trusts.
// Generalizes the Phase-0 RAT probe: launch real Chromium, throttle CPU 4x,
// replay a scripted interaction, and measure the render work it costs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Serve a built dist/ directory over localhost (SPA fallback to index.html).
export function startServer(distDir) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      reject(new Error(`No build found at ${distDir}. Run \`npm run build\` first.`));
      return;
    }
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      let file = path.join(distDir, urlPath === '/' ? '/index.html' : urlPath);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
      fs.readFile(file, (err, buf) => {
        if (err) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

export async function launch() {
  return chromium.launch({ headless: true });
}

async function withPage(browser, url, pageId, variant, fn) {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    const client = await ctx.newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // simulate a low-spec machine
    await page.goto(`${url}/#page=${pageId}&variant=${variant}`);
    await page.waitForFunction('window.__ready===true', { timeout: 30000 });
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

// Read a page's inherent problem profile (variant-independent).
export async function readProfile(browser, url, pageId) {
  return withPage(browser, url, pageId, 'baseline', (page) => page.evaluate(() => window.__profile));
}

function stats(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const stdev = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, stdev, cov: stdev / mean };
}

// Measure one (page, variant): 1 discarded warm-up + `runs` measured runs,
// fresh browser context each time. Returns mean render-ms, CoV, row-render count.
export async function measure(browser, url, pageId, variant, runs = 3) {
  const vals = [];
  for (let i = 0; i < runs + 1; i++) {
    const m = await withPage(browser, url, pageId, variant, (page) =>
      page.evaluate(() => window.__runInteraction())
    );
    if (i > 0) vals.push(m.ms); // i===0 is a discarded warm-up
  }
  const s = stats(vals);
  return {
    mean: s.mean,
    cov: +s.cov.toFixed(4),
    n: vals.length,
    runs: vals.map((v) => +v.toFixed(1)),
  };
}

// CLI: `node bench/harness.mjs --page a --variant memo`
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = Object.fromEntries(
    process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/))
  );
  const dist = path.resolve('dist');
  const server = await startServer(dist);
  const browser = await launch();
  const page = args.page || 'a';
  const variant = args.variant || 'baseline';
  const r = await measure(browser, server.url, page, variant, Number(args.runs) || 3);
  console.log(JSON.stringify({ page, variant, ...r }, null, 2));
  await browser.close();
  await server.close();
}
