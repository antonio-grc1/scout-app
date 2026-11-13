-- DropIndex
DROP INDEX IF EXISTS "usuarios_dni_idx";

-- DropForeignKey
ALTER TABLE "movimientos_financieros" DROP CONSTRAINT IF EXISTS "movimientos_financieros_pago_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_financieros" DROP CONSTRAINT IF EXISTS "movimientos_financieros_gasto_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_financieros" DROP CONSTRAINT IF EXISTS "movimientos_financieros_pedido_evento_id_fkey";

-- DropForeignKey
ALTER TABLE "pedidos_evento" DROP CONSTRAINT IF EXISTS "pedidos_evento_evento_id_fkey";

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "movimientos_financieros" ADD COLUMN "transferencia_grupo_id" UUID;

-- CreateIndex
CREATE INDEX "usuarios_grupo_familiar_id_idx" ON "usuarios"("grupo_familiar_id");

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_formulario_codigo_ciclo_anio_key" ON "plantillas_formulario"("codigo", "ciclo_anio");

-- CreateIndex
CREATE UNIQUE INDEX "entregas_formulario_usuario_id_plantilla_id_ciclo_anio_key" ON "entregas_formulario"("usuario_id", "plantilla_id", "ciclo_anio");

-- CreateIndex
CREATE INDEX "conceptos_cuota_plan_cuota_mensual_id_mes_idx" ON "conceptos_cuota"("plan_cuota_mensual_id", "mes");

-- CreateIndex
CREATE INDEX "conceptos_cuota_ciclo_anio_idx" ON "conceptos_cuota"("ciclo_anio");

-- CreateIndex
CREATE INDEX "conceptos_cuota_unidad_id_idx" ON "conceptos_cuota"("unidad_id");

-- CreateIndex
CREATE INDEX "cargos_miembro_usuario_id_estado_idx" ON "cargos_miembro"("usuario_id", "estado");

-- CreateIndex
CREATE INDEX "cargos_miembro_concepto_id_estado_idx" ON "cargos_miembro"("concepto_id", "estado");

-- CreateIndex
CREATE INDEX "pagos_usuario_id_fecha_pago_idx" ON "pagos"("usuario_id", "fecha_pago");

-- CreateIndex
CREATE INDEX "pagos_fecha_pago_idx" ON "pagos"("fecha_pago");

-- CreateIndex
CREATE UNIQUE INDEX "pago_imputaciones_pago_id_cargo_id_key" ON "pago_imputaciones"("pago_id", "cargo_id");

-- CreateIndex
CREATE INDEX "pago_imputaciones_cargo_id_idx" ON "pago_imputaciones"("cargo_id");

-- CreateIndex
CREATE INDEX "movimientos_financieros_transferencia_grupo_id_idx" ON "movimientos_financieros"("transferencia_grupo_id");

-- CreateIndex
CREATE INDEX "pedidos_evento_evento_id_estado_idx" ON "pedidos_evento"("evento_id", "estado");

-- CreateIndex
CREATE INDEX "pedidos_evento_vendedor_usuario_id_idx" ON "pedidos_evento"("vendedor_usuario_id");

-- CreateIndex
CREATE INDEX "tickets_evento_pedido_id_estado_idx" ON "tickets_evento"("pedido_id", "estado");

-- CreateIndex
CREATE INDEX "tickets_evento_item_id_idx" ON "tickets_evento"("item_id");

-- Partial Unique Indexes (concurrencia e invariantes parciales)
CREATE UNIQUE INDEX "asignaciones_miembro_activas_unicas"
ON "asignaciones_miembro"("usuario_id", "unidad_id", "rol_id")
WHERE "activo" = true;

CREATE UNIQUE INDEX "cargos_miembro_activos_unicos"
ON "cargos_miembro"("usuario_id", "concepto_id")
WHERE "estado" <> 'ANULADO';

-- Check Constraints financieros y de stock
ALTER TABLE "usuarios"
ADD CONSTRAINT "usuarios_saldo_a_favor_nonneg_chk"
CHECK ("saldo_a_favor" >= 0);

ALTER TABLE "cargos_miembro"
ADD CONSTRAINT "cargos_miembro_monto_pagado_rango_chk"
CHECK ("monto_pagado" >= 0 AND "monto_pagado" <= "monto_final");

ALTER TABLE "items_evento"
ADD CONSTRAINT "items_evento_stock_disponible_nonneg_chk"
CHECK ("stock_disponible" IS NULL OR "stock_disponible" >= 0);

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_pedido_evento_id_fkey" FOREIGN KEY ("pedido_evento_id") REFERENCES "pedidos_evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_evento" ADD CONSTRAINT "pedidos_evento_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
