import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'The Ledger',
        short_name: 'Ledger',
        description: 'Household wealth manager - expenses, SIPs, EMIs, goals and portfolio.',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        id: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#F6F2E8',
        background_color: '#F6F2E8',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Add expense', short_name: 'Expense', url: '/expenses/add', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Investments', short_name: 'Invest', url: '/invest', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Loans', short_name: 'Loans', url: '/loans', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        globIgnores: ['**/pdf.worker*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: /pdf\.worker.*\.mjs$/, handler: 'CacheFirst', options: { cacheName: 'pdf-worker', expiration: { maxEntries: 2 } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, handler: 'StaleWhileRevalidate', options: { cacheName: 'fonts' } },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
})
