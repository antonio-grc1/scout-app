import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister()
      }
    })
  } else {
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true
        window.location.reload()
      }
    })

    try {
      const SW_FIX_KEY = 'scout-sw-clean-v3'
      if (localStorage.getItem(SW_FIX_KEY) !== '1') {
        localStorage.setItem(SW_FIX_KEY, '1')
        if ('caches' in window) {
          caches.keys().then((keys) => {
            for (const key of keys) {
              if (key.includes('precache') || key.includes('workbox')) {
                caches.delete(key)
              }
            }
          })
        }
      }
    } catch {
      // Ignorar si almacenamiento está bloqueado
    }

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.update().catch(() => null)
      }
    })
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
