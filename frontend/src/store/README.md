# store

## Overview

Global client-side state management built on Zustand (`zustand`), managing authenticated user sessions and role-based permission checks (`authStore.ts`), network connectivity and offline cache banner state (`offlineStore.ts`), theme mode and custom CSS token presets (`themeStore.ts`), and transient toast notifications with optional undo actions (`toastStore.ts`).

## Interface

- `[authStore.ts:AsignacionUsuario]` — `interface { unidadId: number; unidadNombre: string; rolId?: number; rol: string; tipoMiembro?: string; requiereRama?: boolean; alcance: 'PROPIO' | 'UNIDAD' | 'GLOBAL'; permisos: string[] }`.
- `[authStore.ts:UsuarioSesion]` — `interface { id: number; dni: string; nombre: string; apellido: string }`.
- `[authStore.ts:useAuthStore]` — Zustand store hook managing `AuthState` (`token`, `usuario`, `requiereCambioClave`, `asignaciones`, `setSesion`, `setRequiereCambioClave`, `refrescarSesionDesdeServidor`, `logout`, `tieneGlobal`, `tieneRama`, `tieneUnidad`, `tienePropio`, `tienePermiso`, `puedeVerPadron`, `puedeAccederPanelGestion`).
- `[offlineStore.ts:useOfflineStore]` — Zustand store hook managing `OfflineState` (`isOnline`, `isUsingCache`, `lastCachedAt`, `mostrarBanner`, `conexionRestablecida`, `marcarUsoCache`, `actualizarEstadoRed`, `descartarBanner`).
- `[themeStore.ts:ThemeMode]` — `type 'light' | 'dark' | 'system'`.
- `[themeStore.ts:ThemePreset]` — `type 'scout' | 'nautical' | 'forest' | 'contrast' | 'custom'`.
- `[themeStore.ts:FontScale]` — `type '100%' | '110%' | '125%'`.
- `[themeStore.ts:PresetTokens]` — `interface { brand: string; contrast: string; paper: string; paper2?: string; paper3?: string; surface: string; nav?: string; navContrast?: string; ink: string; muted: string; rule: string; fontScale?: FontScale; logoScale?: number }`.
- `[themeStore.ts:ThemePresetDefinition]` — `interface { id: ThemePreset; label: string; description: string; light: PresetTokens; dark: PresetTokens }`.
- `[themeStore.ts:ThemeCustomizationConfig]` — `interface { preset: ThemePreset; brandColor?: string; brandContrast?: string; paperColor?: string; surfaceColor?: string; navColor?: string; navContrast?: string; inkColor?: string; inkMutedColor?: string; ruleColor?: string; fontScale: FontScale; logoScale: number; logoUrl?: string }`.
- `[themeStore.ts:ThemeState]` — Interface defining state and actions exposed by `useThemeStore`.
- `[themeStore.ts:THEME_PRESETS]` — `Record<Exclude<ThemePreset, 'custom'>, ThemePresetDefinition>` defining the `'scout'`, `'nautical'`, `'forest'`, and `'contrast'` theme presets.
- `[themeStore.ts:DEFAULT_THEME_CUSTOMIZATION]` — Default `ThemeCustomizationConfig` (`{ preset: 'scout', fontScale: '100%', logoScale: 1.0, logoUrl: '/brand/Logo%20Juancho%20Icono.png' }`).
- `[themeStore.ts:getContrastTextColor]` — `(hexColor: string) => '#ffffff' | '#090a0f'` WCAG relative luminance contrast helper.
- `[themeStore.ts:updateMetaThemeColor]` — `(color: string) => void` updates the browser `<meta name="theme-color">` tag.
- `[themeStore.ts:useThemeStore]` — Zustand store hook managing `ThemeState` (`theme`, `resolvedTheme`, `setTheme`, `toggleTheme`, `isCustomizerOpen`, `openCustomizer`, `closeCustomizer`, `customization`, `setPreset`, `setCustomization`, `setBrandColor`, `setNavColor`, `setPaperColor`, `setInkColor`, `setFontScale`, `setLogoScale`, `resetDefaults`, `resetThemeCustomization`).
- `[toastStore.ts:ToastAccion]` — `interface { label?: string; onEjecutar: () => void | Promise<void> }`.
- `[toastStore.ts:ToastItem]` — `interface { id: string; texto: string; tipo: 'exito' | 'error' | 'info' | 'advertencia'; accion?: ToastAccion; duracionMs: number; creadoEn: number }`.
- `[toastStore.ts:useToastStore]` — Zustand store hook managing `ToastState` (`toast`, `mostrarToast`, `mostrarToastConDeshacer`, `cerrarToast`, `ejecutarAccion`).
- `[toastStore.ts:mostrarToast]` — `(texto: string, tipo?: 'exito' | 'error' | 'info' | 'advertencia', duracionMs?: number) => void` standalone helper for dispatching toast notifications.
- `[toastStore.ts:mostrarToastConDeshacer]` — `(texto: string, onDeshacer: () => void | Promise<void>, duracionMs?: number) => void` standalone helper for dispatching undoable toast notifications.

