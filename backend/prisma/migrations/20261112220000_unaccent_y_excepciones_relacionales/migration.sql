-- Habilitar búsqueda insensible a tildes en PostgreSQL
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Tablas relacionales de excepciones particulares para Conceptos y Planes
CREATE TABLE "concepto_excepciones" (
    "concepto_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "concepto_excepciones_pkey" PRIMARY KEY ("concepto_id","usuario_id")
);

CREATE TABLE "plan_cuota_excepciones" (
    "plan_cuota_mensual_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "plan_cuota_excepciones_pkey" PRIMARY KEY ("plan_cuota_mensual_id","usuario_id")
);

CREATE INDEX "concepto_excepciones_usuario_id_idx" ON "concepto_excepciones"("usuario_id");
CREATE INDEX "plan_cuota_excepciones_usuario_id_idx" ON "plan_cuota_excepciones"("usuario_id");

ALTER TABLE "concepto_excepciones"
    ADD CONSTRAINT "concepto_excepciones_concepto_id_fkey"
    FOREIGN KEY ("concepto_id") REFERENCES "conceptos_cuota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "concepto_excepciones"
    ADD CONSTRAINT "concepto_excepciones_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_cuota_excepciones"
    ADD CONSTRAINT "plan_cuota_excepciones_plan_cuota_mensual_id_fkey"
    FOREIGN KEY ("plan_cuota_mensual_id") REFERENCES "planes_cuota_mensual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_cuota_excepciones"
    ADD CONSTRAINT "plan_cuota_excepciones_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill desde excepciones_json antes de eliminar las columnas JSON
INSERT INTO "concepto_excepciones" ("concepto_id", "usuario_id")
SELECT sub."concepto_id", sub."usuario_id"
FROM (
  SELECT
    c."id" AS "concepto_id",
    CASE WHEN elem."uid" ~ '^\d{1,9}$' THEN elem."uid"::INTEGER ELSE NULL END AS "usuario_id"
  FROM "conceptos_cuota" c
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(c."excepciones_json") = 'array' THEN c."excepciones_json" ELSE '[]'::jsonb END
  ) AS elem("uid")
) sub
INNER JOIN "usuarios" u ON u."id" = sub."usuario_id"
ON CONFLICT DO NOTHING;

INSERT INTO "plan_cuota_excepciones" ("plan_cuota_mensual_id", "usuario_id")
SELECT sub."plan_id", sub."usuario_id"
FROM (
  SELECT
    p."id" AS "plan_id",
    CASE WHEN elem."uid" ~ '^\d{1,9}$' THEN elem."uid"::INTEGER ELSE NULL END AS "usuario_id"
  FROM "planes_cuota_mensual" p
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p."excepciones_json") = 'array' THEN p."excepciones_json" ELSE '[]'::jsonb END
  ) AS elem("uid")
) sub
INNER JOIN "usuarios" u ON u."id" = sub."usuario_id"
ON CONFLICT DO NOTHING;

ALTER TABLE "conceptos_cuota" DROP COLUMN "excepciones_json";
ALTER TABLE "planes_cuota_mensual" DROP COLUMN "excepciones_json";
