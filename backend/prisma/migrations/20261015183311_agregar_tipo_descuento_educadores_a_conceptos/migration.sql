-- AlterTable
ALTER TABLE "conceptos_cuota" ADD COLUMN     "es_para_educadores" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permite_descuento_hermanos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "porcentaje_descuento_hermanos" DECIMAL(5,2),
ADD COLUMN     "tipo" VARCHAR(50) NOT NULL DEFAULT 'CUOTA_MENSUAL';
