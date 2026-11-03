-- CreateEnum
CREATE TYPE "TipoRubro" AS ENUM ('INGRESO', 'EGRESO');

-- AlterTable
ALTER TABLE "conceptos_cuota" ADD COLUMN     "rubro_id" INTEGER;

-- AlterTable
ALTER TABLE "movimientos_financieros" ADD COLUMN     "rubro_id" INTEGER;

-- AlterTable
ALTER TABLE "planes_cuota_mensual" ADD COLUMN     "rubro_id" INTEGER;

-- CreateTable
CREATE TABLE "rubros_contables" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" "TipoRubro" NOT NULL,
    "unidad_id" INTEGER,
    "permite_descuento_default" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rubros_contables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto" DECIMAL(12,2) NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "rubro_id" INTEGER NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "comprobante_nro" VARCHAR(100),
    "comprobante_url" VARCHAR(500),
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "registrado_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubros_contables_nombre_tipo_key" ON "rubros_contables"("nombre", "tipo");

-- CreateIndex
CREATE INDEX "gastos_fecha_idx" ON "gastos"("fecha");

-- CreateIndex
CREATE INDEX "gastos_rubro_id_idx" ON "gastos"("rubro_id");

-- CreateIndex
CREATE INDEX "gastos_cuenta_id_idx" ON "gastos"("cuenta_id");

-- CreateIndex
CREATE INDEX "movimientos_financieros_gasto_id_idx" ON "movimientos_financieros"("gasto_id");

-- CreateIndex
CREATE INDEX "movimientos_financieros_rubro_id_idx" ON "movimientos_financieros"("rubro_id");

-- AddForeignKey
ALTER TABLE "conceptos_cuota" ADD CONSTRAINT "conceptos_cuota_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_cuota_mensual" ADD CONSTRAINT "planes_cuota_mensual_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubros_contables" ADD CONSTRAINT "rubros_contables_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros_contables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_financieras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
