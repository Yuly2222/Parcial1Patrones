import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Optimizado para carga mínima en redes degradadas (4.4 del enunciado):
// PWA con app-shell cacheado (NetworkFirst con timeout corto -> si la red
// está lenta/caída, sirve la última versión cacheada en vez de colgarse).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Emergencias 2026 — Chocó, Pereira, Cali, Manizales',
        short_name: 'Emergencias',
        description: 'Radicación y despacho de emergencias en tiempo real',
        theme_color: '#b3261e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'app-shell', networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
