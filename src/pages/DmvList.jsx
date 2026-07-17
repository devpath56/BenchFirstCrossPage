import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';

// Simulated per-row render cost. Real React perf work has a cost per row;
// this makes re-rendering N rows actually take measurable main-thread time.
function work(seed, iters) {
  let x = 0;
  for (let i = 0; i < iters; i++) x += Math.sqrt(((seed + i) % 97) + 1) * 1.0000001;
  return x;
}

// Ugly-on-purpose wait-time badge: green / amber / red, government-website style.
function waitClass(mins) {
  if (mins <= 15) return 'wait-ok';
  if (mins <= 40) return 'wait-warn';
  return 'wait-bad';
}

// The user's assumed location (downtown Sacramento) — used by the haversine
// distance computed live for every row on every render.
const USER_LAT = 38.5816;
const USER_LNG = -121.4944;

// EXPENSIVE PER-ROW COMPUTATION #1 (intentional, NOT memoized): format a wait
// time via wasteful nested string manipulation instead of a simple template.
function formatWaitTime(minutes) {
  const digits = String(Math.max(0, Math.floor(minutes)));
  let acc = '';
  // Nested loops that repeatedly rebuild the same string, char by char.
  for (let i = 0; i < digits.length; i++) {
    let seg = digits;
    for (let k = 0; k < digits.length; k++) {
      seg = seg.split('').map((c) => c).join('');   // rebuild the whole string
      seg = seg.slice(0, seg.length).toUpperCase();  // and slice/upper it again
    }
    acc += seg.charAt(i);
  }
  const total = parseInt(acc || digits, 10);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  return hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;
}

