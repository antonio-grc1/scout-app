# services

## Overview

Frontend domain services responsible for client-side vector PDF generation (`pdf-lib` and `qrcode`) for official member legajo forms and blank templates (`officialPdfBuilder.ts`, `pdfGenerator.ts`, `pdfAssets.ts`), as well as HTTP API queries for organizational unit history (`organizacion.service.ts`).

## Interface

- `[officialPdfBuilder.ts:OfficialPdfBuilderOptions]` — `interface { blank?: boolean; hashVerificacion?: string; versionImpresion?: number; usuario?: { nombre: string; apellido: string; dni: string; fechaNacimiento?: string | Date; ramaNombre?: string; telefonoContacto?: string } }`.
- `[officialPdfBuilder.ts:buildOfficialPdf]` — `(rawRespuestas?: Record<string, unknown>, options?: OfficialPdfBuilderOptions) => Promise<Uint8Array>` constructs the multi-page official legajo PDF using `pdf-lib` and `qrcode`.
- `[officialPdfBuilder.ts:generarMoldeEnBlancoPdf]` — `() => Promise<Uint8Array>` generates a blank 7-page official template PDF (`blank: true`, `hashVerificacion: 'MOLDE-OFICIAL-BLANCO-2026'`).
- `[organizacion.service.ts:PersonaHistorialUnidad]` — `interface { id: number; nombre: string; apellido: string; dni: string; activo: boolean }`.
- `[organizacion.service.ts:RolHistorialUnidad]` — `interface { id: number; nombre: string; tipoMiembro?: string; alcancePorDefecto?: string }`.
- `[organizacion.service.ts:AsignacionHistorialUnidad]` — `interface { id: number; cicloAnio: number; fechaInicio: string; fechaFin?: string | null; activo: boolean; alcanceOverride?: string | null; miembro?: PersonaHistorialUnidad; usuario?: PersonaHistorialUnidad; rol: RolHistorialUnidad }`.
- `[organizacion.service.ts:RamaHistorialUnidad]` — `interface { id: number; nombre: string; edadMinima?: number; edadMaxima?: number; ordenProgresion?: number; activa?: boolean }`.
- `[organizacion.service.ts:ResumenHistorialUnidad]` — `interface { totalAsignaciones: number; totalEducadoresUnicos?: number; totalEducadores?: number; totalProtagonistasUnicos?: number; totalProtagonistas?: number; totalMiembros?: number; ciclosOperativos?: number[]; ciclos?: number[]; totalCiclos?: number }`.
- `[organizacion.service.ts:HistorialUnidadResponse]` — `interface { id: number; nombre: string; tipo: string; activa: boolean; ramaId: number | null; rama?: RamaHistorialUnidad | null; resumen?: ResumenHistorialUnidad; asignaciones: AsignacionHistorialUnidad[] }`.
- `[organizacion.service.ts:obtenerHistorialUnidad]` — `(id: number) => Promise<HistorialUnidadResponse>` fetches historical assignments for an organizational unit via `GET /organizacion/unidades/${id}/historial`.
- `[pdfAssets.ts:PDF_ASSETS]` — Exported constant object containing base64 PNG data URIs (`logoScoutsColor`, `logoJuanXXIII`, `logoScoutsSalud`, `logoScoutsFooterPurple`, `logoScoutsHeaderAuth`, `logoJuanXXIIIAlt`).
- `[pdfGenerator.ts:buildOfficialPdf]` — Re-exported from `./officialPdfBuilder`.
- `[pdfGenerator.ts:generarMoldeEnBlancoPdf]` — Re-exported from `./officialPdfBuilder`.
- `[pdfGenerator.ts:CoordenadaCampo]` — `interface { page?: number; x: number; y: number; size?: number; type?: 'text' | 'checkbox_x'; trueCoords?: { page?: number; x: number; y: number }; falseCoords?: { page?: number; x: number; y: number } }`.
- `[pdfGenerator.ts:MapeoPdf]` — `interface { pdfBaseUrl: string; campos: Record<string, CoordenadaCampo>; qrVerificacion?: { page?: number; x: number; y: number; width?: number } }`.
- `[pdfGenerator.ts:prepararRespuestasParaImpresion]` — `(rawResp: Record<string, unknown>, usuario?: { nombre: string; apellido: string; dni: string; fechaNacimiento?: string | Date; ramaNombre?: string; telefonoContacto?: string }) => Record<string, unknown>` normalizes and enriches legajo answers for PDF rendering.
- `[pdfGenerator.ts:generarFichaPdf]` — `(_mapeo: MapeoPdf, respuestas: Record<string, unknown>, hashVerificacion: string, usuario?: { nombre: string; apellido: string; dni: string; fechaNacimiento?: string | Date; ramaNombre?: string; telefonoContacto?: string }, versionImpresion?: number) => Promise<Uint8Array>` prepares answers and invokes `buildOfficialPdf`.
- `[pdfGenerator.ts:crearUrlPdfBlob]` — `(bytes: Uint8Array) => string` creates an `application/pdf` Blob object URL.
- `[pdfGenerator.ts:abrirPdfEnPestana]` — `(bytes: Uint8Array) => void` opens a generated PDF Blob URL in a new browser tab.
- `[pdfGenerator.ts:descargarPdfBlob]` — `(bytes: Uint8Array, nombreArchivo: string) => void` triggers a browser file download for a PDF byte array.

