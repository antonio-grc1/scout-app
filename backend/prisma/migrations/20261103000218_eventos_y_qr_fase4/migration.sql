-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('RECAUDACION_PEDIDOS', 'FESTIVAL_ENTRADAS');

-- CreateEnum
CREATE TYPE "EstadoEvento" AS ENUM ('BORRADOR', 'PUBLICADO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoPedidoEvento" AS ENUM ('PENDIENTE', 'PAGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoTicketEvento" AS ENUM ('ACTIVO', 'UTILIZADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "movimientos_financieros" ADD COLUMN     "pedido_evento_id" INTEGER;

-- CreateTable
CREATE TABLE "eventos" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoEvento" NOT NULL DEFAULT 'RECAUDACION_PEDIDOS',
    "estado" "EstadoEvento" NOT NULL DEFAULT 'BORRADOR',
    "fecha_evento" TIMESTAMP(3) NOT NULL,
    "fecha_fin" TIMESTAMP(3),
    "lugar_entrega" VARCHAR(200),
    "rubro_id" INTEGER,
    "cuenta_id" INTEGER,
    "creado_por_usuario_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_evento" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "costo_unitario" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "ganancia_unitaria" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "stock_total" INTEGER,
    "stock_disponible" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_evento" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "comprador_nombre" VARCHAR(120) NOT NULL,
    "comprador_contacto" VARCHAR(100),
    "vendedor_usuario_id" INTEGER,
    "total" DECIMAL(12,2) NOT NULL,
    "total_ganancia" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "ganancia_acreditada" BOOLEAN NOT NULL DEFAULT false,
    "fecha_acreditacion" TIMESTAMP(3),
    "estado" "EstadoPedidoEvento" NOT NULL DEFAULT 'PENDIENTE',
    "metodo_pago" "MetodoPago",
    "cuenta_id" INTEGER,
    "registrado_por_usuario_id" INTEGER NOT NULL,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_pedido_evento" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "ganancia_unitaria" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "subtotal_ganancia" DECIMAL(12,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "detalles_pedido_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets_evento" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "token_qr" VARCHAR(120) NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "estado" "EstadoTicketEvento" NOT NULL DEFAULT 'ACTIVO',
    "fecha_uso" TIMESTAMP(3),
    "validador_usuario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_evento_token_qr_key" ON "tickets_evento"("token_qr");

-- CreateIndex
CREATE INDEX "movimientos_financieros_pedido_evento_id_idx" ON "movimientos_financieros"("pedido_evento_id");

-- AddForeignKey
ALTER TABLE "movimientos_financieros" ADD CONSTRAINT "movimientos_financieros_pedido_evento_id_fkey" FOREIGN KEY ("pedido_evento_id") REFERENCES "pedidos_evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "rubros_contables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_financieras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_evento" ADD CONSTRAINT "items_evento_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_evento" ADD CONSTRAINT "pedidos_evento_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_evento" ADD CONSTRAINT "pedidos_evento_vendedor_usuario_id_fkey" FOREIGN KEY ("vendedor_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_evento" ADD CONSTRAINT "pedidos_evento_registrado_por_usuario_id_fkey" FOREIGN KEY ("registrado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_evento" ADD CONSTRAINT "pedidos_evento_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_financieras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_pedido_evento" ADD CONSTRAINT "detalles_pedido_evento_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_pedido_evento" ADD CONSTRAINT "detalles_pedido_evento_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items_evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets_evento" ADD CONSTRAINT "tickets_evento_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos_evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets_evento" ADD CONSTRAINT "tickets_evento_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items_evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets_evento" ADD CONSTRAINT "tickets_evento_validador_usuario_id_fkey" FOREIGN KEY ("validador_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
