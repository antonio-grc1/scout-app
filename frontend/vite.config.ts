import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icon.svg', 'pdf-templates/*.pdf'],
      manifest: {
        name: 'Sistema Scout - Grupo Scout Juan XXIII',
        short_name: 'ScoutApp',
        description: 'Sistema de Gestión Integral del Grupo Scout Juan XXIII - PWA Offline',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Cache offline de padrón y legajos para campamento sin señal (AGENTS.md §2)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/miembros') || url.pathname.startsWith('/api/legajos'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'scout-offline-data',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 días en campamento
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/pdf-templates/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'scout-pdf-templates',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
