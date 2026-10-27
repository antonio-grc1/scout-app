import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const require = createRequire(import.meta.url)

/**
 * Desenvuelve bloques `@layer <nombre> { ... }` y transpila `oklch()`, `color-mix()`,
 * `@media (width >= ...)` y propiedades lógicas (`inset-inline`, `margin-inline`, `translate`)
 * a CSS estándar compatible con Android 2020/2021+ (Chrome 80+) e iOS 13.4+.
 */
function unwrapCascadeLayers(css: string): string {
  // 1. Eliminar declaraciones vacías como `@layer components;`
  let out = css.replace(/@layer\s+[^{;]+;/g, '')

  // 2. Desenvolver bloques `@layer nombre { ... }` respetando llaves balanceadas
  while (true) {
    const match = out.match(/@layer(?:\s+[a-zA-Z0-9_.-]+)?\s*\{/)
    if (!match || match.index === undefined) break
    const startIdx = match.index
    const openBraceIdx = startIdx + match[0].length - 1
    let depth = 1
    let i = openBraceIdx + 1
    let inString = false
    let quoteChar = ''

    while (i < out.length && depth > 0) {
      const ch = out[i]
      if (inString) {
        if (ch === quoteChar && out[i - 1] !== '\\') {
          inString = false
        }
      } else {
        if (ch === '"' || ch === "'") {
          inString = true
          quoteChar = ch
        } else if (ch === '{') {
          depth++
        } else if (ch === '}') {
          depth--
        }
      }
      i++
    }

    if (depth === 0) {
      const inner = out.slice(openBraceIdx + 1, i - 1)
      out = out.slice(0, startIdx) + inner + out.slice(i)
    } else {
      break
    }
  }

  return out
}

function legacyCssCompatPlugin(): Plugin {
  const lightningcss = require('lightningcss') as {
    transform: (opts: {
      filename: string
      code: Buffer
      minify: boolean
      targets: Record<string, number>
    }) => { code: Uint8Array }
  }

  const transformCssForLegacyMobile = (cssCode: string, filename = 'index.css'): string => {
    try {
      // Garantizar inicialización de custom properties en navegadores sin soporte completo de @property
      const fallbackInit = `*, ::before, ::after, ::backdrop {
        --tw-translate-x: 0;
        --tw-translate-y: 0;
        --tw-translate-z: 0;
        --tw-rotate-x: initial;
        --tw-rotate-y: initial;
        --tw-rotate-z: initial;
        --tw-skew-x: initial;
        --tw-skew-y: initial;
        --tw-space-y-reverse: 0;
        --tw-divide-y-reverse: 0;
        --tw-border-style: solid;
        --tw-shadow: 0 0 #0000;
        --tw-inset-shadow: 0 0 #0000;
        --tw-ring-color: initial;
        --tw-ring-shadow: 0 0 #0000;
        --tw-inset-ring-color: initial;
        --tw-inset-ring-shadow: 0 0 #0000;
        --tw-ring-inset: initial;
        --tw-ring-offset-width: 0px;
        --tw-ring-offset-color: #fff;
        --tw-ring-offset-shadow: 0 0 #0000;
      }\n`
      const unlayered = fallbackInit + unwrapCascadeLayers(cssCode)
      const { code } = lightningcss.transform({
        filename,
        code: Buffer.from(unlayered),
        minify: false,
        targets: {
          chrome: 80 << 16,
          android: 80 << 16,
          safari: (13 << 16) | (1 << 8),
          ios_saf: (13 << 16) | (4 << 8),
        },
      })
      return Buffer.from(code).toString('utf8')
    } catch {
      return unwrapCascadeLayers(cssCode)
    }
  }

  return {
    name: 'scout-legacy-css-compat',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('.css')) return null
      if (!code.includes('@layer') && !code.includes('oklch(')) return null
      return {
        code: transformCssForLegacyMobile(code, id.split('?')[0]),
        map: null,
      }
    },
    generateBundle(_options, bundle) {
      for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
        if (
          fileName.endsWith('.css') &&
          chunkOrAsset.type === 'asset' &&
          typeof chunkOrAsset.source === 'string'
        ) {
          chunkOrAsset.source = transformCssForLegacyMobile(chunkOrAsset.source, fileName)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    legacyCssCompatPlugin(),
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
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
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
    target: ['es2020', 'chrome80', 'safari13'],
    cssTarget: ['chrome80', 'safari13'],
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
