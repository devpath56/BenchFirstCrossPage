// C1 — the GENERATOR. Claude on Bedrock proposes which candidate fixes to try
// first; the benchmark still DISPOSES (scores them). Bedrock never grades its own
// pick, so Trident's no-self-grading property is preserved.
//
// Local fallback (no Bedrock env) reproduces the exact prior deterministic order,
// so the offline `npm run demo` is byte-for-byte unchanged.

function deterministic({ allFixes, known }) {
  if (!known) return { order: [...allFixes], skippedLosers: [], source: 'fallback' };
  const losers = Object.entries(known.candidates)
    .filter(([, v]) => !v.beat)
    .map(([k]) => k);
  const loserSet = new Set(losers);
  const order = [known.winner, ...allFixes.filter((s) => s !== known.winner && !loserSet.has(s))];
  return { order, skippedLosers: losers, source: 'fallback' };
}

async function bedrockRank({ signature, allFixes, known }) {
  const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const client = new BedrockRuntimeClient({});
  const prompt =
    `Rank these candidate React performance fixes best-first for a page with problem ` +
    `signature "${signature}". Known past measured results: ${JSON.stringify(known?.candidates || {})}. ` +
    `Candidates: ${allFixes.join(', ')}. Reply with ONLY a JSON array of the candidate names.`;
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  });
  const res = await client.send(
    new InvokeModelCommand({ modelId: process.env.BENCHFIRST_BEDROCK_MODEL, contentType: 'application/json', body })
  );
  const text = JSON.parse(new TextDecoder().decode(res.body)).content?.[0]?.text || '[]';
  const arr = JSON.parse((text.match(/\[.*\]/s) || ['[]'])[0]);
  return Array.isArray(arr) ? arr : [];
}

/** Returns { order, skippedLosers, source }. Loser-skipping is enforced deterministically
 *  regardless of what Bedrock proposes, so the LLM can reorder but never resurrect a proven loser. */
export async function pickOrder({ signature, allFixes, known }) {
  const base = deterministic({ allFixes, known });
  if (!process.env.BENCHFIRST_BEDROCK_MODEL) return base;
  try {
    const ranked = await bedrockRank({ signature, allFixes, known });
    const loserSet = new Set(base.skippedLosers);
    const cleaned = ranked.filter((s) => allFixes.includes(s) && !loserSet.has(s));
    const order = [...cleaned, ...base.order.filter((s) => !cleaned.includes(s))];
    return { order, skippedLosers: base.skippedLosers, source: 'bedrock' };
  } catch (e) {
    return { ...base, source: `fallback(bedrock-error: ${e.message})` };
  }
}
