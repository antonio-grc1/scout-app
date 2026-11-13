# lib

## Overview

Shared frontend utility modules providing domain formatting, age/cohort calculation, role and template selection helpers, QR voucher canvas rendering, localStorage offline API response caching, browser runtime polyfills for PDF generation, UI field-level permission hooks, branch (`rama`) color palettes, and Tailwind CSS class merging.

## Interface

- `[formatters.ts:ESTADO_FICHA_CONFIG]` — `Record<string, { label: string; shortLabel: string; badgeClass: string; dotClass: string }>` mapping legajo status codes (`VALIDADO_FISICAMENTE`, `PENDIENTE_FIRMA_FISICA`, `DESACTUALIZADO_REQUIERE_REIMPRESION`, `BORRADOR`, `SIN_FICHA`, `SIN_ENTREGAR`).
- `[formatters.ts:ESTADO_CARGO_CONFIG]` — `Record<string, { label: string; badgeClass: string }>` mapping fee charge statuses (`PAGADO`, `PARCIAL`, `PENDIENTE`, `ANULADO`).
- `[formatters.ts:METODO_PAGO_LABELS]` — `Record<string, string>` mapping payment methods (`EFECTIVO`, `TRANSFERENCIA`, `OTRO`).
- `[formatters.ts:TIPO_UNIDAD_LABELS]` — `Record<string, string>` mapping organizational unit types (`SECCION_RAMA`, `JEFATURA`, `SIN_RAMA_APOYO`).
- `[formatters.ts:NOMBRES_MESES_CORTOS]` — 1-indexed `string[]` of abbreviated Spanish month names.
- `[formatters.ts:NOMBRES_MESES_LARGOS]` — 1-indexed `string[]` of full Spanish month names.
- `[formatters.ts:formatearMoneda]` — `(valor: number | string | null | undefined) => string` currency formatter (`es-AR`).
- `[formatters.ts:ahoraLocalDatetime]` — `() => string` current local timestamp formatted as `YYYY-MM-DDTHH:mm`.
- `[formatters.ts:fechaAFormatoDatetimeLocal]` — `(fechaIso?: string | null) => string` ISO timestamp to `datetime-local` input converter.
- `[formatters.ts:formatearFecha]` — `(fechaIso?: string | null) => string` date formatter (`DD/MM/YYYY`).
- `[formatters.ts:formatearFechaHora]` — `(fechaIso?: string | null) => string` date-time formatter (`DD/MM/YYYY HH:mm`).
- `[formatters.ts:calcularEdad]` — `(fechaNacStr?: string | null) => number | null` chronological age calculator.
- `[formatters.ts:calcularCamada]` — `(fechaNacStr?: string | null) => number | null` school cohort year calculator based on the June 30 cutoff.
- `[formatters.ts:calcularEdadAlCorte30Junio]` — `(fechaNacStr?: string | null, anioCiclo?: number) => number | null` age as of June 30 for a given cycle year.
- `[formatters.ts:normalizarTextoBusqueda]` — `(valor: unknown) => string` accent-insensitive, lowercase search normalizer.
- `[formatters.ts:formatearNombreFamilia]` — `(nombre?: string | null) => string` family display name normalizer.
- `[formatters.ts:traducirErrorAmigable]` — `(err: any, mensajePorDefecto?: string) => string` API/network error message translator.
- `[formatters.ts:OpcionTelefonoContacto]` — `interface { etiqueta: string; nombre?: string; telefono: string }`.
- `[formatters.ts:extraerTelefonosMiembro]` — `(miembro: any, entrega?: any) => OpcionTelefonoContacto[]` extracts and deduplicates member and parent contact phone numbers.
- `[formatters.ts:OpcionGrupoHermanos]` — `interface { key: string; esGrupoExistente: boolean; grupoFamiliarId?: number; nombreFamilia: string; representante: any; integrantes: Array<{ id: number; dni: string; nombre: string; apellido: string; ramaNombre: string }>; madreNombre?: string; padreNombre?: string; tutorNombre?: string; domicilio?: string }`.
- `[formatters.ts:agruparCandidatosPorFamilia]` — `(candidatos: any[], excluirUsuarioId?: number) => OpcionGrupoHermanos[]` groups sibling/family candidates by existing family group or individual record.
- `[formatters.ts:esRolDeEducador]` — `(rol: any) => boolean` checks whether a role represents an educator/adult leader.
- `[formatters.ts:esRolDeProtagonista]` — `(rol: any) => boolean` checks whether a role represents a youth beneficiary (`PROTAGONISTA`).
- `[formatters.ts:rolRequiereRama]` — `(rol: any) => boolean` checks whether a role requires a branch (`SECCION_RAMA`) unit.
- `[formatters.ts:esRolAlcanceGlobal]` — `(rol: any) => boolean` checks whether a role has `GLOBAL` default scope.
- `[formatters.ts:esRolJefe]` — `(rol: any) => boolean` checks whether a role corresponds to a Group Chief (`JEFE_GRUPO` / `SUBJEFE_GRUPO`).
- `[formatters.ts:esRolSinRama]` — `(rol: any) => boolean` checks whether an adult role operates without a branch unit (`SIN_RAMA_APOYO`).
- `[formatters.ts:esRolRama]` — `(rol: any) => boolean` checks whether a role belongs to a branch section.
- `[formatters.ts:obtenerAsignacionesActivas]` — `(miembro: any) => any[]` filters active assignments (`activa !== false && !fechaFin`).
- `[formatters.ts:obtenerRolPrincipal]` — `(miembro: any) => any | null` resolves the primary assignment for a member.
- `[formatters.ts:obtenerRolesSecundarios]` — `(miembro: any) => any[]` returns active assignments excluding the primary role.
- `[formatters.ts:seleccionarPlantillaPorMiembro]` — `(plantillas: any[], miembro: any, asignacionesFallback?: any[]) => any | null` selects the appropriate legajo template (`LEGAJO_EDUCADORES_*`, `LEGAJO_ROVERS_*`, or `LEGAJO_MENORES_*`).
- `[generadorValeQR.ts:generarTarjetaValeQR]` — `(ticket: TicketData) => Promise<string>` renders a printable PNG data URL for an event QR voucher.
- `[offlineCache.ts:generarClaveCache]` — `(url?: string, params?: Record<string, unknown> | null) => string` builds deterministic `localStorage` cache keys.
- `[offlineCache.ts:guardarEnCache]` — `<T = unknown>(url?: string, params?: Record<string, unknown> | null, data?: T) => void` stores API responses and pre-indexes individual member/legajo items.
- `[offlineCache.ts:obtenerDeCache]` — `<T = unknown>(url?: string, params?: Record<string, unknown> | null) => ItemCache<T> | null` retrieves cached responses with fallback reconstruction from cached collections.
- `[offlineCache.ts:contarMiembrosEnCache]` — `() => number` counts cached members from `/miembros` or individual `/miembros/:id` keys.
- `[offlineCache.ts:obtenerUltimoTimestampCache]` — `() => number | null` returns the most recent cache entry timestamp.
- `[offlineCache.ts:limpiarCacheApi]` — `() => void` clears all `scout_cache_v1:` entries from `localStorage`.
- `[pdfPolyfills.ts:Uint8Array.prototype.toHex]` — `() => string` polyfill for legacy mobile WebViews.
- `[pdfPolyfills.ts:Uint8Array.fromBase64]` — `(base64: string) => Uint8Array` polyfill for legacy mobile WebViews.
- `[pdfPolyfills.ts:Promise.withResolvers]` — `<T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: any) => void }` polyfill for PDF.js compatibility.
- `[permisos.ts:usePermisosUI]` — `() => { canEdit: (modulo: string, campo: string) => boolean; canView: (modulo: string) => boolean }` hook for checking field-level edit and module-level view permissions.
- `[ramaColors.ts:RamaColorConfig]` — `interface { key: 'lobatos' | 'scout' | 'caminantes' | 'rover' | 'adultos' | 'otro'; nombre: string; colorName: string; badgeClases: string; avatarClases: string; dotColor: string; borderClases: string; bannerClases: string }`.
- `[ramaColors.ts:RAMA_COLORS]` — `Record<string, RamaColorConfig>` color palette definitions keyed by branch.
- `[ramaColors.ts:obtenerConfigRama]` — `(m: any, unidades?: any[]) => RamaColorConfig` resolves the visual color configuration for a member or unit.
- `[ramaColors.ts:obtenerOrdenRama]` — `(m: any, unidades?: any[], ramas?: any[]) => number` returns the numeric sort order for a member's branch/unit.
- `[utils.ts:cn]` — `(...inputs: ClassValue[]) => string` merges Tailwind CSS classes via `clsx` and `tailwind-merge`.

