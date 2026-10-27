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
      selfDestroying: true,
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
