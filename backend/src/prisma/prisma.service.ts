import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.asegurarColumnasRolesDinamicos();
    this.logger.log('Conexión con PostgreSQL local establecida correctamente.');
  }

  private async asegurarColumnasRolesDinamicos(): Promise<void> {
    try {
      const cols = await this.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'roles' AND column_name IN ('tipo_miembro', 'requiere_rama')`,
      );
      if (cols.length < 2) {
        await this.$executeRawUnsafe(
          `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "tipo_miembro" VARCHAR(30) NOT NULL DEFAULT 'EDUCADOR'`,
        );
        await this.$executeRawUnsafe(
          `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "requiere_rama" BOOLEAN NOT NULL DEFAULT true`,
        );
        await this.$executeRawUnsafe(
          `UPDATE "roles" SET "tipo_miembro" = 'PROTAGONISTA', "requiere_rama" = true WHERE "alcance_por_defecto" = 'PROPIO'`,
        );
        await this.$executeRawUnsafe(
          `UPDATE "roles" SET "tipo_miembro" = 'EDUCADOR', "requiere_rama" = false WHERE "alcance_por_defecto" = 'GLOBAL'`,
        );
      }
    } catch {
      // Ignorar si la base aún no fue migrada inicialmente
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
