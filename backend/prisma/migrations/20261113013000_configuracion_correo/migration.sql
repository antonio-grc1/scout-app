-- CreateTable
CREATE TABLE "configuracion_correo" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "host" VARCHAR(255),
    "port" INTEGER NOT NULL DEFAULT 587,
    "user" VARCHAR(255),
    "pass_encrypted" TEXT,
    "from" VARCHAR(255),
    "app_url" VARCHAR(255),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_correo_pkey" PRIMARY KEY ("id")
);
