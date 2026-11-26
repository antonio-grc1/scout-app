-- AlterTable
ALTER TABLE "avisos" ADD COLUMN "campamento_id" INTEGER;

-- CreateIndex
CREATE INDEX "avisos_campamento_id_idx" ON "avisos"("campamento_id");

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_campamento_id_fkey" FOREIGN KEY ("campamento_id") REFERENCES "campamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing campamento alerts created before campamento_id existed
UPDATE "avisos" a
SET "campamento_id" = c."id"
FROM "campamentos" c
WHERE a."campamento_id" IS NULL
  AND a."creado_por_usuario_id" = c."creado_por_usuario_id"
  AND a."titulo" = LEFT('Campamento: ' || c."titulo", 150);
