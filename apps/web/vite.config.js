import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  esbuild: { jsx: 'automatic' },
  // `@/` is what every shadcn registry emits in its import statements; without this
  // alias each pulled component fails to resolve. Existing relative imports still work.
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
  },
});
