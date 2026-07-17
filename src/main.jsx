import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Config comes from the URL hash so the bench harness / an agent can drive any
// page+variant deterministically without a router dependency:  #page=a&variant=parallel
const root = createRoot(document.getElementById('root'));

function render() {
  const params = new URLSearchParams(location.hash.slice(1));
  const page = params.get('page') || 'a';
  const variant = params.get('variant') || 'baseline';
  root.render(<App key={page + variant} page={page} variant={variant} />);
}

window.addEventListener('hashchange', render); // nav tabs switch pages by changing the hash
render();
