-- CreateEnum
CREATE TYPE "EstadoCampamento" AS ENUM ('BORRADOR', 'PUBLICADO', 'CERRADO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoInscripcionCampamento" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'NO_ASISTE', 'CANCELADO');

-- CreateTable
CREATE TABLE "campamentos" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "lugar" VARCHAR(200) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "fecha_limite_confirmacion" TIMESTAMP(3),
    "estado" "EstadoCampamento" NOT NULL DEFAULT 'PUBLICADO',
    "destinatario_tipo" "DestinatarioAvisoTipo" NOT NULL DEFAULT 'PROTAGONISTAS',
    "unidad_id" INTEGER,
    "ciclo_anio" INTEGER NOT NULL,
    "costo_base" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "permite_descuento_hermanos" BOOLEAN NOT NULL DEFAULT true,
    "porcentaje_descuento_hermanos" DECIMAL(5,2),
    "rubro_id" INTEGER,
    "concepto_cuota_id" INTEGER,
    "creado_por_usuario_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campamento_inscripciones" (
    "id" SERIAL NOT NULL,
    "campamento_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "estado" "EstadoInscripcionCampamento" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" VARCHAR(500),
    "confirmado_at" TIMESTAMP(3),
    "confirmado_por_usuario_id" INTEGER,
    "cargo_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campamento_inscripciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campamentos_concepto_cuota_id_key" ON "campamentos"("concepto_cuota_id");

-- CreateIndex
CREATE INDEX "campamentos_estado_fecha_inicio_idx" ON "campamentos"("estado", "fecha_inicio");

-- CreateIndex
CREATE INDEX "campamentos_unidad_id_ciclo_anio_idx" ON "campamentos"("unidad_id", "ciclo_anio");

-- CreateIndex
CREATE UNIQUE INDEX "campamento_inscripciones_cargo_id_key" ON "campamento_inscripciones"("cargo_id");

-- CreateIndex
CREATE UNIQUE INDEX "campamento_inscripciones_campamento_id_usuario_id_key" ON "campamento_inscripciones"("campamento_id", "usuario_id");

-- CreateIndex
CREATE INDEX "campamento_inscripciones_usuario_id_estado_idx" ON "campamento_inscripciones"("usuario_id", "estado");

-- CreateIndex
CREATE INDEX "campamento_inscripciones_campamento_id_estado_idx" ON "campamento_inscripciones"("campamento_id", "estado");

-- AddForeignKey
ALTER TABLE "campamentos" ADD CONSTRAINT "campamentos_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamentos" ADD CONSTRAINT "campamentos_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamentos" ADD CONSTRAINT "campamentos_concepto_cuota_id_fkey" FOREIGN KEY ("concepto_cuota_id") REFERENCES "conceptos_cuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamentos" ADD CONSTRAINT "campamentos_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamento_inscripciones" ADD CONSTRAINT "campamento_inscripciones_campamento_id_fkey" FOREIGN KEY ("campamento_id") REFERENCES "campamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamento_inscripciones" ADD CONSTRAINT "campamento_inscripciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamento_inscripciones" ADD CONSTRAINT "campamento_inscripciones_confirmado_por_usuario_id_fkey" FOREIGN KEY ("confirmado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamento_inscripciones" ADD CONSTRAINT "campamento_inscripciones_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos_miembro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Habilitar Row Level Security
ALTER TABLE "campamentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campamento_inscripciones" ENABLE ROW LEVEL SECURITY;

-- Catálogo de permisos para campamentos
INSERT INTO "permisos" ("clave", "descripcion") VALUES
  ('campamentos.ver', 'Campamentos: Ver invitaciones propias, confirmar asistencia y consultar listado de su alcance'),
  ('campamentos.editar', 'Campamentos: Crear, editar, eliminar campamentos y gestionar asistencias')
ON CONFLICT ("clave") DO UPDATE SET "descripcion" = EXCLUDED."descripcion";

-- Backfill: todos los roles existentes reciben campamentos.ver con su alcance por defecto
INSERT INTO "rol_permisos" ("rol_id", "permiso_id", "alcance")
SELECT r."id", p."id", r."alcance_por_defecto"
FROM "roles" r
JOIN "permisos" p ON p."clave" = 'campamentos.ver'
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;

-- Backfill: roles no-PROPIO con algún permiso de gestión reciben campamentos.editar con su alcance por defecto
INSERT INTO "rol_permisos" ("rol_id", "permiso_id", "alcance")
SELECT DISTINCT r."id", p_camp."id", r."alcance_por_defecto"
FROM "roles" r
JOIN "permisos" p_camp ON p_camp."clave" = 'campamentos.editar'
WHERE r."alcance_por_defecto" <> 'PROPIO'
  AND EXISTS (
    SELECT 1
    FROM "rol_permisos" rp
    JOIN "permisos" p ON p."id" = rp."permiso_id"
    WHERE rp."rol_id" = r."id"
      AND p."clave" IN (
        'padron.editar',
        'pases.editar',
        'cobranzas.editar',
        'planes.editar',
        'caja.editar',
        'eventos.editar',
        'organizacion.editar',
        'roles.editar'
      )
  )
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;