## Invariants

- `[authStore.ts:tieneGlobal]` — Returns `true` if and only if at least one assignment in `asignaciones` has `alcance === 'GLOBAL'`.
- `[authStore.ts:tieneRama]` — Returns `true` if and only if at least one assignment in `asignaciones` has `alcance === 'UNIDAD'`.
- `[authStore.ts:tieneUnidad]` — Returns `true` if and only if at least one assignment in `asignaciones` has `alcance === 'UNIDAD'`.
- `[authStore.ts:tienePropio]` — Returns `true` if and only if `asignaciones.length > 0`.
- `[authStore.ts:puedeVerPadron]` — Requires `(tieneUnidad() || tieneGlobal()) && tienePermiso('miembros.ver')`.
- `[authStore.ts:puedeAccederPanelGestion]` — Returns `false` if no assignment has `tipoMiembro === 'EDUCADOR'` or `alcance === 'UNIDAD'` or `alcance === 'GLOBAL'`; otherwise requires `tieneGlobal()` or at least one management permission (`tesoreria.*`, `cuotas.*`, `eventos.*`, `organizacion.*`, `roles.gestionar`, `pases.*`, `legajos.*`).
- `[authStore.ts:refrescarSesionDesdeServidor]` — No-op when `token` is falsy; updates session state only when the `/auth/me` response includes `usuario` and `Array.isArray(data.asignaciones)`, falling back to `currentToken` if `data.accessToken` is absent.
- `[offlineStore.ts:actualizarEstadoRed]` — Transitioning to `online = true` sets `conexionRestablecida: true` and `mostrarBanner: true`, then schedules a `4000` ms timer to reset `conexionRestablecida: false`, `isUsingCache: false`, and `mostrarBanner: false`.
- `[themeStore.ts:getInitialCustomization]` — Strips manual color overrides (`brandColor`, `brandContrast`, `paperColor`, `surfaceColor`, `navColor`, `navContrast`, `inkColor`, `inkMutedColor`, `ruleColor`) from stored configuration whenever `parsed.preset` is defined and not `'custom'`.
- `[themeStore.ts:applyDocumentCustomization]` — When `preset === 'scout'` with no manual color overrides, `fontScale === '100%'`, and `logoScale === 1.0`, removes all inline custom CSS properties on `document.documentElement` so stylesheet defaults apply cleanly.
- `[themeStore.ts:setCustomization]` — Automatically switches `preset` to `'custom'` when any manual color override (`brandColor`, `paperColor`, `surfaceColor`, `navColor`, `inkColor`) is supplied without an explicit `updates.preset`, and auto-computes `brandContrast` and `navContrast` via `getContrastTextColor`.
- `[themeStore.ts:setBrandColor]` — Forces `preset` to `'custom'` and computes `brandContrast` via `getContrastTextColor(color)`.
- `[themeStore.ts:setNavColor]` — Forces `preset` to `'custom'` and computes `navContrast` via `getContrastTextColor(color)`.
- `[themeStore.ts:setPaperColor]` — Forces `preset` to `'custom'`.
- `[themeStore.ts:setInkColor]` — Forces `preset` to `'custom'`.
- `[themeStore.ts:setLogoScale]` — Clamps `logoScale` to the range `[0.8, 1.4]` rounded to 2 decimal places.
- `[toastStore.ts:mostrarToast]` — Suppresses error toasts (`tipo === 'error'`) when `navigator.onLine === false` or when `texto` (lowercased) contains `'sin conexión'`, `'sin conexion'`, `'offline'`, or `'red'`; defaults to `tipo = 'exito'` and `duracionMs = 4000`.
- `[toastStore.ts:mostrarToastConDeshacer]` — Creates an `'info'` toast with `accion.label = 'Deshacer'` and default `duracionMs = 7500`.
- `[toastStore.ts:ejecutarAccion]` — Clears `timeoutId` and resets `toast` to `null` before awaiting `accion.onEjecutar()` to prevent duplicate execution.

