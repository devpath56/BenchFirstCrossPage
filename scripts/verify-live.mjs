// scripts/verify-live.mjs — i7 go-live preflight.
//
// One command that checks each sponsor leg the moment creds land, turning the
// FLAGS F6/F9/F17/F18 "verify on creds day" checklists into runnable evidence.
// Every leg is SKIPPED (not failed) when its env var is absent, so this is safe
// to run at any stage — it reports exactly how far the live wiring reaches.
//
//   set -a; . ./.env; set +a
//   node scripts/verify-live.mjs
//
// Exit 0 only if every ATTEMPTED leg passed. Nothing here writes to the real
// scar file except an explicitly-labelled S3 round-trip on a throwaway key.
import * as memory from '../memory/s3-store.mjs';

const results = [];
const rec = (name, status, detail) => results.push({ name, status, detail });
const ok = (n, d) => rec(n, 'PASS', d);
const skip = (n, d) => rec(n, 'SKIP', d);
const fail = (n, d) => rec(n, 'FAIL', d);

// ── 1. S3 scar-file round-trip (F9) ──────────────────────────────────────────
async function checkS3() {
  const bucket = process.env.BENCHFIRST_S3_BUCKET;
  if (!bucket) return skip('S3 round-trip', 'BENCHFIRST_S3_BUCKET unset — local JSON fallback');
  try {
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({});
    const key = `${process.env.BENCHFIRST_S3_KEY || 'benchfirst/memory.json'}.preflight`;
    const token = `preflight-${process.pid}`;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: token, ContentType: 'text/plain' }));
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const got = await res.Body.transformToString();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); // clean up the throwaway key
    if (got !== token) return fail('S3 round-trip', `read back "${got}" != "${token}"`);
    ok('S3 round-trip', `PUT/GET/DELETE on s3://${bucket} (transformToString works on this SDK)`);
  } catch (e) {
    fail('S3 round-trip', `${e.name}: ${e.message}`);
  }
}

// ── 2. Nonexistent-bucket loud-throw (F9: NoSuchBucket must NOT read as cold) ─
async function checkS3LoudThrow() {
  if (!process.env.BENCHFIRST_S3_BUCKET) return skip('S3 loud-throw', 'no bucket configured');
  const saved = process.env.BENCHFIRST_S3_BUCKET;
  process.env.BENCHFIRST_S3_BUCKET = `${saved}-does-not-exist-${process.pid}`;
  try {
    await memory.load();
    fail('S3 loud-throw', 'load() on a nonexistent bucket returned instead of throwing');
  } catch {
    ok('S3 loud-throw', 'a bad bucket throws (not silently read as empty)');
  } finally {
    process.env.BENCHFIRST_S3_BUCKET = saved;
  }
}

// ── 3. Bedrock picker reachability (F6) ──────────────────────────────────────
async function checkBedrock() {
  const model = process.env.BENCHFIRST_BEDROCK_MODEL;
  if (!model) return skip('Bedrock pick', 'BENCHFIRST_BEDROCK_MODEL unset — deterministic fallback');
  try {
    const { pickOrder } = await import('../optimizer/picker.mjs');
    const r = await pickOrder({ signature: 'waterfall-load', allFixes: ['parallel', 'spinner'], known: null });
    if (r.source !== 'bedrock') return fail('Bedrock pick', `fell back (${r.source}) — model unreachable or errored`);
    if (!Array.isArray(r.order) || r.order.length === 0) return fail('Bedrock pick', 'empty order');
    // NOTE: source=bedrock means the call SUCCEEDED, but a prose-wrapped/garbage
    // reply parses to [] and silently yields the fallback order (F6). Eyeball the
    // order below against the model's intent; don't assume it truly ranked.
    ok('Bedrock pick', `model reachable (source=bedrock); order [${r.order.join(', ')}] — sanity-check vs F6 greedy-parse`);
  } catch (e) {
    fail('Bedrock pick', `${e.name}: ${e.message}`);
  }
}

// ── 4. Deployed writer: health + identity gate (F17) ─────────────────────────
async function checkWriter() {
  const url = process.env.BENCHFIRST_WRITER_URL;
  if (!url) return skip('Writer gate', 'BENCHFIRST_WRITER_URL unset — in-process writer');
  const base = url.replace(/\/$/, '');
  const verdict = { signature: 'waterfall-load', record: { winner: 'parallel', candidates: { parallel: { deltaPct: 63, beat: true } } } };
  try {
    // redirect:'manual' — Pomerium 302-redirects unauthenticated callers to the
    // IdP; following that would fetch a 200 login page and misread the gate.
    const h = await fetch(`${base}/healthz`, { redirect: 'manual' });
    if (h.status !== 200) return fail('Writer gate', `healthz returned ${h.status} (expected 200 — wrong host/path?)`);
    const anon = await fetch(`${base}/verdict`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(verdict),
    });
    // Blocked = the write was refused: 401/403 (Pomerium or the writer backstop)
    // or a 3xx auth-redirect. 200 = the gate is OPEN. Anything else is suspicious.
    if (anon.status === 200) return fail('Writer gate', 'anonymous POST /verdict was ACCEPTED — the identity gate is OPEN!');
    const blocked = anon.status === 401 || anon.status === 403 || (anon.status >= 300 && anon.status < 400);
    if (!blocked) return fail('Writer gate', `anonymous POST got ${anon.status} (not a clear block — check BENCHFIRST_WRITER_URL/path)`);
    ok('Writer gate', `healthz 200; anonymous write blocked (${anon.status}) — identity gate enforcing`);
  } catch (e) {
    fail('Writer gate', `${e.name}: ${e.message}`);
  }
}

console.log(`\n  BenchFirst go-live preflight · memory source: ${memory.source()}\n`);
await checkS3();
await checkS3LoudThrow();
await checkBedrock();
await checkWriter();

let attempted = 0, passed = 0;
for (const r of results) {
  const mark = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '·';
  console.log(`  ${mark} ${r.status.padEnd(4)} ${r.name.padEnd(16)} ${r.detail}`);
  if (r.status !== 'SKIP') { attempted++; if (r.status === 'PASS') passed++; }
}
const allPass = attempted > 0 && passed === attempted;
console.log(`\n  ${attempted === 0 ? 'Nothing live configured yet (all legs offline).' : `${passed}/${attempted} live legs passed.`}\n`);
process.exitCode = attempted > 0 && !allPass ? 1 : 0;
