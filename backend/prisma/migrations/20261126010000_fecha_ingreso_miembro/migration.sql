-- Fecha de ingreso al grupo: las cuotas mensuales se cobran desde ese mes (null = sin restricción)
ALTER TABLE "usuarios" ADD COLUMN "fecha_ingreso" DATE;
