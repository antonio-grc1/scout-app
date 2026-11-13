# Perfil Page (`frontend/src/pages/perfil`)

## Overview
Personal profile and security page (`PerfilPage.tsx`) allowing authenticated members to inspect their identity, primary branch/unit assignment, and family group, update their contact information (`emailContacto`, `telefonoContacto`, and `datosFijosJson`), and change their account password.

## Interface
- `[PerfilPage.tsx:PerfilPage]` — Exported `React.FC` component rendering the member's profile, family group summary, contact form, and password change form.

## Invariants
- `[PerfilPage.tsx:handleCambiarClave]` — Enforces `formClave.passwordNueva === formClave.confirmar` before submitting a password change.
- `[PerfilPage.tsx:handleCambiarClave]` — Enforces `formClave.passwordNueva.length >= 8` (also enforced via `required` and `minLength={8}` on `#perfil-clave-nueva` and `#perfil-clave-confirmar` inputs).
- `[PerfilPage.tsx:handleGuardarContacto]` — Trims all contact fields, sends `null` for empty `emailContacto`/`telefonoContacto`, and mirrors `telefonoContacto` into `datosFijosJson.protagonista_telefono`.
- `[PerfilPage.tsx:asigPrincipal]` — Resolves primary assignment as the first assignment with `a.activo === true`, falling back to `perfil?.asignaciones?.[0]`.
- `[PerfilPage.tsx:hermanos]` — Excludes the current profile member (`h.id !== perfil?.id`) from `perfil?.grupoFamiliar?.miembros`.

## Side Effects
- `[PerfilPage.tsx:cargarPerfil]` — Calls `api.get('/miembros/mi-perfil')` on mount via `[PerfilPage.tsx:useEffect]` and populates `perfil` and `formContacto` state.
- `[PerfilPage.tsx:handleGuardarContacto]` — Calls `api.patch('/miembros/mi-perfil', { emailContacto, telefonoContacto, datosFijosJson })` and updates `perfil` state.
- `[PerfilPage.tsx:handleCambiarClave]` — Calls `api.post('/auth/cambiar-clave', { claveActual, claveNueva })` and updates the auth store session via `useAuthStore().setSesion(res.data)` when `res.data?.accessToken` is returned.

## Verification
- Run: `npm run build && npm run lint`
