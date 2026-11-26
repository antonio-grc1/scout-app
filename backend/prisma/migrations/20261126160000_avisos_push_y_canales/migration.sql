-- AlterTable
ALTER TABLE "avisos"
  ADD COLUMN "enviar_push" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "enviar_email" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "push_enviados" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "emails_enviados" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "suscripciones_push" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suscripciones_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suscripciones_push_endpoint_key" ON "suscripciones_push"("endpoint");

-- CreateIndex
CREATE INDEX "suscripciones_push_usuario_id_idx" ON "suscripciones_push"("usuario_id");

-- AddForeignKey
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Habilitar Row Level Security (consistente con 20261125210000_habilitar_rls)
ALTER TABLE "suscripciones_push" ENABLE ROW LEVEL SECURITY;
