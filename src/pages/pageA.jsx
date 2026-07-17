// pageA.jsx — Vehicle Registration. DATA + renderStage only; behavior lives in dmvlist.jsx.
// The signature pain: fees stream in one-at-a-time while "Amount Due" climbs.
import React from 'react';
import DmvService, { money } from './dmvlist.jsx';

const FEES = [
  { id: 'fee0', lbl: 'Registration Fee', amt: 46 },
  { id: 'fee1', lbl: 'California Highway Patrol (CHP) Fee', amt: 28 },
  { id: 'fee2', lbl: 'Vehicle License Fee', amt: 112 },
  { id: 'fee3', lbl: 'County / District Fees', amt: 18 },
  { id: 'fee4', lbl: 'Smog Abatement Fee', amt: 20 },
];
const TOTAL = FEES.reduce((a, f) => a + f.amt, 0);

// Each entry = one component that resolves at its own time (a data fetch / lazy chunk).
const config = {
  pageId: 'a',
  steps: 'STEP 1 OF 4 — FIND YOUR VEHICLE',
  title: 'Renew Vehicle Registration',
  submitLabel: 'RENEW REGISTRATION',
  fields: [
    { id: 'plate', label: 'License plate number', default: '7ABC123' },
    { id: 'vin', label: 'Last 5 digits of VIN', default: '12345' },
  ],
  components: [
    { id: 'vehicle', dur: 900 },
    { id: 'fee0', dur: 800, fee: 46 },
    { id: 'fee1', dur: 900, fee: 28 },
    { id: 'fee2', dur: 900, fee: 112 },
    { id: 'fee3', dur: 800, fee: 18 },
    { id: 'fee4', dur: 700, fee: 20 },
    { id: 'pay', dur: 500 },
  ],
  bannerMs: 2500,
  emptyMs: 2000,
  errorMs: 5000,
  classify: ({ plate }) => {
    const p = (plate || '').trim().toLowerCase();
    if (p === 'none' || p === '00000' || p === '') return 'empty';
    if (p === 'fail' || p === 'error') return 'error';
    return 'success';
  },
  empty: {
    title: () => 'No vehicle found',
    sub: 'We couldn’t match that plate and VIN. Check your entries and try again.',
  },
  error: { msg: 'We couldn’t reach the registration system. Please try again.' },
  renderStage: ({ resolved, running, inputs }) => (
    <>
      {resolved.has('vehicle') ? (
        <div className="vsummary in">
          <div className="vthumb real sharp" style={{ background: 'linear-gradient(135deg,#9fb6cf,#5c7ea6)' }} />
          <div className="vmeta">
            <div className="vname">2019 Honda Civic LX</div>
            <div className="vsub">Plate {inputs.plate} · VIN …{inputs.vin} · Expires 09/30/2026</div>
          </div>
          <div className="vstatus">Renewal due</div>
        </div>
      ) : (
        <div className="vsummary skl" />
      )}

      <div className="feebox">
        <div className="feehdr">Registration fees</div>
        {FEES.map((f) =>
          resolved.has(f.id) ? (
            <div className="feerow in" key={f.id}>
              <span>{f.lbl}</span><span className="amt">{money(f.amt)}</span>
            </div>
          ) : (
            <div className="feerow" key={f.id}>
              <span className="skl skl-lbl" /><span className="skl skl-amt" />
            </div>
          )
        )}
        <div className="feerow total">
          <span>Amount Due</span>
          <span className="amt bump" key={running}>{running ? money(running) : '$—'}</span>
        </div>
      </div>

      {resolved.has('pay') ? (
        <button className="btn pay in">PAY {money(TOTAL)} ▸</button>
      ) : (
        <button className="btn pay skl" />
      )}
    </>
  ),
};

export default function PageA({ variant }) {
  return <DmvService config={config} variant={variant} />;
}
