-- CreateEnum
CREATE TYPE "PrioridadAviso" AS ENUM ('NORMAL', 'IMPORTANTE', 'URGENTE');

-- CreateEnum
CREATE TYPE "DestinatarioAvisoTipo" AS ENUM ('TODOS', 'PROTAGONISTAS', 'EDUCADORES', 'USUARIOS');

-- CreateTable
CREATE TABLE "avisos" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "prioridad" "PrioridadAviso" NOT NULL DEFAULT 'NORMAL',
    "destinatario_tipo" "DestinatarioAvisoTipo" NOT NULL DEFAULT 'TODOS',
    "unidad_id" INTEGER,
    "creado_por_usuario_id" INTEGER NOT NULL,
    "fecha_expiracion" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aviso_destinatarios" (
    "aviso_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "leido_at" TIMESTAMP(3),

    CONSTRAINT "aviso_destinatarios_pkey" PRIMARY KEY ("aviso_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "avisos_unidad_id_created_at_idx" ON "avisos"("unidad_id", "created_at");

-- CreateIndex
CREATE INDEX "avisos_creado_por_usuario_id_created_at_idx" ON "avisos"("creado_por_usuario_id", "created_at");

-- CreateIndex
CREATE INDEX "avisos_created_at_idx" ON "avisos"("created_at");

-- CreateIndex
CREATE INDEX "aviso_destinatarios_usuario_id_leido_at_idx" ON "aviso_destinatarios"("usuario_id", "leido_at");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_destinatarios" ADD CONSTRAINT "aviso_destinatarios_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "avisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_destinatarios" ADD CONSTRAINT "aviso_destinatarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Habilitar Row Level Security (consistente con 20261125210000_habilitar_rls)
ALTER TABLE "avisos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aviso_destinatarios" ENABLE ROW LEVEL SECURITY;

-- Catálogo de permisos para avisos
INSERT INTO "permisos" ("clave", "descripcion") VALUES
  ('avisos.ver', 'Avisos y Comunicados: Leer avisos recibidos y consultar historial enviado de su alcance'),
  ('avisos.editar', 'Avisos y Comunicados: Redactar, enviar y eliminar avisos para su sección o todo el grupo')
ON CONFLICT ("clave") DO UPDATE SET "descripcion" = EXCLUDED."descripcion";

-- Backfill: todos los roles existentes reciben avisos.ver con su alcance por defecto
INSERT INTO "rol_permisos" ("rol_id", "permiso_id", "alcance")
SELECT r."id", p."id", r."alcance_por_defecto"
FROM "roles" r
JOIN "permisos" p ON p."clave" = 'avisos.ver'
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;

-- Backfill: roles no-PROPIO con algún permiso de gestión reciben avisos.editar con su alcance por defecto
INSERT INTO "rol_permisos" ("rol_id", "permiso_id", "alcance")
SELECT DISTINCT r."id", p_aviso."id", r."alcance_por_defecto"
FROM "roles" r
JOIN "permisos" p_aviso ON p_aviso."clave" = 'avisos.editar'
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
