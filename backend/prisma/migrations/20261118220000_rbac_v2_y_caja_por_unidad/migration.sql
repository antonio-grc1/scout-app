-- AlterTable: roles (activo y tipo_unidad para clasificar SECCION_RAMA / JEFATURA / SIN_RAMA_APOYO)
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "tipo_unidad" "TipoUnidad" NOT NULL DEFAULT 'SECCION_RAMA';

-- Backfill idempotente de tipo_unidad y es_sistema en roles existentes
UPDATE "roles"
SET "tipo_unidad" = CASE
  WHEN "requiere_rama" = true THEN 'SECCION_RAMA'::"TipoUnidad"
  WHEN LOWER("nombre") LIKE '%jefe%'
    OR LOWER("nombre") LIKE '%jefatura%'
    OR LOWER("nombre") LIKE '%tesorer%'
    OR LOWER("nombre") LIKE '%secretar%'
    OR LOWER("nombre") LIKE '%evento%' THEN 'JEFATURA'::"TipoUnidad"
  ELSE 'SIN_RAMA_APOYO'::"TipoUnidad"
END;

UPDATE "roles"
SET "es_sistema" = true
WHERE "nombre" IN ('Jefe de Grupo', 'Educador de Rama', 'Protagonista');

-- AlterTable: eliminar alcance_override de asignaciones_miembro y solicitudes_pase
ALTER TABLE "asignaciones_miembro" DROP COLUMN IF EXISTS "alcance_override";
ALTER TABLE "solicitudes_pase" DROP COLUMN IF EXISTS "alcance_override";

-- AlterTable: agregar unidad_id opcional a cuentas_financieras (caja por rama)
ALTER TABLE "cuentas_financieras" ADD COLUMN IF NOT EXISTS "unidad_id" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "cuentas_financieras_unidad_id_idx" ON "cuentas_financieras"("unidad_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cuentas_financieras_unidad_id_fkey'
  ) THEN
    ALTER TABLE "cuentas_financieras"
      ADD CONSTRAINT "cuentas_financieras_unidad_id_fkey"
      FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- A5: Insertar panel independiente de Roles y Permisos (roles.ver / roles.editar)
INSERT INTO "permisos" ("clave", "descripcion") VALUES
  ('roles.ver', 'Roles y Permisos: Solo lectura de roles y catálogo de permisos'),
  ('roles.editar', 'Roles y Permisos: Crear, modificar, archivar y reactivar roles y sus permisos')
ON CONFLICT ("clave") DO UPDATE SET "descripcion" = EXCLUDED."descripcion";

-- Backfill roles.ver desde organizacion.ver
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT DISTINCT rp."rol_id", p_roles."id"
FROM "rol_permisos" rp
JOIN "permisos" p_org ON p_org."id" = rp."permiso_id" AND p_org."clave" = 'organizacion.ver'
CROSS JOIN "permisos" p_roles
WHERE p_roles."clave" = 'roles.ver'
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;

-- Backfill roles.editar para Jefe de Grupo (y roles administradores distintos de Secretaría / Legajos)
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT DISTINCT r."id", p_roles_ed."id"
FROM "roles" r
JOIN "rol_permisos" rp ON rp."rol_id" = r."id"
JOIN "permisos" p_org_ed ON p_org_ed."id" = rp."permiso_id" AND p_org_ed."clave" = 'organizacion.editar'
CROSS JOIN "permisos" p_roles_ed
WHERE p_roles_ed."clave" = 'roles.editar'
  AND r."nombre" <> 'Secretaría / Legajos'
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;

-- A2: Habilitar caja.ver y caja.editar en Educador de Rama para operar Caja/Gastos/Rubros de su rama
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r."nombre" = 'Educador de Rama'
  AND p."clave" IN ('caja.ver', 'caja.editar')
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;

-- A5: Quitar padron.editar de Tesorero
DELETE FROM "rol_permisos" rp
USING "roles" r, "permisos" p
WHERE rp."rol_id" = r."id"
  AND rp."permiso_id" = p."id"
  AND r."nombre" = 'Tesorero'
  AND p."clave" = 'padron.editar';
