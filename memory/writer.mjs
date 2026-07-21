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
  const headers = { 'content-type': 'application/json' };
  // Identity the writer's gate checks against. In the full topology Pomerium
  // injects this header after an OIDC login and overwrites any client copy, so
  // it is proof. With Pomerium absent on this lease the caller self-asserts it,
  // so here the header is convenience, not proof. Send it only when we have a
  // caller identity; unset → send nothing and let the writer 403. Never fall
  // back to BENCHFIRST_VERDICT_IDENTITY: that is the server's expected value,
  // and reading it here would let the client trivially match the gate.
  const caller = process.env.BENCHFIRST_CALLER_IDENTITY;
  if (caller) headers[IDENTITY_HEADER] = caller;
  const res = await fetch(`${url.replace(/\/$/, '')}/verdict`, {
    method: 'POST',
    headers,
    body: JSON.stringify(verdict),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`writer rejected verdict (${res.status}): ${body.error}`);
  return body;
}

// Defense-in-depth (belt to Pomerium's suspenders). When BENCHFIRST_VERDICT_IDENTITY
// is set, the writer requires Pomerium's verified identity header to match it — so
// even a request that reaches the upstream must carry the verdict-runner identity
// that Pomerium asserts (and overwrites). Unset (local/offline) = no assertion.
// Pomerium strips client-supplied copies of X-Pomerium-* before proxying, so this
// header is trustworthy only for traffic that actually transits Pomerium; pair it
// with network isolation (writer not publicly reachable) — see pomerium/README.md.
// Gate ON iff the env var is DEFINED. Unset = off (local/offline). A defined but
// EMPTY value is a misconfig, not "off" — we fail CLOSED (an empty required
// identity matches no caller, so every request is rejected), never silently open.
const gateOn = () => process.env.BENCHFIRST_VERDICT_IDENTITY !== undefined;
const REQUIRED_IDENTITY = () => process.env.BENCHFIRST_VERDICT_IDENTITY;
const IDENTITY_HEADER = (process.env.BENCHFIRST_IDENTITY_HEADER || 'x-pomerium-claim-email').toLowerCase();

function identityError(req) {
  if (!gateOn()) return null; // enforcement off (env var unset)
  const want = REQUIRED_IDENTITY();
  const got = req.headers[IDENTITY_HEADER];
  if (!want) return 'verdict-runner identity is misconfigured (empty) — refusing all writes';
  if (got !== want) return `caller identity "${got ?? '(none)'}" is not the verdict-runner`;
  return null;
}

export function startWriter({
  port = Number(process.env.BENCHFIRST_WRITER_PORT) || 8787,
  host = process.env.BENCHFIRST_WRITER_HOST || '127.0.0.1', // containers set 0.0.0.0 for Pomerium
} = {}) {
  const server = http.createServer((req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(obj) + '\n');
    };
    // Public, unauthenticated liveness only — must NOT leak the store location
    // (bucket/key would be recon before i7's scoped creds land).
    if (req.method === 'GET' && req.url === '/healthz') return send(200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/verdict') return send(405, { error: 'POST /verdict only' });
    const idErr = identityError(req);
    if (idErr) return send(403, { error: idErr }); // Pomerium should have blocked it; this is the backstop
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
    server.listen(port, host, () =>
      resolve({ host, port: server.address().port, close: () => new Promise((r) => server.close(r)) })
    )
  );
}

// CLI: `npm run writer` — run the writer service (Pomerium upstream for i4).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { host, port } = await startWriter({});
  const gate = gateOn() ? `identity-gated (${REQUIRED_IDENTITY() || 'MISCONFIGURED-empty → all writes refused'})` : 'ungated (local)';
  console.log(`verdict writer listening on ${host}:${port} → ${memory.source()} · ${gate}`);
}
