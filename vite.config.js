import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset URLs relative so the built app also works when
// served from a subpath; the bench harness serves dist/ from a static server.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { target: 'es2020' },
});
