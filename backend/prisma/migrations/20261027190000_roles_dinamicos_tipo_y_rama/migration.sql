-- AlterTable
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "tipo_miembro" VARCHAR(30) NOT NULL DEFAULT 'EDUCADOR';
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "requiere_rama" BOOLEAN NOT NULL DEFAULT true;

-- Inicializar valores según configuración existente
UPDATE "roles" SET "tipo_miembro" = 'PROTAGONISTA', "requiere_rama" = true WHERE "alcance_por_defecto" = 'PROPIO';
UPDATE "roles" SET "tipo_miembro" = 'EDUCADOR', "requiere_rama" = false WHERE "alcance_por_defecto" = 'GLOBAL';