## Side Effects

- `[authStore.ts:useAuthStore]` — Reads `'scout_token'`, `'scout_user'`, `'scout_asignaciones'`, and `'scout_cambio_clave'` from `localStorage` during store initialization.
- `[authStore.ts:setSesion]` — Writes `'scout_token'`, `'scout_user'`, `'scout_asignaciones'`, and `'scout_cambio_clave'` to `localStorage`.
- `[authStore.ts:setRequiereCambioClave]` — Writes `'scout_cambio_clave'` to `localStorage`.
- `[authStore.ts:refrescarSesionDesdeServidor]` — Executes `api.get('/auth/me')` and persists updated session data to `localStorage` and store state.
- `[authStore.ts:logout]` — Invokes `limpiarCacheApi()` and removes `'scout_token'`, `'scout_user'`, `'scout_asignaciones'`, and `'scout_cambio_clave'` from `localStorage`.
- `[authStore.ts:setOnAuthError]` — Registers a module-load callback on the HTTP client that triggers `useAuthStore.getState().logout()`.
- `[authStore.ts:setOnRequirePasswordChange]` — Registers a module-load callback on the HTTP client that triggers `useAuthStore.getState().setRequiereCambioClave(true)`.
- `[offlineStore.ts:useOfflineStore]` — Reads `navigator.onLine` and registers `'online'` and `'offline'` event listeners on `window` at module load.
- `[offlineStore.ts:actualizarEstadoRed]` — Manages module-scoped timer `timeoutRestablecido` via `clearTimeout` and `setTimeout` (`4000` ms).
- `[themeStore.ts:updateMetaThemeColor]` — Queries or appends `<meta name="theme-color">` in `document.head` and updates its `content` attribute.
- `[themeStore.ts:getInitialThemeMode]` — Reads `'scout-theme'` (`STORAGE_MODE_KEY`) from `localStorage` at module load.
- `[themeStore.ts:getInitialCustomization]` — Reads `'scout-theme-customization'` (`STORAGE_CUSTOM_KEY`) from `localStorage` at module load.
- `[themeStore.ts:applyDocumentThemeMode]` — Toggles the `'dark'` class and `style.colorScheme` on `document.documentElement` at module load and on theme changes.
- `[themeStore.ts:applyDocumentCustomization]` — Sets or removes inline CSS variables (`--color-brand`, `--color-paper`, `--color-navbar`, `--font-scale`, `--brand-logo-scale`, `--brand-logo-url`, etc.) on `document.documentElement.style` and calls `updateMetaThemeColor`.
- `[themeStore.ts:useThemeStore]` — Registers a `'change'` listener on `window.matchMedia('(prefers-color-scheme: dark)')` and persists `'scout-theme'` and `'scout-theme-customization'` in `localStorage`.
- `[toastStore.ts:mostrarToast]` — Manages module-scoped timer `timeoutId` via `clearTimeout` and `setTimeout` to auto-dismiss active toasts.
- `[toastStore.ts:mostrarToastConDeshacer]` — Manages module-scoped timer `timeoutId` via `clearTimeout` and `setTimeout` to auto-dismiss undoable toasts.
- `[toastStore.ts:cerrarToast]` — Clears module-scoped timer `timeoutId`.
- `[toastStore.ts:ejecutarAccion]` — Clears module-scoped timer `timeoutId`, invokes `accion.onEjecutar()`, and logs failures via `console.error`.

## Verification

- Run: `npm run build && npm run lint`