## Invariants

- `[formatters.ts:fechaAFormatoDatetimeLocal]` — Pure date strings or midnight UTC ISO strings matching `/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z?)?$/` are normalized to `12:00` local time (`${parteFecha}T12:00`) to prevent timezone day-shift.
- `[formatters.ts:calcularCamada]` — School cohort cutoff is June 30 inclusive (`getUTCMonth() < 6` returns birth year `Y`; `getUTCMonth() >= 6` returns `Y + 1`).
- `[formatters.ts:calcularEdadAlCorte30Junio]` — Age at the June 30 cutoff for `anioCiclo` equals `anioCiclo - calcularCamada(fechaNacStr)`.
- `[formatters.ts:formatearNombreFamilia]` — Non-empty family names always begin with `'Familia '` (normalizing `'fam. '` prefixes and preventing duplicate `'Familia '` prefixes).
- `[formatters.ts:traducirErrorAmigable]` — Raw technical messages containing `'prisma'`, `'sql'`, `'constraint'`, or `'exception'` are never returned to the caller; `mensajePorDefecto` is returned instead.
- `[formatters.ts:extraerTelefonosMiembro]` — Duplicate `(etiqueta, telefono)` pairs are deduplicated, and `entrega.respuestasSnapshotJson` takes precedence over `miembro.datosFijosJson`.
- `[formatters.ts:agruparCandidatosPorFamilia]` — Candidates sharing a `grupoFamiliar.id` are grouped under a single key `gf-${gf.id}`, and any candidate or family group containing `excluirUsuarioId` is excluded.
- `[formatters.ts:obtenerRolPrincipal]` — Prioritizes active assignments where `unidad.tipo === 'SECCION_RAMA'` or the role is a protagonist role before falling back to the first active assignment, or the first historical assignment if none are active.
- `[formatters.ts:seleccionarPlantillaPorMiembro]` — Selects `LEGAJO_EDUCADORES_*` for educators/`JEFATURA`/`SIN_RAMA_APOYO`, `LEGAJO_ROVERS_*` when branch minimum age `>= 18` or member age `>= 18`, and `LEGAJO_MENORES_*` (or `plantillas[0]`) otherwise.
- `[generadorValeQR.ts:generarTarjetaValeQR]` — Outputs a `600x820` PNG data URL (or raw QR data URL if a 2D canvas context is unavailable) and stamps a diagonal `'CANJEADO / YA RETIRADO'` red banner when `ticket.estado === 'UTILIZADO'`.
- `[offlineCache.ts:generarClaveCache]` — Cache keys are prefixed with `'scout_cache_v1:'` and query parameters are sorted alphabetically by key, omitting `null` and `undefined` values.
- `[offlineCache.ts:purgarCachesAntiguos]` — On `localStorage` quota failure, sorts `'scout_cache_v1:'` entries by `timestamp` ascending and deletes at least `1` and up to `Math.floor(entradas.length / 2)` oldest entries.
- `[permisos.ts:usePermisosUI]` — Evaluates UI edit and view permissions against `PERMISOS_EDICION` and `PERMISOS_LECTURA` maps via `useAuthStore(s => s.tienePermiso)`, subscribing to `s.asignaciones` so role permission updates trigger re-renders.
- `[ramaColors.ts:obtenerOrdenRama]` — Returns `999` when no assignment exists or no progression order, minimum age, or unit name/type pattern matches.

