# Backend — Sistema de Gestión Scout (Grupo Scout Juan XXIII)

API REST institucional desarrollada con **NestJS 12**, **Prisma ORM 6 (PostgreSQL)**, **Zod** y **Vitest**.

Para el detalle técnico de módulos e invariantes de arquitectura, ver [src/README.md](src/README.md).

## Requisitos previos

- Node.js 22+
- PostgreSQL 15+ (o usar PostgreSQL embebido local incluido con `npm run db:local`)

## Configuración rápida (entorno local)

```bash
cd backend
npm install
cp .env.example .env
```

Completar en `.env` los secretos obligatorios:
- `DATABASE_URL`: cadena de conexión PostgreSQL
- `JWT_SECRET`: mínimo 32 caracteres
- `QR_HMAC_SECRET`: mínimo 32 caracteres
- `CORS_ORIGIN`: orígenes permitidos separados por coma (ej. `http://localhost:5173`)
- Opcionales de correo/URL: `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Luego inicializar base de datos y datos semilla:

```bash
# Opcional si no tenés Postgres instalado localmente:
npm run db:local

# En otra terminal, aplicar migraciones y seed:
npx prisma migrate deploy
npm run prisma:seed
```

## Ejecución

```bash
# Desarrollo (watch)
npm run start:dev

# Compilar
npm run build

# Producción
npm run start:prod
```

## Tests y calidad

```bash
# Tests unitarios y de regresión (Vitest)
npm test

# Linter con chequeo de tipos (oxlint)
npm run lint

# Tests E2E
npm run test:e2e
```
