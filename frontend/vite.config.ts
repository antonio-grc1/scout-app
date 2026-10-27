import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { transform as lightningTransform } from 'lightningcss'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

function devCssFallbackPlugin(): Plugin {
  const targets = {
    chrome: 99 << 16,
    safari: (15 << 16) | (4 << 8),
  }
  return {
    name: 'dev-css-oklch-fallback',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      if (!id.includes('.css')) return null
      try {
        const result = lightningTransform({
          filename: id,
          code: Buffer.from(code),
          targets,
          errorRecovery: true,
        })
        return {
          code: result.code.toString(),
          map: null,
        }
      } catch {
        return null
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devCssFallbackPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'pwa-icon.svg', 'pdf-templates/*.pdf'],
      manifest: {
        name: 'Sistema Scout - Grupo Scout Juan XXIII',
        short_name: 'ScoutApp',
        description: 'Sistema de Gestión Integral del Grupo Scout Juan XXIII - PWA Offline',
        theme_color: '#047857',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/^\/api/, /^\/assets\//, /\.[a-zA-Z0-9]+$/],
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
  build: {
    cssTarget: ['chrome99', 'safari15.4'],
  },
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
