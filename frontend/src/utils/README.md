# Shared Utilities (`frontend/src/utils`)

## Overview

Provides client-side spreadsheet export utilities (`exportadorPlanillas.ts`) for converting typed tabular data and optional top/bottom summary rows into downloadable UTF-8 CSV (semicolon-delimited with BOM) and Excel (`.xlsx` via on-demand `xlsx` import) files.

## Interface

- `[exportadorPlanillas.ts:ColumnaExportacion]` — Generic interface for column configuration (`header`, optional `clave`, optional `ancho`, optional `formatear` callback).
- `[exportadorPlanillas.ts:FilaResumen]` — Interface for summary rows (`etiqueta: string`, `valor: string | number`).
- `[exportadorPlanillas.ts:OpcionesExportacion]` — Generic configuration interface for exports (`nombreArchivo`, optional `nombreHoja`, `columnas`, `filas`, optional `resumenSuperior`, optional `resumenInferior`).
- `[exportadorPlanillas.ts:exportarACSV]` — Synchronously builds and downloads a semicolon-delimited, UTF-8 with BOM `.csv` file from `OpcionesExportacion<T>`.
- `[exportadorPlanillas.ts:exportarAExcel]` — Asynchronously loads `xlsx` and builds/downloads a `.xlsx` workbook from `OpcionesExportacion<T>`.

## Invariants

- `[exportadorPlanillas.ts:escaparValorCSV]` — `null` and `undefined` serialize to `''`; values containing `;`, `"`, `\n`, or `\r` are enclosed in double quotes with inner quotes escaped as `""`.
- `[exportadorPlanillas.ts:obtenerValorCelda]` — `col.formatear(fila)` takes precedence over property lookup via `col.clave`; `null`, `undefined`, or columns with neither `formatear` nor `clave` return `''`.
- `[exportadorPlanillas.ts:exportarACSV]` — Output is always prefixed with UTF-8 BOM (`\uFEFF`), separates columns with `;`, separates lines with `\r\n`, and appends `.csv` to `opciones.nombreArchivo`.
- `[exportadorPlanillas.ts:exportarAExcel]` — Worksheet name defaults to `'Datos'` and is truncated to at most 31 characters (`substring(0, 31)`); column width `wch` defaults to `Math.max(col.header.length + 4, 12)` when `col.ancho` is omitted; appends `.xlsx` to `opciones.nombreArchivo`.

## Side Effects

- `[exportadorPlanillas.ts:descargarBlob]` — Creates a Blob URL via `URL.createObjectURL`, mutates `document.body` by appending and removing a temporary `<a>` element, triggers a browser download via `enlace.click()`, and revokes the URL via `URL.revokeObjectURL` (invoked by `[exportadorPlanillas.ts:exportarACSV]`).
- `[exportadorPlanillas.ts:exportarAExcel]` — Performs a dynamic `import('xlsx')` chunk load and triggers a browser file download via `XLSX.writeFile`.

## Verification

- Run: `npm run build && npm run lint`
