import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// `shared/` mora fora de frontend/, então liberamos o acesso do dev server a ele.
const raiz = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [raiz] },
    proxy: {
      '/api': 'http://localhost:3333',
      '/health': 'http://localhost:3333',
    },
  },
});
