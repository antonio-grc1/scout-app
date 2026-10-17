-- AlterTable
ALTER TABLE "conceptos_cuota" ADD COLUMN     "destinatario_tipo" VARCHAR(30) NOT NULL DEFAULT 'TODOS',
ADD COLUMN     "excepciones_json" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "mes" INTEGER,
ADD COLUMN     "plan_cuota_mensual_id" INTEGER;

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN     "usuario_id" INTEGER;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "saldo_a_favor" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "planes_cuota_mensual" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "ciclo_anio" INTEGER NOT NULL,
    "monto_mensual" DECIMAL(12,2) NOT NULL,
    "dia_vencimiento" INTEGER NOT NULL DEFAULT 10,
    "meses_habilitados_json" JSONB NOT NULL DEFAULT '[]',
    "destinatario_tipo" VARCHAR(30) NOT NULL DEFAULT 'PROTAGONISTAS',
    "unidad_id" INTEGER,
    "permite_descuento_hermanos" BOOLEAN NOT NULL DEFAULT true,
    "porcentaje_descuento_hermanos" DECIMAL(5,2),
    "excepciones_json" JSONB NOT NULL DEFAULT '[]',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planes_cuota_mensual_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "conceptos_cuota" ADD CONSTRAINT "conceptos_cuota_plan_cuota_mensual_id_fkey" FOREIGN KEY ("plan_cuota_mensual_id") REFERENCES "planes_cuota_mensual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_cuota_mensual" ADD CONSTRAINT "planes_cuota_mensual_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
