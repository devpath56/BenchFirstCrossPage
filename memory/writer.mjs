// memory/writer.mjs — i3: the ONLY sanctioned write path to the scar file.
//
// A verdict is an EARNED, measured result. Every write is validated against
// schema/verdict.json (ajv) plus semantic checks the schema can't express
// (non-empty measurements; the claimed winner must have measurably beaten
// baseline). An agent "opinion" is rejected loudly, before it can touch S3.
//
// Two forms, same gate:
//   in-process : submitVerdict()/writeVerdict() — the offline demo path
//   HTTP       : `node memory/writer.mjs` → POST /verdict — the service that
//                i4's Pomerium route fronts, so only the verdict-runner
//                identity can reach it in the live deployment.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import * as memory from './s3-store.mjs';

const SCHEMA_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../schema/verdict.json');
const validateShape = new Ajv({ allErrors: true }).compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));

// Schema + semantic gate. Returns [] when valid, else human-readable reasons.
export function verdictErrors(verdict) {
  if (!validateShape(verdict)) {
    return validateShape.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
  }
  const errors = [];
  // Keys the store would mis-handle: '' and JS prototype keys silently no-op
  // (or pollute) on `mem[sig] = record`, making a 200 response a lie.
  if (!verdict.signature || ['__proto__', 'constructor', 'prototype'].includes(verdict.signature)) {
    errors.push(`signature "${verdict.signature}" is not a usable memory key`);
  }
  const { winner, candidates } = verdict.record;
  if (Object.keys(candidates).length === 0) errors.push('candidates is empty — a verdict must carry measurements');
  const w = candidates[winner];
  if (!w) errors.push(`winner "${winner}" has no measured candidate entry (opinion, not verdict)`);
  else if (w.beat !== true) errors.push(`winner "${winner}" did not measurably beat baseline (beat=${w.beat})`);
  return errors;
}

// Validate -> merge into memory -> PUT. Throws (with .errors) on rejection.
export async function writeVerdict(verdict) {
  const errors = verdictErrors(verdict);
  if (errors.length) {
    const err = new Error(`verdict rejected: ${errors.join('; ')}`);
    err.errors = errors;
    throw err;
  }
  const mem = await memory.load();
  mem[verdict.signature] = verdict.record;
  await memory.save(mem);
  return { ok: true, signature: verdict.signature, store: memory.source() };
}

// Loop-side submit: POST to a running writer when BENCHFIRST_WRITER_URL is set
// (the Pomerium-fronted path), else the same gate in-process (offline demo).
export async function submitVerdict(verdict) {
  const url = process.env.BENCHFIRST_WRITER_URL;
  if (!url) return writeVerdict(verdict);
  const res = await fetch(`${url.replace(/\/$/, '')}/verdict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(verdict),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`writer rejected verdict (${res.status}): ${body.error}`);
  return body;
}

export function startWriter({ port = Number(process.env.BENCHFIRST_WRITER_PORT) || 8787 } = {}) {
  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj) + '\n');
    };
    if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true, store: memory.source() });
    if (req.method !== 'POST' || req.url !== '/verdict') return send(405, { error: 'POST /verdict only' });
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) req.destroy(); // verdicts are tiny; anything huge is not a verdict
    });
    req.on('end', async () => {
      try {
        send(200, await writeVerdict(JSON.parse(body)));
      } catch (e) {
        if (e.errors) return send(400, { error: e.message, errors: e.errors });
        if (e instanceof SyntaxError) return send(400, { error: `invalid JSON: ${e.message}` });
        send(500, { error: e.message }); // e.g. S3 failure — loud, not absorbed
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({ port: server.address().port, close: () => new Promise((r) => server.close(r)) })
    )
  );
}

// CLI: `npm run writer` — run the writer service (Pomerium upstream for i4).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startWriter({});
  console.log(`verdict writer listening on 127.0.0.1:${port} → ${memory.source()}`);
}
