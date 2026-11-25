-- Retiro parcial de vales: se registra cuántas unidades de cada producto ya se entregaron.
-- El vale sigue ACTIVO hasta entregar todas sus unidades y recién ahí pasa a UTILIZADO.

-- AlterTable
ALTER TABLE "tickets_evento" ADD COLUMN "cantidad_retirada" INTEGER NOT NULL DEFAULT 0;

-- Los vales ya canjeados quedan con todas sus unidades retiradas
UPDATE "tickets_evento" SET "cantidad_retirada" = "cantidad" WHERE "estado" = 'UTILIZADO';
