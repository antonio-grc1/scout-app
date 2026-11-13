-- CreateEnum
CREATE TYPE "EstadoSolicitudPase" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "solicitudes_pase" (
    "id" SERIAL NOT NULL,
    "asignacion_origen_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "unidad_origen_id" INTEGER NOT NULL,
    "unidad_destino_id" INTEGER NOT NULL,
    "rol_destino_id" INTEGER NOT NULL,
    "alcance_override" "AlcanceRol",
    "modo" VARCHAR(20) NOT NULL DEFAULT 'MOVER',
    "estado" "EstadoSolicitudPase" NOT NULL DEFAULT 'PENDIENTE',
    "solicitado_por_id" INTEGER NOT NULL,
    "resuelto_por_id" INTEGER,
    "motivo_rechazo" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto_at" TIMESTAMP(3),

    CONSTRAINT "solicitudes_pase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitudes_pase_estado_unidad_destino_id_idx" ON "solicitudes_pase"("estado", "unidad_destino_id");

-- CreateIndex
CREATE INDEX "solicitudes_pase_estado_unidad_origen_id_idx" ON "solicitudes_pase"("estado", "unidad_origen_id");

-- CreateIndex
CREATE INDEX "solicitudes_pase_asignacion_origen_id_estado_idx" ON "solicitudes_pase"("asignacion_origen_id", "estado");

-- CreateIndex
CREATE INDEX "solicitudes_pase_usuario_id_estado_idx" ON "solicitudes_pase"("usuario_id", "estado");

-- AddForeignKey
ALTER TABLE "solicitudes_pase" ADD CONSTRAINT "solicitudes_pase_asignacion_origen_id_fkey" FOREIGN KEY ("asignacion_origen_id") REFERENCES "asignaciones_miembro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_pase" ADD CONSTRAINT "solicitudes_pase_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_pase" ADD CONSTRAINT "solicitudes_pase_unidad_origen_id_fkey" FOREIGN KEY ("unidad_origen_id") REFERENCES "unidades_organizativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_pase" ADD CONSTRAINT "solicitudes_pase_unidad_destino_id_fkey" FOREIGN KEY ("unidad_destino_id") REFERENCES "unidades_organizativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_pase" ADD CONSTRAINT "solicitudes_pase_rol_destino_id_fkey" FOREIGN KEY ("rol_destino_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_pase" ADD CONSTRAINT "solicitudes_pase_solicitado_por_id_fkey" FOREIGN KEY ("solicitado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_pase" ADD CONSTRAINT "solicitudes_pase_resuelto_por_id_fkey" FOREIGN KEY ("resuelto_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
