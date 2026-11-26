-- CreateTable
CREATE TABLE "campamento_unidades" (
    "campamento_id" INTEGER NOT NULL,
    "unidad_id" INTEGER NOT NULL,

    CONSTRAINT "campamento_unidades_pkey" PRIMARY KEY ("campamento_id","unidad_id")
);

-- CreateIndex
CREATE INDEX "campamento_unidades_unidad_id_idx" ON "campamento_unidades"("unidad_id");

-- AddForeignKey
ALTER TABLE "campamento_unidades" ADD CONSTRAINT "campamento_unidades_campamento_id_fkey" FOREIGN KEY ("campamento_id") REFERENCES "campamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campamento_unidades" ADD CONSTRAINT "campamento_unidades_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill unidades existentes desde campamentos.unidad_id
INSERT INTO "campamento_unidades" ("campamento_id", "unidad_id")
SELECT "id", "unidad_id"
FROM "campamentos"
WHERE "unidad_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Habilitar Row Level Security
ALTER TABLE "campamento_unidades" ENABLE ROW LEVEL SECURITY;
