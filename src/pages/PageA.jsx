import React, { useMemo, useEffect } from 'react';
import DmvList from './DmvList.jsx';

const CITIES = [
  'Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Fresno',
  'Sacramento', 'Long Beach', 'Oakland', 'Bakersfield', 'Anaheim',
];

const STREETS = [
  'Main St', 'Broadway', 'Mission Blvd', 'El Camino Real', 'Cesar Chavez Ave',
  'Sunset Blvd', 'Foothill Rd', 'Del Monte Ave', 'Ventura Blvd', 'Alameda St',
];

const OFFICE_COUNT = 4000;

// Deterministic mock office rows (index-derived, no randomness) so the bench
// harness sees the same data every run.
function makeOffices() {
  return Array.from({ length: OFFICE_COUNT }, (_, i) => {
    const city = CITIES[i % CITIES.length];
    const street = STREETS[(i * 3) % STREETS.length];
    return {
      id: i,
      name: `${city} DMV Field Office #${i + 1}`,
      address: `${100 + ((i * 17) % 8900)} ${street}`,
      city,
      distance: ((i * 0.37) % 62) + 0.4, // miles
      wait: (i * 7) % 75, // current wait, minutes
      // Deterministic lat/lng within California for the live haversine distance.
      lat: 34 + ((i * 0.013) % 8),
      lng: -124 + ((i * 0.021) % 10),
    };
  });
}

// Page A — "Find a DMV office": ~800 offices where walking the highlight down
// re-renders the whole list each step in the baseline.
export default function PageA({ variant }) {
  const offices = useMemo(makeOffices, []);

  // DISTRACTOR ANTIPATTERN (intentional): a useEffect with no dependency array
  // fires after every render and console.logs all current wait times — a wasteful
  // side effect that has nothing to do with the real per-row render cost.
  useEffect(() => {
    console.log('[PageA] current wait times:', offices.map((o) => o.wait));
  });

  return (
    <DmvList
      pageId="a"
      title="Find a DMV office"
      iters={150}
      steps={20}
      strategy={variant}
      items={offices}
      kind="office"
      filters={{
        selectOne: { label: 'City', key: 'city', options: CITIES },
        selectTwo: {
          label: 'Distance',
          key: 'city', // ugly gov filter that doesn't really narrow — decorative
          options: ['Within 10 mi', 'Within 25 mi', 'Within 50 mi'],
        },
        text: { label: 'Office name', key: 'name', placeholder: 'Search offices…' },
      }}
    />
  );
}
