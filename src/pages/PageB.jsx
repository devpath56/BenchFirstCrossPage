import React, { useMemo } from 'react';
import DmvList from './DmvList.jsx';

const SERVICES = [
  'Driver License Renewal',
  'Vehicle Registration',
  'REAL ID',
  'Written Knowledge Test',
  'Behind-the-Wheel Test',
  'Title Transfer',
];

const OFFICES = [
  'Los Angeles DMV', 'San Diego DMV', 'San Jose DMV', 'San Francisco DMV',
  'Fresno DMV', 'Sacramento DMV', 'Long Beach DMV', 'Oakland DMV',
];

const DAYS = [
  'Mon Jul 20', 'Tue Jul 21', 'Wed Jul 22', 'Thu Jul 23', 'Fri Jul 24',
  'Mon Jul 27', 'Tue Jul 28', 'Wed Jul 29', 'Thu Jul 30', 'Fri Jul 31',
];

const TIMES = [
  '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM',
];

const SLOT_COUNT = 1500;

// Deterministic mock appointment slots (index-derived, no randomness).
function makeSlots() {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({
    id: i,
    date: DAYS[i % DAYS.length],
    time: TIMES[(i * 3) % TIMES.length],
    office: OFFICES[(i * 5) % OFFICES.length],
    service: SERVICES[(i * 7) % SERVICES.length],
  }));
}

