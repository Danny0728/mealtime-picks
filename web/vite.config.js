import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// On GitHub Pages the site lives under /<repo>/; the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mealtime Picks',
        short_name: 'Mealtime',
        description: 'Three good things to watch for the time you have.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0A0A0E',
        theme_color: '#0A0A0E',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android: share a reel or post from Instagram straight into the app.
        share_target: {
          action: '.',
          method: 'GET',
          params: { title: 'share_title', text: 'share_text', url: 'share_url' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Fresh catalog when online, last week's when offline.
            urlPattern: ({ url }) => url.pathname.endsWith('/catalog.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'catalog', networkTimeoutSeconds: 4 },
          },
          {
            urlPattern: ({ url }) => ['image.tmdb.org', 'i.ytimg.com'].includes(url.hostname),
            handler: 'CacheFirst',
            options: { cacheName: 'posters', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts' },
          },
        ],
      },
    }),
  ],
})
