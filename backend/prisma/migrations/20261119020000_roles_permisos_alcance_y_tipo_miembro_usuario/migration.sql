-- AlterTable: tipo_miembro en usuarios y alcance por permiso en rol_permisos
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "tipo_miembro" VARCHAR(30) NOT NULL DEFAULT 'PROTAGONISTA';

ALTER TABLE "rol_permisos" ADD COLUMN IF NOT EXISTS "alcance" "AlcanceRol" NOT NULL DEFAULT 'PROPIO';

-- Backfill alcance en rol_permisos desde roles.alcance_por_defecto
UPDATE "rol_permisos" rp
SET "alcance" = r."alcance_por_defecto"
FROM "roles" r
WHERE rp."rol_id" = r."id";

-- Backfill usuarios.tipo_miembro a EDUCADOR para quienes poseen asignaciones activas de educador y ninguna de protagonista
UPDATE "usuarios" u
SET "tipo_miembro" = 'EDUCADOR'
WHERE EXISTS (
  SELECT 1
  FROM "asignaciones_miembro" a
  JOIN "roles" r ON r."id" = a."rol_id"
  WHERE a."usuario_id" = u."id"
    AND a."activo" = true
    AND r."tipo_miembro" = 'EDUCADOR'
)
AND NOT EXISTS (
  SELECT 1
  FROM "asignaciones_miembro" a
  JOIN "roles" r ON r."id" = a."rol_id"
  WHERE a."usuario_id" = u."id"
    AND a."activo" = true
    AND r."tipo_miembro" = 'PROTAGONISTA'
);
