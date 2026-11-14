# UI Primitives (`ui`)

## Overview
Provides reusable design-system primitives (`Button`, `BrandLogo`, `Badge`, `Input`, `Select`, `Textarea`, `BotonExportar`, `Drawer`, `ConfirmImpactDialog`, `KpiCard`, `SegmentedTabs`, `ToastGlobal`) styled with semantic design tokens and zero glow effects on interactive buttons.

## Interface
- `[index.ts:Button]` — Re-exports `Button` and `ButtonProps` from `./Button`.
- `[index.ts:BrandLogo]` — Re-exports `BrandLogo` and `BrandLogoProps` from `./BrandLogo`.
- `[index.ts:Badge]` — Re-exports `Badge` and `BadgeProps` from `./Badge`.
- `[index.ts:Input]` — Re-exports `Input`, `Select`, `Textarea`, `InputProps`, `SelectProps`, and `TextareaProps` from `./Input`.
- `[index.ts:BotonExportar]` — Re-exports `BotonExportar` and `BotonExportarProps` from `./BotonExportar`.
- `[index.ts:Drawer]` — Re-exports `Drawer` and `DrawerProps` from `./Drawer` (slide-over desktop / bottom sheet mobile connected to `useModalOverlay`).
- `[index.ts:ConfirmImpactDialog]` — Re-exports `ConfirmImpactDialog` and `ConfirmImpactDialogProps` from `./ConfirmImpactDialog`.
- `[index.ts:KpiCard]` — Re-exports `KpiCard` and `KpiCardProps` from `./KpiCard`.
- `[index.ts:SegmentedTabs]` — Re-exports `SegmentedTabs`, `SegmentedTabsProps`, and `SegmentedTabItem` from `./SegmentedTabs`.
- `[ToastGlobal.tsx:ToastGlobal]` — Renders global toast notifications with countdown progress bar and optional undo/action button (`7500ms` default for actions).

## Invariants
- `[Button.tsx:Button]` — Defaults `type` to `'button'`; disables while `disabled || loading`; zero box-shadow glow styles across `Claro`, `Oscuro`, and `AAA`.
- `[Drawer.tsx:Drawer]` — Registers with `useModalOverlay` so `Escape` and browser back dismiss cleanly without breaking body scroll lock counts.
- `[ToastGlobal.tsx:ToastGlobal]` — Renders `null` when `toast` is `null`; progress bar interpolates smoothly down to `0%`.

## Verification
- Run: `npm run build && npm run lint`
