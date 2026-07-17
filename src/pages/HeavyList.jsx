import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';

// Simulated per-row render cost. Real React perf work has a cost per row;
// this makes re-rendering N rows actually take measurable main-thread time.
function work(seed, iters) {
  let x = 0;
  for (let i = 0; i < iters; i++) x += Math.sqrt(((seed + i) % 97) + 1) * 1.0000001;
  return x;
}

function Row({ item, highlighted, iters }) {
  // Global render counter — a deterministic corroborating metric (counts don't jitter).
  window.__rowRenders = (window.__rowRenders || 0) + 1;
  work(item.id, iters);
  return <div className={'row' + (highlighted ? ' hi' : '')}>{item.label}</div>;
}

// The one-line "fix": memoize rows so only the rows whose props changed re-render.
const MemoRow = React.memo(Row);

/**
 * The shared pathology: a large list whose rows re-render on every interaction.
 * `strategy` selects the candidate fix the optimizer is currently benchmarking:
 *   - baseline     : plain rows, all re-render every step (the slow page)
 *   - memo         : React.memo rows with stable props — only changed rows re-render
 *   - memo-badprops: React.memo rows but with a fresh inline callback each render,
 *                    which silently defeats memo (a classic real bug) — a plausible
 *                    "fix" that does NOT actually help. The optimizer must discover this.
 *   - windowed     : render only a 50-row window (virtualization)
 */
export default function HeavyList({ pageId, title, rowCount, iters, steps, strategy }) {
  const [items] = useState(() =>
    Array.from({ length: rowCount }, (_, i) => ({ id: i, label: `${title} item #${i}` }))
  );
  const [hi, setHi] = useState(0);

  useEffect(() => {
    // Inherent problem profile (variant-independent) — used to compute the memory signature.
    window.__profile = { page: pageId, rowCount, interaction: 'per-row-update' };
    window.__rowRenders = 0;
    window.__benchSum = 0;

    // step() advances the highlight one row down. flushSync forces a synchronous
    // render+commit so we can time the actual render work (not idle frame waits).
    window.__driver = {
      step: () => {
        const t0 = performance.now();
        flushSync(() => setHi((h) => h + 1));
        window.__benchSum += performance.now() - t0;
      },
    };

    // The scripted, replayable interaction the harness measures.
    window.__runInteraction = async () => {
      window.__benchSum = 0;
      window.__rowRenders = 0;
      for (let i = 0; i < steps; i++) {
        window.__driver.step();
        await new Promise((r) => setTimeout(r, 0)); // let the browser breathe between steps
      }
      return { ms: window.__benchSum, rowRenders: window.__rowRenders };
    };

    window.__ready = true;
    return () => {
      window.__ready = false;
    };
  }, [pageId, rowCount, steps, strategy]);

  const usesMemo = strategy === 'memo' || strategy === 'memo-badprops';
  const RowComp = usesMemo ? MemoRow : Row;
  const badProps = strategy === 'memo-badprops';
  const visible = strategy === 'windowed' ? items.slice(hi, hi + 50) : items;

  return (
    <div>
      <h2>{title} · {rowCount} rows · strategy=<b>{strategy}</b></h2>
      <button id="tick" onClick={() => window.__driver.step()}>tick</button>
      <div className="list">
        {visible.map((it) => (
          <RowComp
            key={it.id}
            item={it}
            highlighted={it.id === hi}
            iters={iters}
            // A fresh function identity every render defeats React.memo entirely.
            cb={badProps ? () => {} : undefined}
          />
        ))}
      </div>
    </div>
  );
}
