// memory/s3-store.mjs — the durable cross-page scar file on S3.
// Same contract as store.mjs, but async: load() -> mem, save(mem), reset().
//
// No BENCHFIRST_S3_BUCKET env -> delegate to the local JSON store, so the
// offline demo is byte-for-byte unchanged. With a bucket set, S3 errors are
// LOUD (thrown), never silently absorbed into a local write — a scar file
// that quietly forks would poison the warm-start story.
import * as local from './store.mjs';

const BUCKET = () => process.env.BENCHFIRST_S3_BUCKET;
const KEY = () => process.env.BENCHFIRST_S3_KEY || 'benchfirst/memory.json';

let s3Promise;
function s3() {
  s3Promise ??= import('@aws-sdk/client-s3').then((mod) => ({ mod, client: new mod.S3Client({}) }));
  return s3Promise;
}

// Where the memory lives right now — surfaced in reports as evidence.
export function source() {
  return BUCKET() ? `s3://${BUCKET()}/${KEY()}` : `local:${local.FILE_PATH}`;
}

export async function load() {
  if (!BUCKET()) return local.load();
  const { mod, client } = await s3();
  try {
    const res = await client.send(new mod.GetObjectCommand({ Bucket: BUCKET(), Key: KEY() }));
    return JSON.parse(await res.Body.transformToString());
  } catch (e) {
    // Only a MISSING OBJECT means cold start. A bare 404 match would also swallow
    // NoSuchBucket and read a typo'd bucket name as an empty scar file.
    if (e.name === 'NoSuchKey' || e.name === 'NotFound') return {};
    throw e;
  }
}

export async function save(mem) {
  if (!BUCKET()) return local.save(mem);
  const { mod, client } = await s3();
  await client.send(
    new mod.PutObjectCommand({
      Bucket: BUCKET(),
      Key: KEY(),
      Body: JSON.stringify(mem, null, 2) + '\n',
      ContentType: 'application/json',
    })
  );
}

export async function reset() {
  // No bucket -> local reset, unchanged. Wiping a local file is cheap and private.
  if (!BUCKET()) return save({});
  // Bucket set -> the scar file is SHARED (deployed writer + teammates). An
  // accidental `npm run demo` must NOT silently destroy it. Require an explicit
  // opt-in and THROW loudly otherwise — no warn-and-continue, no skip-and-fallback:
  // a skipped reset would let load() return the existing verdict, Page A would
  // start WARM instead of COLD, and the demo would print a plausible but wrong run.
  if (process.env.BENCHFIRST_ALLOW_RESET !== '1') {
    throw new Error(
      `Refusing to reset shared S3 scar state at s3://${BUCKET()}/${KEY()} — ` +
      `this would wipe verdicts written by the deployed Akash writer and teammates. ` +
      `Set BENCHFIRST_ALLOW_RESET=1 to explicitly wipe shared S3 state.`
    );
  }
  return save({});
}
