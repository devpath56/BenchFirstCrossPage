import React from 'react';
import HeavyList from './HeavyList.jsx';

// Page B — a "Sourcing" list (a nod to Metaview's own sourcing page): a
// different page (fewer rows, fewer steps) but the SAME pathology class as
// Page A, so its memory signature matches and Page A's win transfers here.
export default function PageB({ variant }) {
  return (
    <HeavyList
      pageId="b"
      title="Sourcing"
      rowCount={2000}
      iters={150}
      steps={15}
      strategy={variant}
    />
  );
}
