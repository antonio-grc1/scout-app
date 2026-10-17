import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { ScopedRbacGuard } from './common/guards/scoped-rbac.guard.js';
import { LegajosModule } from './legajos/legajos.module.js';
import { MiembrosModule } from './miembros/miembros.module.js';
import { OrganizacionModule } from './organizacion/organizacion.module.js';
import { PasesModule } from './pases/pases.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TesoreriaModule } from './tesoreria/tesoreria.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    OrganizacionModule,
    MiembrosModule,
    PasesModule,
    LegajosModule,
    TesoreriaModule,
  ],
  providers: [
    // El orden importa: primero autenticación, luego RBAC con alcance.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ScopedRbacGuard },
  ],
})
export class AppModule {}
