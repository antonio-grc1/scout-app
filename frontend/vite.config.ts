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
      includeAssets: ['favicon.ico', 'favicon.svg', 'pwa-icon.svg', 'pwa-icon-192.png', 'pwa-icon-512.png', 'apple-touch-icon.png', 'pdf-templates/*.pdf'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,pdf}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: 'Grupo Scout Juan XXIII',
        short_name: 'Juan XXIII',
        description: 'Sistema de Gestión Integral del Grupo Scout Juan XXIII - PWA Offline',
        theme_color: '#18191e',
        background_color: '#fbfbf9',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        chrome: 99 << 16,
        safari: (15 << 16) | (4 << 8),
      },
    },
  },
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
