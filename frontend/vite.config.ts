import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// `shared/` mora fora de frontend/, então liberamos o acesso do dev server a ele.
const raiz = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // PWA: instalável na tela inicial do celular (Android e iOS via "Adicionar à
    // Tela de Início"), abre em tela cheia e o "app shell" fica em cache.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Mostruário',
        short_name: 'Mostruário',
        description: 'Catálogo e fichas de mostruário — crie e preencha planilhas.',
        lang: 'pt-BR',
        dir: 'ltr',
        theme_color: '#1f2a26',
        background_color: '#1f2a26',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Navegação cai no index.html (SPA), MENOS as chamadas de API/health, que
        // precisam ir sempre à rede (dados vivos, não cacheados pelo SW).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/health/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fontes-google',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    fs: { allow: [raiz] },
    proxy: {
      '/api': 'http://localhost:3333',
      '/health': 'http://localhost:3333',
    },
  },
});
