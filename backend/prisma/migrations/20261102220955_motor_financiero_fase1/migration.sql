-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('CAJA_EFECTIVO', 'BANCO');

-- CreateEnum
CREATE TYPE "TipoMovimientoFinanciero" AS ENUM ('INGRESO_COBRANZA', 'INGRESO_OTRO', 'EGRESO_GASTO', 'TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA');

-- CreateTable
CREATE TABLE "cuentas_financieras" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_financieras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_financieros" (
    "id" SERIAL NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoMovimientoFinanciero" NOT NULL,
    "monto_ingreso" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "monto_egreso" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "concepto_texto" VARCHAR(300) NOT NULL,
    "pago_id" INTEGER,
    "gasto_id" INTEGER,
    "creado_por_usuario_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_financieros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimientos_financieros_cuenta_id_fecha_idx" ON "movimientos_financieros"("cuenta_id", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_financieros_pago_id_idx" ON "movimientos_financieros"("pago_id");

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_financieras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
