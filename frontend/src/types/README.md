# Shared Types (`frontend/src/types`)

## Overview

Provides shared TypeScript interface definitions for member role/unit assignment histories (`miembro.ts`) and ambient module declarations for the PDF.js worker bundle (`pdfjs-worker.d.ts`).

## Interface

- `[miembro.ts:RamaDetalle]` — `interface { id: number; nombre: string; ordenProgresion?: number; edadMinima?: number; edadMaxima?: number; activa?: boolean }`
- `[miembro.ts:UnidadDetalle]` — `interface { id: number; nombre: string; tipo: 'SECCION_RAMA' | 'JEFATURA' | 'SIN_RAMA_APOYO' | string; activa?: boolean; ramaId?: number | null; rama?: RamaDetalle | null }`
- `[miembro.ts:RolDetalle]` — `interface { id: number; nombre: string; alcancePorDefecto?: string; tipoMiembro?: 'PROTAGONISTA' | 'EDUCADOR' | 'COLABORADOR' | string; requiereRama?: boolean; activo?: boolean }`
- `[miembro.ts:AsignacionHistorial]` — `interface { id: number; unidadId: number; rolId: number; cicloAnio: number; fechaInicio: string; fechaFin?: string | null; activo: boolean; alcanceOverride?: string | null; unidad: UnidadDetalle; rol: RolDetalle }`
- `[pdfjs-worker.d.ts:'pdfjs-dist/build/pdf.worker.min.mjs']` — Ambient module declaration exporting `content: any`.

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `npm run build && npm run lint`
