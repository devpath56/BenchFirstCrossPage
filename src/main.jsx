import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Config comes from the URL hash so the bench harness can drive any
// page/variant combination deterministically without a router dependency:
//   #page=a&variant=memo
const params = new URLSearchParams(location.hash.slice(1));
const page = params.get('page') || 'a';
const variant = params.get('variant') || 'baseline';

createRoot(document.getElementById('root')).render(
  <App page={page} variant={variant} />
);
