// dmvlist.jsx — the shared DMV "painful-loading" engine.
//
// One config-driven component renders the legacy CA DMV shell + the per-page
// state machine (idle -> loading -> success | empty | error). Each PAGE supplies
// only DATA + a renderStage() — so iterating a new version = editing a config,
// never the engine. Agent/benchmark hooks are stable (window.__dmv / __benchfirst).
//
// The modelled "pain" is a REQUEST WATERFALL: components resolve one-after-another
// (the classic React data-fetching anti-pattern). BenchFirst's candidate fixes:
//   baseline : waterfall  (settle = sum of component durations)   ← the slow page
//   parallel : fetch concurrently (settle = max duration)          ← the real fix
//   spinner  : cosmetic only (settle unchanged)                    ← plausible non-fix
import React, { useCallback, useEffect, useRef, useState } from 'react';

export const money = (n) => '$' + Number(n).toFixed(2);
const SPEED_BENCH = 40; // benchmark replays the real staggered load, time-compressed

// The candidate fixes the optimizer can try for a waterfall-load page.
export const VARIANTS = ['baseline', 'parallel', 'spinner'];

// Given components [{id,dur}] and a variant, return each slot's resolve time + settle.
export function schedule(components, variant) {
  const at = {};
  if (variant === 'parallel') {
    let settle = 0;
    for (const c of components) {
      at[c.id] = c.dur;
      settle = Math.max(settle, c.dur);
    }
    return { at, settle };
  }
  // baseline waterfall and 'spinner' (cosmetic → same timing): cumulative
  let acc = 0;
  for (const c of components) {
    acc += c.dur;
    at[c.id] = acc;
  }
  return { at, settle: acc };
}

