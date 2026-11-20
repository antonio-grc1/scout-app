/**
 * Sincroniza SOLO las plantillas oficiales de legajos (idempotente).
 * Se ejecuta en cada deploy (start:render) para que la base de producción
 * apunte siempre a los PDFs que existen en el frontend desplegado.
 *
 * Ejecutar con: npm run prisma:seed:plantillas
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedPlantillaOficial } from './plantilla-oficial-2026.js';

const prisma = new PrismaClient();

seedPlantillaOficial(prisma)
  .then(() => console.log('✅ Plantillas oficiales sincronizadas'))
  .catch((e) => {
    console.error('❌ Error sincronizando plantillas:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
