import React from 'react';
import PageA from './pages/PageA.jsx';
import PageB from './pages/PageB.jsx';

export default function App({ page, variant }) {
  const Page = page === 'b' ? PageB : PageA;
  return <Page variant={variant} />;
}
