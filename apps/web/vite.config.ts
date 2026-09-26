import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const apiProxy = { '/api': { target: 'http://localhost:4000', changeOrigin: false } };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from main.tsx.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Samaj',
        short_name: 'Samaj',
        description: 'The Teli Samaj directory, notices, events and matrimony for member families.',
        lang: 'en',
        start_url: '/community',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0B5D57',
        background_color: '#F6F8F7',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell (HTML, JS, CSS, fonts, icons) is cached at install, so it opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Cache names are cleared on sign-in and sign-out by src/lib/offline.ts; keep them in sync.
        runtimeCaching: [
          {
            // Photo URLs change when the photo does (?v=), so a cached copy is always current.
            urlPattern: ({ url, request }) => request.method === 'GET' && /^\/api\/members\/[^/]+\/photo$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'samaj-photos', expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [200] } },
          },
          {
            // Everything else the app reads: fresh when online, the last copy when offline.
            // Only GETs, so nothing that changes data is ever cached or replayed.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/') && url.pathname !== '/api/health' && !url.pathname.startsWith('/api/verifications'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'samaj-api',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 300, maxAgeSeconds: 14 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Same origin in dev, so auth cookies behave exactly as they will in production.
    proxy: apiProxy,
  },
  // `npm run preview` serves the production build, with the service worker, against the dev API.
  preview: { port: 4173, proxy: apiProxy },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
