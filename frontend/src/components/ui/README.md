# UI Primitives (`ui`)

## Overview
Provides reusable design-system primitives (buttons, inputs, selects, textareas, badges, brand logo, export dropdown, and the global toast banner) styled with Tailwind CSS and integrated with application theme tokens and the global toast store.

## Interface
- `[index.ts:Button]` — Re-exports `Button` and `ButtonProps` from `./Button`.
- `[index.ts:BrandLogo]` — Re-exports `BrandLogo` and `BrandLogoProps` from `./BrandLogo`.
- `[index.ts:Badge]` — Re-exports `Badge` and `BadgeProps` from `./Badge`.
- `[index.ts:Input]` — Re-exports `Input`, `Select`, `Textarea`, `InputProps`, `SelectProps`, and `TextareaProps` from `./Input`.
- `[index.ts:BotonExportar]` — Re-exports `BotonExportar` and `BotonExportarProps` from `./BotonExportar`.
- `[Badge.tsx:BadgeProps]` — Exported interface extending `React.HTMLAttributes<HTMLSpanElement>` with `variant` (`'brand' | 'success' | 'warning' | 'danger' | 'neutral'`), `size` (`'sm' | 'md'`), `dot`, `pill`, `icon`, `onRemove`, and `removeLabel`.
- `[Badge.tsx:Badge]` — Exported `React.FC<BadgeProps>` rendering a styled badge with optional status dot, icon, and remove button.
- `[BotonExportar.tsx:BotonExportarProps]` — Exported interface with `onExportarExcel`, `onExportarCSV`, `texto`, `tituloTooltip`, `disabled`, `className`, and `size` (`'sm' | 'md'`).
- `[BotonExportar.tsx:BotonExportar]` — Exported `React.FC<BotonExportarProps>` rendering a dropdown trigger and menu for Excel (`.xlsx`) and CSV (`.csv`) exports.
- `[BrandLogo.tsx:BrandLogoProps]` — Exported interface extending `React.HTMLAttributes<HTMLDivElement>` with `variant` (`'icon' | 'full' | 'text' | 'transparent'`), `size` (`'sm' | 'md' | 'lg'`), `showSubtitle`, `subtitleText`, `center`, `scaleOverride`, and `alt`.
- `[BrandLogo.tsx:BrandLogo]` — Exported `React.FC<BrandLogoProps>` rendering the group logo image (with light/dark variants and inline SVG fallback) and optional title/subtitle text.
- `[Button.tsx:ButtonProps]` — Exported interface extending `React.ButtonHTMLAttributes<HTMLButtonElement>` with `variant` (`'primary' | 'secondary' | 'danger' | 'ghost' | 'pill'`), `size` (`'sm' | 'md' | 'lg'`), `loading`, `loadingText`, `asChild`, `leftIcon`, and `rightIcon`.
- `[Button.tsx:Button]` — Exported `React.forwardRef<HTMLButtonElement, ButtonProps>` rendering a button or polymorphic child element when `asChild` is `true`.
- `[Input.tsx:InputProps]` — Exported interface extending `React.InputHTMLAttributes<HTMLInputElement>` with `label`, `error`, `helperText`, `leftIcon`, `rightAction`, and `containerClassName`.
- `[Input.tsx:Input]` — Exported `React.forwardRef<HTMLInputElement, InputProps>` rendering a labeled input field with icon/action slots and accessible error/helper descriptions.
- `[Input.tsx:SelectProps]` — Exported interface extending `React.SelectHTMLAttributes<HTMLSelectElement>` with `label`, `error`, `helperText`, `leftIcon`, and `containerClassName`.
- `[Input.tsx:Select]` — Exported `React.forwardRef<HTMLSelectElement, SelectProps>` rendering a labeled select dropdown with optional `leftIcon` and error/helper messages.
- `[Input.tsx:TextareaProps]` — Exported interface extending `React.TextareaHTMLAttributes<HTMLTextAreaElement>` with `label`, `error`, `helperText`, and `containerClassName`.
- `[Input.tsx:Textarea]` — Exported `React.forwardRef<HTMLTextAreaElement, TextareaProps>` rendering a labeled textarea with error/helper messages.
- `[ToastGlobal.tsx:ToastGlobal]` — Exported `React.FC` rendering the global toast notification banner with countdown progress bar and optional undo/action button.

## Invariants
- `[Badge.tsx:Badge]` — Clicking the remove button invokes `e.stopPropagation()` before calling `onRemove()`.
- `[BotonExportar.tsx:BotonExportar]` — Trigger button is disabled when `disabled` is `true` or `procesando !== null`; `procesando` is always reset to `null` inside a `finally` block.
- `[BrandLogo.tsx:BrandLogo]` — Falls back to an inline SVG scout insignia when `imageFailed` becomes `true` via `img` `onError`; scaling uses `scaleOverride` when defined, otherwise CSS variable `var(--brand-logo-scale, 1)`.
- `[Button.tsx:Button]` — Defaults `type` to `'button'`; `isDisabled` is `true` when `disabled || loading`; when `loading` is `true`, `leftIcon` and `rightIcon` are hidden and replaced by the `Loader2` spinner.
- `[Input.tsx:Input]` — Uses provided `id` or `useId()` fallback to link `label` `htmlFor` and `aria-describedby` (`error` takes precedence over `helperText`; `helperText` only renders when `!error`).
- `[Input.tsx:Select]` — Uses provided `id` or `useId()` fallback to link `label` `htmlFor` and `aria-describedby` (`error` takes precedence over `helperText`; `helperText` only renders when `!error`).
- `[Input.tsx:Textarea]` — Defaults `rows` to `3`; uses provided `id` or `useId()` fallback to link `label` `htmlFor` and `aria-describedby` (`error` takes precedence over `helperText`; `helperText` only renders when `!error`).
- `[ToastGlobal.tsx:ToastGlobal]` — Renders `null` when `toast` is `null`; progress percentage is clamped to `>= 0` over `duracion` (`toast.duracionMs || 4000`) milliseconds.

## Side Effects
- `[BotonExportar.tsx:useEffect]` — Registers and cleans up `window` `'keydown'` (`Escape`) and `document` `'mousedown'` (outside click) listeners while `menuAbierto` is `true`.
- `[BotonExportar.tsx:handleDescargar]` — Invokes async/sync `onExportarExcel()` or `onExportarCSV()` callbacks.
- `[ToastGlobal.tsx:useEffect]` — Starts and cleans up a `40ms` `setInterval` timer to update the countdown progress bar based on `Date.now()`.
- `[ToastGlobal.tsx:ToastGlobal]` — Reads state and invokes `cerrarToast` and `ejecutarAccion` from `useToastStore`.

## Verification
- Run: `npm run build && npm run lint`