## Side Effects

- `[generadorValeQR.ts:generarTarjetaValeQR]` — Creates offscreen DOM `Image` and `HTMLCanvasElement` (`document.createElement('canvas')`) instances to draw and export the QR voucher PNG.
- `[offlineCache.ts:guardarEnCache]` — Writes primary API responses and pre-indexed secondary entities (`/miembros/:id`, `/legajos/entregas?usuarioId=:id`, `/legajos/plantillas/:id`) to `window.localStorage`, and purges oldest cache entries via `[offlineCache.ts:purgarCachesAntiguos]` if storage quota is exceeded.
- `[offlineCache.ts:obtenerDeCache]` — Reads from `window.localStorage` (including `'scout_cache_v1:*'` keys and session keys `'scout_user'`, `'scout_asignaciones'`, `'scout_token'` during fallback resolution).
- `[offlineCache.ts:contarMiembrosEnCache]` — Reads cached member entries from `window.localStorage`.
- `[offlineCache.ts:obtenerUltimoTimestampCache]` — Iterates and reads `'scout_cache_v1:'` entries from `window.localStorage`.
- `[offlineCache.ts:limpiarCacheApi]` — Removes all keys prefixed with `'scout_cache_v1:'` from `window.localStorage`.
- `[pdfPolyfills.ts:Uint8Array.prototype.toHex]` — Mutates global `Uint8Array.prototype` at module load time if `toHex` is undefined.
- `[pdfPolyfills.ts:Uint8Array.fromBase64]` — Mutates global `Uint8Array` constructor at module load time if `fromBase64` is undefined.
- `[pdfPolyfills.ts:Promise.withResolvers]` — Mutates global `Promise` constructor at module load time if `withResolvers` is undefined.
- `[permisos.ts:usePermisosUI]` — Subscribes to Zustand store `useAuthStore` (`s.tienePermiso` and `s.asignaciones`).

## Verification

- Run: `npm run build && npm run lint`
