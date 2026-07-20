// pageB.jsx — Appointments (office lookup). Same waterfall pathology as Page A
// (so its BenchFirst signature matches and the fix transfers), different content.
// The map is the long pole — it loads last.
import React from 'react';
import DmvService from './dmvlist.jsx';

const OFFICES = [
  { nm: 'Oakland — Claremont', addr: '5300 Claremont Ave · 2.1 mi', hue: 210 },
  { nm: 'El Cerrito', addr: '6400 Manila Ave · 4.6 mi', hue: 150 },
  { nm: 'San Francisco', addr: '1377 Fell St · 9.8 mi', hue: 275 },
];

const config = {
  pageId: 'b',
  steps: 'STEP 2 OF 5 — SELECT A DMV OFFICE',
  title: 'Office Visit Appointment',
  submitLabel: 'FIND OFFICE',
  fields: [{ id: 'q', label: 'Enter your city or ZIP code', default: 'Berkeley' }],
  components: [
    { id: 'header', dur: 800 },
    { id: 'card0', dur: 900 },
    { id: 'card1', dur: 1000 },
    { id: 'card2', dur: 1000 },
    { id: 'map', dur: 1900 }, // long pole
  ],
  bannerMs: 2500,
  emptyMs: 2000,
  errorMs: 5200,
  classify: ({ q }) => {
    const v = (q || '').trim().toLowerCase();
    if (v === 'nowhere' || v === '00000') return 'empty';
    if (v === 'fail' || v === 'error' || v === '99999') return 'error';
    return 'success';
  },
  empty: {
    title: ({ q }) => `No offices found near “${q}”`,
    sub: 'Try a different city or ZIP code.',
  },
  error: { msg: 'We couldn’t reach the appointment service. Please try again.' },
  // Flow-correctness invariants — "nothing else broke" after a fix (the fired-metric guard).
  invariants: ({ resolved }) => {
    const cards = ['card0', 'card1', 'card2'].every((id) => resolved.has(id));
    const map = resolved.has('map');
    const header = resolved.has('header');
    return {
      ok: header && cards && map,
      checks: [
        { name: '3 office cards rendered', pass: cards, detail: cards ? 'all present' : 'missing card(s)' },
        { name: 'map (long pole) rendered', pass: map, detail: map ? 'loaded' : 'missing' },
      ],
    };
  },
  renderStage: ({ resolved, inputs }) => (
    <>
      {resolved.has('header') ? (
        <div className="rhead found in">✓ 3 offices found near “{inputs.q}” — sorted by distance</div>
      ) : (
        <div className="rhead skl" />
      )}
      <div className="rlist">
        {OFFICES.map((o, i) =>
          resolved.has('card' + i) ? (
            <div className="card in" key={i}>
              <div className="thumb real sharp"
                style={{ background: `linear-gradient(135deg,hsl(${o.hue},35%,62%),hsl(${o.hue + 30},40%,42%))` }} />
              <div className="meta"><div className="nm">{o.nm}</div><div className="addr">{o.addr}</div></div>
              <button className="book">Make Appointment</button>
            </div>
          ) : (
            <div className="card" key={i}>
              <div className="thumb skl" />
              <div className="meta">
                <div className="skl" style={{ height: 12, width: '52%' }} />
                <div className="skl" style={{ height: 10, width: '34%', marginTop: 8 }} />
              </div>
              <div className="skl" style={{ width: 104, height: 30 }} />
            </div>
          )
        )}
      </div>
      {resolved.has('map') ? (
        <div className="mapslot">
          <div className="map in">
            <div className="streets" /><div className="road" />
            <div className="pin" style={{ left: '22%', top: '34%' }}>📍</div>
            <div className="pin" style={{ left: '53%', top: '58%' }}>📍</div>
            <div className="pin" style={{ left: '78%', top: '40%' }}>📍</div>
          </div>
        </div>
      ) : (
        <div className="mapslot skl" />
      )}
    </>
  ),
};

export default function PageB({ variant }) {
  return <DmvService config={config} variant={variant} />;
}