// EXPENSIVE PER-ROW COMPUTATION #2 (intentional, NOT memoized): great-circle
// distance from the user to the office via the haversine formula, every render.
function computeDistance(userLat, userLng, officeLat, officeLng) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(officeLat - userLat);
  const dLng = toRad(officeLng - userLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(userLat)) * Math.cos(toRad(officeLat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// EXPENSIVE PER-ROW COMPUTATION #3 (intentional, NOT memoized): a bogus
// "availability score" that loops 200 times per row on every render.
function calculateAvailabilityScore(row) {
  let score = 0;
  const seed = row.wait != null ? row.wait : row.id;
  for (let i = 0; i < 200; i++) {
    score += Math.sin(seed + i) * Math.cos(row.id + i);
    score = (score + i * 0.5) % 997;
  }
  return Math.abs(Math.round(score));
}

// A single DMV list row. `kind` selects which mock fields to render — it is a
// stable string prop, so React.memo can still short-circuit unchanged rows.
function Row({ item, highlighted, iters, kind }) {
  // Global render counter — a deterministic corroborating metric (counts don't jitter).
  window.__rowRenders = (window.__rowRenders || 0) + 1;
  work(item.id, iters);

  // Three expensive, un-memoized computations run for EVERY visible row on
  // EVERY render — this is what makes the baseline visibly slow.
  const dist = computeDistance(USER_LAT, USER_LNG, item.lat, item.lng);
  const score = calculateAvailabilityScore(item);

  if (kind === 'office') {
    return (
      <div className={'row' + (highlighted ? ' hi' : '')} title={`Availability score: ${score}`}>
        <span className="cell cell-name">{item.name}</span>
        <span className="cell cell-addr">{item.address}</span>
        <span className="cell cell-city">{item.city}</span>
        <span className="cell cell-dist">{dist.toFixed(1)} mi</span>
        <span className={'badge ' + waitClass(item.wait)}>{formatWaitTime(item.wait)} wait</span>
      </div>
    );
  }

  // kind === 'slot'
  return (
    <div className={'row' + (highlighted ? ' hi' : '')} title={`Availability score: ${score}`}>
      <span className="cell cell-date">{item.date}</span>
      <span className="cell cell-time">{item.time}</span>
      <span className="cell cell-office">{item.office}</span>
      <span className="cell cell-service">{item.service}</span>
      <span className="cell cell-dist">{dist.toFixed(1)} mi</span>
    </div>
  );
}

// The one-line "fix": memoize rows so only the rows whose props changed re-render.
const MemoRow = React.memo(Row);

/**
 * A mock California DMV list. The shared pathology is unchanged from the
 * original HeavyList: a large list whose rows re-render on every interaction.
 * `strategy` selects the candidate fix the optimizer is currently benchmarking:
 *   - baseline     : plain rows, all re-render every step (the slow page)
 *   - memo         : React.memo rows with stable props — only changed rows re-render
 *   - memo-badprops: React.memo rows but with a fresh inline callback each render,
 *                    which silently defeats memo (a classic real bug) — a plausible
 *                    "fix" that does NOT actually help. The optimizer must discover this.
 *   - windowed     : render only a 50-row window (virtualization)
 *
 * Props:
 *   pageId, title, iters, steps, strategy — benchmark wiring (unchanged contract)
 *   items    — the mock rows to render (generated by the page)
 *   kind     — 'office' | 'slot', selects the row layout
 *   filters  — config for the government-ugly filter row: two <select>s + one text input
 */
export default function DmvList({ pageId, title, iters, steps, strategy, items, kind, filters }) {
  const rowCount = items.length;
  const [hi, setHi] = useState(0);

  // ANTIPATTERN (intentional, do not "fix"): the transient filter-form state lives
  // up here on the list page, so every keystroke/selection re-renders the whole
  // list instead of an isolated input. Defaults are empty so the benchmark, which
  // never touches the filters, still sees all rows.
  const [selectOne, setSelectOne] = useState('all');
  const [selectTwo, setSelectTwo] = useState('all');
  const [text, setText] = useState('');

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

  // Apply the filter form. With empty defaults this is a no-op (all rows pass),
  // so the benchmark is unaffected; a user narrowing the filters re-renders the
  // whole list (the antipattern above).
  const filtered = items.filter((it) => {
    if (selectOne !== 'all' && String(it[filters.selectOne.key]) !== selectOne) return false;
    if (selectTwo !== 'all' && String(it[filters.selectTwo.key]) !== selectTwo) return false;
    if (text && !String(it[filters.text.key]).toLowerCase().includes(text.toLowerCase())) return false;
    return true;
  });

  const visible = strategy === 'windowed' ? filtered.slice(hi, hi + 50) : filtered;

  // Navigate between pages by rewriting the hash and doing a full reload
  // (main.jsx reads the route from the hash once at startup, so a reload is
  // what actually swaps the page).
  const goToPage = (page) => (e) => {
    e.preventDefault();
    const params = new URLSearchParams(location.hash.slice(1));
    params.set('page', page);
    location.hash = params.toString();
    location.reload();
  };

  return (
    <div className="dmv">
      {/* Top navigation bar */}
      <nav className="dmv-nav">
        <a
          href="#page=a"
          className={'dmv-nav-link' + (pageId === 'a' ? ' active' : '')}
          onClick={goToPage('a')}
        >
          Find office
        </a>
        <a
          href="#page=b"
          className={'dmv-nav-link' + (pageId === 'b' ? ' active' : '')}
          onClick={goToPage('b')}
        >
          Book appointment
        </a>
      </nav>

      {/* State-of-California header bar */}
      <header className="dmv-header">
        <span className="dmv-header-text">
          State of California · Department of Motor Vehicles
        </span>
      </header>

      <div className="dmv-body">
        <h1 className="dmv-title">{title}</h1>

        {/* Government-ugly filter row: two dropdowns + one text box */}
        <div className="dmv-filters">
          <label className="dmv-field">
            <span className="dmv-field-label">{filters.selectOne.label}</span>
            <select value={selectOne} onChange={(e) => setSelectOne(e.target.value)}>
              <option value="all">All</option>
              {filters.selectOne.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          <label className="dmv-field">
            <span className="dmv-field-label">{filters.selectTwo.label}</span>
            <select value={selectTwo} onChange={(e) => setSelectTwo(e.target.value)}>
              <option value="all">All</option>
              {filters.selectTwo.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          <label className="dmv-field dmv-field-text">
            <span className="dmv-field-label">{filters.text.label}</span>
            <input
              type="text"
              placeholder={filters.text.placeholder}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        </div>

        <div className="dmv-meta">
          Showing {visible.length} of {rowCount} results · strategy=<b>{strategy}</b>
        </div>

        <button id="tick" onClick={() => window.__driver.step()}>tick</button>

        <div className="list">
          {visible.map((it) => (
            <RowComp
              key={it.id}
              item={it}
              highlighted={it.id === hi}
              iters={iters}
              kind={kind}
              // A fresh function identity every render defeats React.memo entirely.
              cb={badProps ? () => {} : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