export function DmvService({ config, variant = 'baseline' }) {
  const [inputs, setInputs] = useState(() => Object.fromEntries(config.fields.map((f) => [f.id, f.default])));
  const [phase, setPhase] = useState('idle'); // idle | loading | success | empty | error
  const [resolved, setResolved] = useState(() => new Set());
  const [running, setRunning] = useState(0); // registration "Amount Due" climbs
  const [freeze, setFreeze] = useState(false);
  const [bar, setBar] = useState({ on: false, stall: false });

  const timers = useRef([]);
  const speed = useRef(1);
  const settleResolver = useRef(null);
  const runRef = useRef(() => {});
  const phaseRef = useRef('idle');
  phaseRef.current = phase; // latest phase for the stable getState() closure

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const push = (t) => timers.current.push(t);
  const at = (v) => v / speed.current;

  const run = useCallback(() => {
    clearTimers();
    const outcome = config.classify(inputs);
    setPhase('loading'); setResolved(new Set()); setRunning(0); setFreeze(false);
    setBar({ on: true, stall: false });
    push(setTimeout(() => setFreeze(true), at(config.bannerMs ?? 2500)));

    const done = new Promise((res) => { settleResolver.current = res; });

    if (outcome === 'success') {
      const sch = schedule(config.components, variant);
      config.components.forEach((c) => {
        push(setTimeout(() => {
          setResolved((prev) => new Set(prev).add(c.id));
          if (c.fee) setRunning((r) => r + c.fee);
        }, at(sch.at[c.id])));
      });
      push(setTimeout(() => {
        setBar({ on: false, stall: false }); setFreeze(false); setPhase('success');
        settleResolver.current?.('success');
      }, at(sch.settle + 200)));
    } else if (outcome === 'empty') {
      push(setTimeout(() => {
        setBar({ on: false, stall: false }); setFreeze(false); setPhase('empty');
        settleResolver.current?.('empty');
      }, at(config.emptyMs ?? 2000)));
    } else {
      push(setTimeout(() => setBar({ on: true, stall: true }), at((config.errorMs ?? 5000) - 500)));
      push(setTimeout(() => {
        setBar({ on: false, stall: false }); setFreeze(false); setPhase('error');
        settleResolver.current?.('error');
      }, at(config.errorMs ?? 5000)));
    }
    return done;
  }, [config, inputs, variant]);
  runRef.current = run;

  // Stable agent + benchmark interface (CLI/MCP friendly).
  useEffect(() => {
    const profile = { page: config.pageId, interaction: 'waterfall-load', components: config.components.length };
    window.__profile = profile;
    window.__dmv = {
      variants: VARIANTS,
      setInput: (id, val) => setInputs((s) => ({ ...s, [id]: val })),
      getState: () => phaseRef.current,
      submit: () => runRef.current(),
      submitAndSettle: () => runRef.current(), // returns a promise resolving on terminal state
    };
    const runInteraction = async () => {
      speed.current = SPEED_BENCH;
      const t0 = performance.now();
      await runRef.current();
      const elapsed = performance.now() - t0;
      speed.current = 1;
      return { ms: elapsed, settleModelMs: schedule(config.components, variant).settle };
    };
    window.__benchfirst = { profile, runInteraction };
    window.__runInteraction = runInteraction; // back-compat with bench/harness.mjs
    window.__ready = true;
    return () => { window.__ready = false; clearTimers(); };
    // Mount-scoped: must NOT depend on `phase`, or its cleanup would cancel the
    // in-flight load timers every time the state machine advances.
  }, [config, variant]);

  const set = (id) => (e) => setInputs((s) => ({ ...s, [id]: e.target.value }));
  const onKey = (e) => { if (e.key === 'Enter') run(); };
  const locked = phase === 'loading';
  const ctx = { phase, resolved, running, inputs, variant };

  const nav = (target) => `#page=${target}&variant=${variant}`;

  return (
    <div className="dmv">
      <style>{DMV_CSS}</style>
      <div className={'topbar' + (bar.on ? ' show' : '') + (bar.stall ? ' stall' : '')}><i /></div>
      <div className="util">Home&nbsp;·&nbsp;Online Services&nbsp;·&nbsp;Español&nbsp;·&nbsp;Sign In</div>
      <div className="masthead">
        <div className="seal" />
        <div className="wordmark"><b>State of California</b><span>Department of Motor Vehicles</span></div>
      </div>
      <div className="goldbar" />
      <div className="nav">
        <a className={'navtab' + (config.pageId === 'a' ? ' active' : '')} href={nav('a')}>Vehicle Registration</a>
        <a className={'navtab' + (config.pageId === 'b' ? ' active' : '')} href={nav('b')}>Appointments</a>
      </div>
      <div className={'freeze' + (freeze ? ' show' : '')}>
        ⏳ <span><b>Please do not refresh or press Back</b> — you may lose your place in line and have to start over.</span>
      </div>

      <div className="body">
        <div className="steps">{config.steps}</div>
        <h1>{config.title}</h1>

        {config.fields.length > 1 ? (
          <div className="row2">
            {config.fields.map((f) => (
              <div className="field" key={f.id}>
                <label htmlFor={f.id}>{f.label}</label>
                <input id={f.id} className="tf" value={inputs[f.id]} disabled={locked}
                  spellCheck={false} onChange={set(f.id)} onKeyDown={onKey} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <label htmlFor={config.fields[0].id}>{config.fields[0].label}</label>
            <div className="searchrow">
              <input id={config.fields[0].id} className="tf" value={inputs[config.fields[0].id]} disabled={locked}
                spellCheck={false} onChange={set(config.fields[0].id)} onKeyDown={onKey} />
              <button className="btn" disabled={locked} onClick={run}>{config.submitLabel}</button>
            </div>
          </>
        )}
        {config.fields.length > 1 && (
          <button className="btn" style={{ width: '100%' }} disabled={locked} onClick={run}>{config.submitLabel}</button>
        )}

        <div className="results" data-state={phase}>
          {phase === 'idle' && null}
          {(phase === 'loading' || phase === 'success') && config.renderStage(ctx)}
          {phase === 'empty' && (
            <div className="emptybox in">
              <div className="ic">🔍</div>
              <h4>{config.empty.title(inputs)}</h4>
              <div className="sub">{config.empty.sub}</div>
            </div>
          )}
          {phase === 'error' && (
            <div className="errbox in">
              <div className="x">⚠</div>
              <h4>Something went wrong</h4>
              <p>{config.error.msg}</p>
              <button className="btn tryagain" onClick={run}>Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const DMV_CSS = `
.dmv{max-width:860px;margin:0 auto;background:#fff;min-height:100vh;box-shadow:0 0 0 1px #e2e7ec;
  --navy:#13294b;--blue:#1c5a9c;--blue-d:#164a80;--gold:#fdb913;--panel:#eef2f6;--line:#c4d0dc;
  --ink:#1f2933;--muted:#5b6a7a;--danger:#b3261e;--green:#2f6b34;font-family:Arial,Helvetica,sans-serif;color:var(--ink)}
.dmv .topbar{position:fixed;top:0;left:0;right:0;height:3px;overflow:hidden;z-index:50;opacity:0;transition:opacity .2s;background:#dbe3ea}
.dmv .topbar.show{opacity:1}
.dmv .topbar i{position:absolute;top:0;height:100%;width:28%;background:var(--blue);animation:dmvtrack 1.4s ease-in-out infinite}
.dmv .topbar.stall i{animation-play-state:paused}
.dmv .util{background:var(--navy);color:#c9d6e6;font-size:11px;padding:6px 16px;letter-spacing:.3px}
.dmv .masthead{display:flex;align-items:center;gap:11px;padding:12px 16px 9px;background:#fff}
.dmv .seal{width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 50% 40%,#e9c34a,#b8891b);border:2px solid var(--blue-d);flex:none}
.dmv .wordmark b{color:var(--blue-d);font-size:15px;display:block}
.dmv .wordmark span{color:var(--muted);font-size:11px}
.dmv .goldbar{height:4px;background:var(--gold)}
.dmv .nav{background:var(--blue);color:#dce7f3;font-size:12px;padding:0 16px;letter-spacing:.2px;display:flex;gap:22px}
.dmv .navtab{padding:8px 0;cursor:pointer;border-bottom:2px solid transparent;text-decoration:none;color:#dce7f3}
.dmv .navtab:hover{color:#fff}
.dmv .navtab.active{color:#fff;border-bottom-color:var(--gold);font-weight:bold}
.dmv .freeze{background:#fff7db;border-bottom:1px solid #e7cf7a;color:#7a5b12;font-size:12px;padding:8px 16px;display:none;align-items:center;gap:8px}
.dmv .freeze.show{display:flex}
.dmv .freeze b{color:#8a4b12}
.dmv .body{padding:20px 18px 40px}
.dmv .steps{font-size:11px;color:var(--muted);letter-spacing:.4px;margin-bottom:3px}
.dmv .body h1{margin:0 0 16px;font-size:20px;color:var(--blue-d)}
.dmv .body label{font-size:12.5px;color:#33414f;font-weight:bold;display:block;margin-bottom:5px}
.dmv .field{margin-bottom:11px}
.dmv .row2{display:flex;gap:10px}
.dmv .row2 .field{flex:1}
.dmv input.tf{width:100%;border:1px solid #9fb0bf;border-radius:2px;padding:8px 10px;font-size:13px;color:#2a333c}
.dmv input.tf:disabled{background:#eef1f4;color:#8a97a3;cursor:not-allowed}
.dmv .searchrow{display:flex;gap:8px;margin-bottom:9px}
.dmv .searchrow input{flex:1}
.dmv .btn{background:linear-gradient(#2c6db0,#1c5a9c);color:#fff;border:1px solid #164a80;border-radius:2px;font:700 12px Arial;padding:0 16px;cursor:pointer;letter-spacing:.4px;white-space:nowrap;min-height:36px}
.dmv .btn:active{transform:translateY(1px)}
.dmv .btn:disabled{background:#aeb9c4;border-color:#93a1ae;color:#e7edf2;transform:none;cursor:not-allowed}
.dmv .results{margin-top:16px;position:relative}
.dmv .skl{background:linear-gradient(100deg,#e7ebee 30%,#f3f5f7 50%,#e7ebee 70%);background-size:200% 100%;animation:dmvshimmer 1.4s linear infinite;border-radius:3px}
.dmv .in{animation:dmvfadein .45s ease both}
.dmv .rhead.skl{height:34px;border:1px solid var(--line)}
.dmv .found{background:#e8f3e8;border:1px solid #c7e0c7;border-bottom:0;color:var(--green);font-size:12.5px;padding:9px 12px;font-weight:bold;border-radius:3px 3px 0 0}
.dmv .rlist{border:1px solid var(--line);border-top:0;border-radius:0 0 3px 3px;overflow:hidden}
.dmv .card{display:flex;gap:11px;align-items:center;padding:11px 12px;border-bottom:1px solid #eef1f4;min-height:68px}
.dmv .card:last-child{border-bottom:0}
.dmv .card .thumb{width:46px;height:46px;border-radius:3px;flex:none}
.dmv .card .thumb.real{filter:blur(7px);transition:filter .6s ease}
.dmv .card .thumb.real.sharp{filter:blur(0)}
.dmv .card .meta{flex:1;min-width:0}
.dmv .card .nm{color:var(--blue-d);font-weight:bold;font-size:12.5px}
.dmv .card .addr{color:#7d8b98;font-size:11px;margin-top:2px}
.dmv .card .book{background:linear-gradient(#2c6db0,#1c5a9c);color:#fff;border:1px solid #164a80;border-radius:2px;font:700 11px Arial;padding:7px 13px;cursor:pointer;flex:none}
.dmv .mapslot{height:150px;margin-top:14px;border:1px solid var(--line);border-radius:3px;position:relative;overflow:hidden}
.dmv .map{position:absolute;inset:0;background:#e6ece1}
.dmv .map .streets{position:absolute;inset:-10px;opacity:.7;background:repeating-linear-gradient(90deg,transparent 0 30px,#cdd6c8 30px 33px),repeating-linear-gradient(0deg,transparent 0 26px,#cdd6c8 26px 29px),linear-gradient(115deg,#dbe3d3,#eef2e8)}
.dmv .map .road{position:absolute;height:8px;background:#f2c14e;opacity:.85;top:46%;left:-10%;width:120%;transform:rotate(-7deg)}
.dmv .map .pin{position:absolute;font-size:20px}
.dmv .vsummary{display:flex;gap:12px;align-items:center;border:1px solid var(--line);border-radius:3px;padding:12px;min-height:74px}
.dmv .vsummary.skl{display:block;height:74px}
.dmv .vthumb{width:58px;height:44px;border-radius:3px;flex:none}
.dmv .vthumb.real{filter:blur(7px);transition:filter .6s ease}
.dmv .vthumb.real.sharp{filter:blur(0)}
.dmv .vmeta{flex:1;min-width:0}
.dmv .vname{color:var(--blue-d);font-weight:bold;font-size:13.5px}
.dmv .vsub{color:#7d8b98;font-size:11px;margin-top:2px}
.dmv .vstatus{font-size:10.5px;font-weight:bold;color:#8a5a12;background:#fff2d6;border:1px solid #ecd39a;border-radius:20px;padding:3px 9px;white-space:nowrap}
.dmv .feebox{border:1px solid var(--line);border-radius:3px;margin-top:14px;overflow:hidden}
.dmv .feehdr{background:var(--panel);border-bottom:1px solid var(--line);font-size:11px;letter-spacing:.4px;color:var(--muted);padding:8px 12px;font-weight:bold}
.dmv .feerow{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #eef1f4;font-size:12.5px;color:#3f4d59;min-height:40px}
.dmv .feerow .amt{font-variant-numeric:tabular-nums;color:#2a333c}
.dmv .feerow.total{background:#f7faf7;font-weight:bold;color:var(--ink);border-bottom:0}
.dmv .feerow.total .amt{color:var(--green);font-size:15px}
.dmv .feerow.total .amt.bump{animation:dmvbump .4s ease}
.dmv .skl-amt{width:58px;height:12px}
.dmv .skl-lbl{width:150px;height:12px}
.dmv .pay{width:100%;margin-top:14px;min-height:42px;font-size:14px}
.dmv .pay.skl{border:0;height:42px}
.dmv .emptybox{border:1px dashed var(--line);background:#fbfcfd;border-radius:3px;padding:26px 18px;text-align:center;color:#54636f}
.dmv .emptybox .ic{font-size:26px;opacity:.6}
.dmv .emptybox h4{margin:10px 0 4px;font-size:14px;color:#3f4d59}
.dmv .emptybox .sub{font-size:11.5px;color:#93a2b1}
.dmv .errbox{border:1px solid #e2b6b2;background:#fbeceb;border-radius:3px;padding:22px 18px;text-align:center}
.dmv .errbox .x{font-size:28px;color:var(--danger);line-height:1}
.dmv .errbox h4{margin:9px 0 5px;color:var(--danger);font-size:15px}
.dmv .errbox p{margin:0;font-size:12px;color:#7a3b37}
.dmv .tryagain{margin-top:14px}
@keyframes dmvshimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes dmvtrack{0%{left:-28%}50%{left:52%}100%{left:100%}}
@keyframes dmvfadein{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
@keyframes dmvbump{0%{transform:scale(1)}40%{transform:scale(1.14)}100%{transform:scale(1)}}
`;

export default DmvService;
