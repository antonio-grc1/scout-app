# API Client (`frontend/src/api`)

## Overview

Configures and exports the shared Axios HTTP client (`api`) for `/api` backend communication with a 7000ms timeout, Bearer token injection, offline GET caching/fallback, and global 401/403 authentication and password-change error handling.

## Interface

- `[client.ts:api]` — Exported Axios instance configured with `baseURL` (`${VITE_API_URL}/api` or `/api`), `timeout: 7000`, and `'Content-Type': 'application/json'` header.
- `[client.ts:setOnAuthError]` — Exported function `(cb: () => void) => void` to register a callback invoked upon a 401 response.
- `[client.ts:setOnRequirePasswordChange]` — Exported function `(cb: () => void) => void` to register a callback invoked upon a 403 response requiring a password change.

## Invariants

- `[client.ts:baseURL]` — Strips trailing slash from `import.meta.env.VITE_API_URL` and appends `/api`, defaulting to `/api` when `VITE_API_URL` is unset or empty.
- `[client.ts:api]` — Request timeout is fixed at 7000ms.
- `[client.ts:api.interceptors.request]` — Offline GET requests (`!navigator.onLine` and `method === 'get'`) reject immediately with `__isOfflineFastFail: true` without making a network call.
- `[client.ts:api.interceptors.response]` — Only HTTP 200 GET responses where `responseType` is neither `'blob'` nor `'arraybuffer'` are stored in the offline cache.
- `[client.ts:isHandlingAuthError]` — De-duplicates concurrent 401 error handling using a 1500ms lock window (`isHandlingAuthError`).
- `[client.ts:api.interceptors.response]` — Password change redirect triggers on HTTP 403 only when `error.response.data.code === 'REQUIERE_CAMBIO_CLAVE'` or `error.response.data.message` (lowercased) includes `'cambio de clave'`.

## Side Effects

- `[client.ts:api.interceptors.request]` — Reads `'scout_token'` from `localStorage` and mutates `config.headers.Authorization` to `Bearer ${token}`.
- `[client.ts:api.interceptors.response]` — Calls `guardarEnCache(config.url, config.params, data)` on successful non-binary GET responses.
- `[client.ts:api.interceptors.response]` — Reads offline cache via `obtenerDeCache(config.url, config.params)` and mutates Zustand store via `useOfflineStore.getState().marcarUsoCache(cached.timestamp)` when a GET request fails due to network/timeout/offline errors.
- `[client.ts:api.interceptors.response]` — On HTTP 401, calls `limpiarCacheApi()`, removes `'scout_token'`, `'scout_user'`, `'scout_asignaciones'`, and `'scout_cambio_clave'` from `localStorage`, invokes `onAuthErrorCallback`, redirects `window.location.href` to `'/login'` (if not already on `'/login'`), and sets a 1500ms `setTimeout` to reset `isHandlingAuthError`.
- `[client.ts:api.interceptors.response]` — On HTTP 403 requiring password change, invokes `onRequirePasswordChangeCallback` and redirects `window.location.href` to `'/cambiar-clave'` (if not already on `'/cambiar-clave'`).

## Verification

- Run: `npm run build && npm run lint`
