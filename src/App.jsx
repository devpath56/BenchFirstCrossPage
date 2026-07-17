import React from 'react';
import PageA from './pages/pageA.jsx';
import PageB from './pages/pageB.jsx';

export default function App({ page, variant }) {
  const Page = page === 'b' ? PageB : PageA;
  return <Page variant={variant} />;
}