// DISTRACTOR ANTIPATTERN (intentional): a huge hand-inlined SVG calendar icon.
// It has nothing to do with the per-row render cost — it is deliberately verbose
// bloat sitting in the render tree to look like a plausible thing to "clean up".
function CalendarIcon() {
  return (
    <svg
      className="dmv-cal"
      width="120"
      height="120"
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* --- calendar body --- */}
      <rect x="8" y="16" width="104" height="96" rx="4" fill="#ffffff" stroke="#003466" strokeWidth="3" />
      {/* --- red month header band --- */}
      <rect x="8" y="16" width="104" height="22" rx="4" fill="#b22222" stroke="#003466" strokeWidth="3" />
      <rect x="8" y="32" width="104" height="6" fill="#b22222" />
      {/* --- spiral binding rings --- */}
      <line x1="26" y1="8" x2="26" y2="26" stroke="#003466" strokeWidth="3" strokeLinecap="round" />
      <circle cx="26" cy="8" r="3" fill="#8a8a8a" stroke="#003466" strokeWidth="1.5" />
      <line x1="42" y1="8" x2="42" y2="26" stroke="#003466" strokeWidth="3" strokeLinecap="round" />
      <circle cx="42" cy="8" r="3" fill="#8a8a8a" stroke="#003466" strokeWidth="1.5" />
      <line x1="58" y1="8" x2="58" y2="26" stroke="#003466" strokeWidth="3" strokeLinecap="round" />
      <circle cx="58" cy="8" r="3" fill="#8a8a8a" stroke="#003466" strokeWidth="1.5" />
      <line x1="74" y1="8" x2="74" y2="26" stroke="#003466" strokeWidth="3" strokeLinecap="round" />
      <circle cx="74" cy="8" r="3" fill="#8a8a8a" stroke="#003466" strokeWidth="1.5" />
      <line x1="90" y1="8" x2="90" y2="26" stroke="#003466" strokeWidth="3" strokeLinecap="round" />
      <circle cx="90" cy="8" r="3" fill="#8a8a8a" stroke="#003466" strokeWidth="1.5" />
      {/* --- month label --- */}
      <text x="60" y="32" textAnchor="middle" fontFamily="Arial" fontSize="12" fontWeight="bold" fill="#ffffff">
        JULY 2026
      </text>
      {/* --- weekday header letters --- */}
      <text x="20" y="50" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#003466">S</text>
      <text x="34" y="50" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#003466">M</text>
      <text x="48" y="50" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#003466">T</text>
      <text x="62" y="50" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#003466">W</text>
      <text x="76" y="50" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#003466">T</text>
      <text x="90" y="50" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#003466">F</text>
      <text x="104" y="50" textAnchor="middle" fontFamily="Arial" fontSize="8" fill="#b22222">S</text>
      {/* --- grid: vertical rules --- */}
      <line x1="27" y1="42" x2="27" y2="108" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="41" y1="42" x2="41" y2="108" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="55" y1="42" x2="55" y2="108" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="69" y1="42" x2="69" y2="108" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="83" y1="42" x2="83" y2="108" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="97" y1="42" x2="97" y2="108" stroke="#d0d0d0" strokeWidth="1" />
      {/* --- grid: horizontal rules --- */}
      <line x1="12" y1="54" x2="108" y2="54" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="12" y1="64" x2="108" y2="64" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="12" y1="74" x2="108" y2="74" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="12" y1="84" x2="108" y2="84" stroke="#d0d0d0" strokeWidth="1" />
      <line x1="12" y1="94" x2="108" y2="94" stroke="#d0d0d0" strokeWidth="1" />
      {/* --- week 1 --- */}
      <text x="90" y="62" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">1</text>
      <text x="104" y="62" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">2</text>
      {/* --- week 2 --- */}
      <text x="20" y="72" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">3</text>
      <text x="34" y="72" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">4</text>
      <text x="48" y="72" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">5</text>
      <text x="62" y="72" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">6</text>
      <text x="76" y="72" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">7</text>
      <text x="90" y="72" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">8</text>
      <text x="104" y="72" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">9</text>
      {/* --- week 3 --- */}
      <text x="20" y="82" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">10</text>
      <text x="34" y="82" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">11</text>
      <text x="48" y="82" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">12</text>
      <text x="62" y="82" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">13</text>
      <text x="76" y="82" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">14</text>
      <text x="90" y="82" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">15</text>
      <text x="104" y="82" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">16</text>
      {/* --- week 4 --- */}
      <text x="20" y="92" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">17</text>
      <text x="34" y="92" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">18</text>
      <text x="48" y="92" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">19</text>
      {/* highlighted appointment day */}
      <circle cx="62" cy="89" r="6" fill="#ffb819" stroke="#003466" strokeWidth="1.5" />
      <text x="62" y="92" textAnchor="middle" fontFamily="Arial" fontSize="7" fontWeight="bold" fill="#003466">20</text>
      <text x="76" y="92" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">21</text>
      <text x="90" y="92" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">22</text>
      <text x="104" y="92" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">23</text>
      {/* --- week 5 --- */}
      <text x="20" y="102" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">24</text>
      <text x="34" y="102" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">25</text>
      <text x="48" y="102" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">26</text>
      <text x="62" y="102" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">27</text>
      <text x="76" y="102" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">28</text>
      <text x="90" y="102" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#333">29</text>
      <text x="104" y="102" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">30</text>
      {/* --- week 6 --- */}
      <text x="20" y="112" textAnchor="middle" fontFamily="Arial" fontSize="7" fill="#b22222">31</text>
      {/* --- little clock accent, bottom-right --- */}
      <circle cx="98" cy="104" r="9" fill="#ffffff" stroke="#003466" strokeWidth="2" />
      <line x1="98" y1="104" x2="98" y2="99" stroke="#003466" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="98" y1="104" x2="102" y2="104" stroke="#003466" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="98" cy="104" r="1" fill="#003466" />
      {/* --- gold baseline underline accent --- */}
      <rect x="8" y="108" width="104" height="4" fill="#ffb819" />
    </svg>
  );
}

// Page B — "Book an appointment": ~1500 time-slot rows. Same per-row-update
// pathology as Page A, plus a decorative inline SVG distractor.
export default function PageB({ variant }) {
  const slots = useMemo(makeSlots, []);

  return (
    <div>
      <div className="dmv-hero">
        <CalendarIcon />
        <p className="dmv-hero-text">
          Select an available time below. Appointments are held for 10 minutes.
        </p>
      </div>
      <DmvList
        pageId="b"
        title="Book an appointment"
        iters={150}
        steps={15}
        strategy={variant}
        items={slots}
        kind="slot"
        filters={{
          selectOne: { label: 'Office', key: 'office', options: OFFICES },
          selectTwo: { label: 'Service type', key: 'service', options: SERVICES },
          text: { label: 'Date', key: 'date', placeholder: 'e.g. Jul 20' },
        }}
      />
    </div>
  );
}
