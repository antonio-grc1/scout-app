-- CreateEnum
CREATE TYPE "TipoUnidad" AS ENUM ('SECCION_RAMA', 'JEFATURA', 'SIN_RAMA_APOYO');

-- CreateEnum
CREATE TYPE "AlcanceRol" AS ENUM ('PROPIO', 'UNIDAD', 'GLOBAL');

-- CreateEnum
CREATE TYPE "EstadoEntrega" AS ENUM ('BORRADOR', 'PENDIENTE_FIRMA_FISICA', 'VALIDADO_FISICAMENTE', 'DESACTUALIZADO_REQUIERE_REIMPRESION');

-- CreateEnum
CREATE TYPE "EstadoCargo" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'OTRO');

-- CreateTable
CREATE TABLE "ramas" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "edad_minima" INTEGER NOT NULL,
    "edad_maxima" INTEGER NOT NULL,
    "orden_progresion" INTEGER NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ramas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_organizativas" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "tipo" "TipoUnidad" NOT NULL,
    "rama_id" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "unidades_organizativas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos_familiares" (
    "id" SERIAL NOT NULL,
    "nombre_familia" VARCHAR(150) NOT NULL,
    "porcentaje_descuento_hermanos" DECIMAL(5,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "grupos_familiares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "dni" VARCHAR(20) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "apellido" VARCHAR(100) NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "email_contacto" VARCHAR(150),
    "telefono_contacto" VARCHAR(50),
    "grupo_familiar_id" INTEGER,
    "datos_fijos_json" JSONB NOT NULL DEFAULT '{}',
    "requiere_cambio_clave" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "alcance_por_defecto" "AlcanceRol" NOT NULL,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" SERIAL NOT NULL,
    "clave" VARCHAR(100) NOT NULL,
    "descripcion" VARCHAR(255),

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permisos" (
    "rol_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,

    CONSTRAINT "rol_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "asignaciones_miembro" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "unidad_id" INTEGER NOT NULL,
    "rol_id" INTEGER NOT NULL,
    "alcance_override" "AlcanceRol",
    "ciclo_anio" INTEGER NOT NULL,
    "fecha_inicio" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_fin" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "asignaciones_miembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantillas_formulario" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "ciclo_anio" INTEGER NOT NULL,
    "esquema_campos_json" JSONB NOT NULL,
    "mapeo_pdf_json" JSONB NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plantillas_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas_formulario" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "plantilla_id" INTEGER NOT NULL,
    "ciclo_anio" INTEGER NOT NULL,
    "version_impresion" INTEGER NOT NULL DEFAULT 1,
    "respuestas_snapshot_json" JSONB NOT NULL,
    "hash_verificacion" VARCHAR(64) NOT NULL,
    "estado" "EstadoEntrega" NOT NULL DEFAULT 'BORRADOR',
    "fecha_generacion_pdf" TIMESTAMP(3),
    "fecha_validacion_fisica" TIMESTAMP(3),
    "validado_por_usuario_id" INTEGER,

    CONSTRAINT "entregas_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conceptos_cuota" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "monto_base" DECIMAL(12,2) NOT NULL,
    "ciclo_anio" INTEGER NOT NULL,
    "fecha_vencimiento" DATE,
    "unidad_id" INTEGER,

    CONSTRAINT "conceptos_cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos_miembro" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "concepto_id" INTEGER NOT NULL,
    "monto_original" DECIMAL(12,2) NOT NULL,
    "monto_descuento" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "monto_final" DECIMAL(12,2) NOT NULL,
    "monto_pagado" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "estado" "EstadoCargo" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "cargos_miembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "fecha_pago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto_total" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "referencia_comprobante" VARCHAR(100),
    "registrado_por_usuario_id" INTEGER NOT NULL,
    "observaciones" TEXT,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_imputaciones" (
    "id" SERIAL NOT NULL,
    "pago_id" INTEGER NOT NULL,
    "cargo_id" INTEGER NOT NULL,
    "monto_imputado" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "pago_imputaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_dni_key" ON "usuarios"("dni");

-- CreateIndex
CREATE INDEX "usuarios_dni_idx" ON "usuarios"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "roles_nombre_key" ON "roles"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_clave_key" ON "permisos"("clave");

-- CreateIndex
CREATE INDEX "asignaciones_miembro_usuario_id_activo_idx" ON "asignaciones_miembro"("usuario_id", "activo");

-- CreateIndex
CREATE INDEX "asignaciones_miembro_unidad_id_activo_idx" ON "asignaciones_miembro"("unidad_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "entregas_formulario_hash_verificacion_key" ON "entregas_formulario"("hash_verificacion");

-- AddForeignKey
ALTER TABLE "unidades_organizativas" ADD CONSTRAINT "unidades_organizativas_rama_id_fkey" FOREIGN KEY ("rama_id") REFERENCES "ramas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_grupo_familiar_id_fkey" FOREIGN KEY ("grupo_familiar_id") REFERENCES "grupos_familiares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_miembro" ADD CONSTRAINT "asignaciones_miembro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_miembro" ADD CONSTRAINT "asignaciones_miembro_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_miembro" ADD CONSTRAINT "asignaciones_miembro_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_formulario" ADD CONSTRAINT "entregas_formulario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_formulario" ADD CONSTRAINT "entregas_formulario_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantillas_formulario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas_formulario" ADD CONSTRAINT "entregas_formulario_validado_por_usuario_id_fkey" FOREIGN KEY ("validado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conceptos_cuota" ADD CONSTRAINT "conceptos_cuota_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "unidades_organizativas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_miembro" ADD CONSTRAINT "cargos_miembro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos_miembro" ADD CONSTRAINT "cargos_miembro_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "conceptos_cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_usuario_id_fkey" FOREIGN KEY ("registrado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_imputaciones" ADD CONSTRAINT "pago_imputaciones_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_imputaciones" ADD CONSTRAINT "pago_imputaciones_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargos_miembro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