## Invariants

- `[officialPdfBuilder.ts:buildOfficialPdf]` — QR verification hash defaults to `options.hashVerificacion || rawRespuestas.hashVerificacion || 'LEGAJO-OFICIAL-2026-VERIFICADO'`, and every page footer renders the first 16 uppercase characters of `qrHash` (or `'BORRADOR'`) with `'Grupo Scout Juan XXIII • Ciclo 2026 • DNI ${dniProtagonista} • Código: ${shortHash} • Hoja ${i + 1} de ${totalPaginas}'`.
- `[officialPdfBuilder.ts:buildOfficialPdf]` — Pages 1–4 (Inscripción, Declaración Jurada de Salud, Autorización de Ingreso, Salidas Cercanas) are always generated; Page 5 (Necesidades Especiales) is conditionally included via `shouldIncludePage5` (`ne_*`, `tiene_cud`, `condicion_salud_preexistente`, or `options.blank`); Page 6 (Retiro de Menores) is conditionally included via `shouldIncludePage6` (`ret_persona1..3_nombre`, `ret_autoriza_retirarse_solo`, or `options.blank`); Page 7 (Ficha de Adultos) is conditionally included via `shouldIncludePage7` (`completar_ficha_adultos`, any `colab_*`/`mat_*` key, or `options.blank`).
- `[officialPdfBuilder.ts:buildOfficialPdf]` — Address and phone fallback cascades populate `protagonista_domicilio`/`domicilio`/`salud_domicilio` and `protagonista_telefono`/`telefono_contacto`/`tel_emergencia_1`; `madre_domicilio`, `padre_domicilio`, and `tutor_domicilio` inherit `domProtagonista` only when their respective `*_convive === true` and `*_nombres` is present.
- `[officialPdfBuilder.ts:buildOfficialPdf]` — Autorizante prefill defaults `autorizante_tipo` to `'madre'` and populates `autorizante_nombre`, `autorizante_dni`, `autorizante_telefono`, `autorizante_domicilio`, and `autorizante_caracter` (`'Madre'`, `'Padre'`, or `'Tutor judicial'`) from the selected parent/tutor fields.
- `[officialPdfBuilder.ts:generarMoldeEnBlancoPdf]` — Always passes `blank: true` and `hashVerificacion: 'MOLDE-OFICIAL-BLANCO-2026'`, forcing all 7 pages to be rendered.
- `[pdfGenerator.ts:prepararRespuestasParaImpresion]` — Hardcodes institutional constants into the normalized response map: `salud_zona = '22'`, `salud_distrito = '1'`, `salud_grupo = '196'`, `ingreso_localidad = 'Córdoba'`, `salidas_localidad = 'Córdoba'`, `ingreso_departamento = 'Capital'`, `salidas_departamento = 'Capital'`, `ingreso_provincia = 'Córdoba'`, `salidas_provincia = 'Córdoba'`, `salidas_ciclo_anio = '2026'`, and `ret_provincia_ciudad = 'Córdoba, Capital'`.
- `[pdfGenerator.ts:prepararRespuestasParaImpresion]` — Prefills adult collaboration personal fields (`adulto_nombre`, `adulto_telefono`, `adulto_direccion`) from autorizante data only when `resp.completar_ficha_adultos` is truthy.

## Side Effects

- `[organizacion.service.ts:obtenerHistorialUnidad]` — Performs an HTTP `GET` request via `api.get` to `/organizacion/unidades/${id}/historial`.
- `[pdfGenerator.ts:crearUrlPdfBlob]` — Allocates an in-memory browser Blob URL via `URL.createObjectURL`.
- `[pdfGenerator.ts:abrirPdfEnPestana]` — Allocates a Blob URL and opens a new browser tab via `window.open(url, '_blank', 'noopener,noreferrer')`.
- `[pdfGenerator.ts:descargarPdfBlob]` — Allocates a Blob URL, creates and appends an `<a>` element to `document.body`, invokes `a.click()` to download the PDF, removes the `<a>` element from `document.body`, and revokes the Blob URL via `URL.revokeObjectURL`.

## Verification

- Run: `npm run build && npm run lint`
