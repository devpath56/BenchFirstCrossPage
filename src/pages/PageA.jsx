import React from 'react';
import HeavyList from './HeavyList.jsx';

// Page A — a "Feed": a big list where marking items walks the highlight down,
// re-rendering the whole list each step in the baseline.
export default function PageA({ variant }) {
  return (
    <HeavyList
      pageId="a"
      title="Feed"
      rowCount={3000}
      iters={150}
      steps={20}
      strategy={variant}
    />
  );
}
