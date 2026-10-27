/**
 * Seed de datos iniciales obligatorios del Grupo Scout (AGENTS.md §5).
 *
 * - Es idempotente: puede ejecutarse varias veces sin duplicar registros.
 * - Este archivo es la ÚNICA fuente de los valores iniciales; la aplicación
 *   siempre los lee desde la base de datos (regla "CERO HARDCODING").
 *
 * Ejecutar con: npx prisma db seed
 */
import 'dotenv/config';
import { AlcanceRol, PrismaClient, TipoUnidad } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedPlantillaOficial } from './plantilla-oficial-2026.js';
import { seedDemo } from './seed-demo.js';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// 1. Ramas (programa pedagógico + rango de edad)
// ---------------------------------------------------------------------------
const RAMAS = [
  { nombre: 'Lobatos', edadMinima: 7, edadMaxima: 9, ordenProgresion: 1 },
  { nombre: 'Scout', edadMinima: 10, edadMaxima: 13, ordenProgresion: 2 },
  { nombre: 'Caminante', edadMinima: 14, edadMaxima: 17, ordenProgresion: 3 },
  { nombre: 'Rover', edadMinima: 18, edadMaxima: 21, ordenProgresion: 4 },
] as const;

// ---------------------------------------------------------------------------
// 2. Unidades organizativas (secciones / ramas reales del grupo)
// ---------------------------------------------------------------------------
const UNIDADES: { nombre: string; tipo: TipoUnidad; rama: string | null }[] = [
  { nombre: 'Rama Lobatos', tipo: TipoUnidad.SECCION_RAMA, rama: 'Lobatos' },
  { nombre: 'Rama Scout Cura Brochero', tipo: TipoUnidad.SECCION_RAMA, rama: 'Scout' },
  { nombre: 'Rama Scout Inakayal', tipo: TipoUnidad.SECCION_RAMA, rama: 'Scout' },
  { nombre: 'Rama Caminantes', tipo: TipoUnidad.SECCION_RAMA, rama: 'Caminante' },
  { nombre: 'Rama Rovers', tipo: TipoUnidad.SECCION_RAMA, rama: 'Rover' },
  { nombre: 'Jefatura de Grupo', tipo: TipoUnidad.JEFATURA, rama: null },
  { nombre: 'Educadores Sin Rama / Equipo de Apoyo', tipo: TipoUnidad.SIN_RAMA_APOYO, rama: null },
];

// ---------------------------------------------------------------------------
// 3. Catálogo de permisos (claves usadas por @RequirePermission)
// ---------------------------------------------------------------------------
const PERMISOS: { clave: string; descripcion: string }[] = [
  { clave: 'organizacion.ver', descripcion: 'Ver ramas, unidades, roles y permisos' },
  { clave: 'organizacion.gestionar', descripcion: 'Crear/editar ramas, unidades, roles y permisos' },
  { clave: 'miembros.ver', descripcion: 'Ver padrón y datos de miembros' },
  { clave: 'miembros.crear', descripcion: 'Dar de alta miembros' },
  { clave: 'miembros.editar', descripcion: 'Editar datos de contacto, familiares y de salud' },
  { clave: 'miembros.editar_identidad', descripcion: 'Editar nombre, apellido, DNI y fecha de nacimiento' },
  { clave: 'miembros.baja', descripcion: 'Dar de baja o reactivar miembros' },
  { clave: 'auth.resetear_clave', descripcion: 'Resetear la clave de un miembro a su DNI' },
  { clave: 'pases.ver', descripcion: 'Ver candidatos sugeridos para pase' },
  { clave: 'pases.ejecutar', descripcion: 'Ejecutar pases de rama' },
  { clave: 'legajos.ver', descripcion: 'Ver legajos y fichas' },
  { clave: 'legajos.completar', descripcion: 'Completar formularios y generar snapshot/PDF' },
  { clave: 'legajos.validar_fisico', descripcion: 'Validar firma física escaneando el QR' },
  { clave: 'legajos.plantillas_gestionar', descripcion: 'Administrar plantillas de formularios' },
  { clave: 'cuotas.ver', descripcion: 'Ver cargos y estado de cuenta' },
  { clave: 'cuotas.cobrar', descripcion: 'Registrar pagos e imputarlos a cargos' },
  { clave: 'tesoreria.gestionar', descripcion: 'Administrar conceptos, cargos y descuentos familiares' },
];

// ---------------------------------------------------------------------------
// 4. Roles base y sus permisos por defecto
// ---------------------------------------------------------------------------
const ROLES: {
  nombre: string;
  alcancePorDefecto: AlcanceRol;
  tipoMiembro: 'PROTAGONISTA' | 'EDUCADOR';
  requiereRama: boolean;
  permisos: string[] | 'TODOS';
}[] = [
  {
    nombre: 'Protagonista',
    alcancePorDefecto: AlcanceRol.PROPIO,
    tipoMiembro: 'PROTAGONISTA',
    requiereRama: true,
    permisos: ['miembros.ver', 'miembros.editar', 'legajos.ver', 'legajos.completar', 'cuotas.ver'],
  },
  {
    nombre: 'Educador de Rama',
    alcancePorDefecto: AlcanceRol.UNIDAD,
    tipoMiembro: 'EDUCADOR',
    requiereRama: true,
    permisos: [
      'organizacion.ver',
      'miembros.ver',
      'miembros.crear',
      'miembros.editar',
      'miembros.editar_identidad',
      'miembros.baja',
      'auth.resetear_clave',
      'pases.ver',
      'pases.ejecutar',
      'legajos.ver',
      'legajos.completar',
      'legajos.validar_fisico',
      'cuotas.ver',
      'cuotas.cobrar',
    ],
  },
  {
    nombre: 'Jefe de Grupo',
    alcancePorDefecto: AlcanceRol.GLOBAL,
    tipoMiembro: 'EDUCADOR',
    requiereRama: false,
    permisos: 'TODOS',
  },
  {
    // GLOBAL pero con permisos acotados (solo lectura + validación física + completar su propio legajo)
    nombre: 'Educador Sin Rama',
    alcancePorDefecto: AlcanceRol.GLOBAL,
    tipoMiembro: 'EDUCADOR',
    requiereRama: false,
    permisos: ['organizacion.ver', 'miembros.ver', 'legajos.ver', 'legajos.completar', 'legajos.validar_fisico', 'cuotas.ver'],
  },
];

async function seedRamas(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const r of RAMAS) {
    const existente = await prisma.rama.findFirst({ where: { nombre: r.nombre } });
    const rama = existente
      ? await prisma.rama.update({ where: { id: existente.id }, data: { ...r } })
      : await prisma.rama.create({ data: { ...r } });
    ids.set(rama.nombre, rama.id);
  }
  return ids;
}

async function seedUnidades(ramaIds: Map<string, number>): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  const nombresAntiguos: Record<string, string> = {
    'Rama Lobatos': 'Lobatos',
    'Rama Scout Cura Brochero': 'Unidad Scout Cura Brochero',
    'Rama Scout Inakayal': 'Unidad Scout Inakayal',
    'Rama Caminantes': 'Caminante',
    'Rama Rovers': 'Rover',
  };

  for (const u of UNIDADES) {
    const ramaId = u.rama ? ramaIds.get(u.rama) ?? null : null;
    if (u.rama && ramaId === null) throw new Error(`Rama "${u.rama}" no encontrada`);

    const data = { nombre: u.nombre, tipo: u.tipo, ramaId };
    const nombreViejo = nombresAntiguos[u.nombre];
    const existente = await prisma.unidadOrganizativa.findFirst({
      where: {
        OR: [
          { nombre: u.nombre },
          ...(nombreViejo ? [{ nombre: nombreViejo }] : []),
        ],
      },
    });
    const unidad = existente
      ? await prisma.unidadOrganizativa.update({ where: { id: existente.id }, data })
      : await prisma.unidadOrganizativa.create({ data });
    ids.set(unidad.nombre, unidad.id);
  }
  return ids;
}

async function seedPermisos(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const p of PERMISOS) {
    const permiso = await prisma.permiso.upsert({
      where: { clave: p.clave },
      update: { descripcion: p.descripcion },
      create: p,
    });
    ids.set(permiso.clave, permiso.id);
  }
  return ids;
}

async function seedRoles(permisoIds: Map<string, number>): Promise<Map<string, number>> {
  const ids = new Map<string, number>();

  // Migrar rol anterior si existiese
  const viejoRolEdu = await prisma.rol.findFirst({ where: { nombre: 'Educador de Unidad' } });
  if (viejoRolEdu) {
    const existenteRama = await prisma.rol.findFirst({ where: { nombre: 'Educador de Rama' } });
    if (existenteRama) {
      await prisma.asignacionMiembro.updateMany({
        where: { rolId: viejoRolEdu.id },
        data: { rolId: existenteRama.id },
      });
      await prisma.rolPermiso.deleteMany({ where: { rolId: viejoRolEdu.id } });
      await prisma.rol.delete({ where: { id: viejoRolEdu.id } });
    } else {
      await prisma.rol.update({ where: { id: viejoRolEdu.id }, data: { nombre: 'Educador de Rama' } });
    }
  }

  const totalRolesExistentes = await prisma.rol.count();

  for (const r of ROLES) {
    const existente = await prisma.rol.findUnique({ where: { nombre: r.nombre } });
    if (!existente && totalRolesExistentes > 0) {
      // Si ya existen roles en la base y este nombre no está, fue renombrado o eliminado por el administrador: no recrearlo
      continue;
    }
    const rol = existente
      ? existente
      : await prisma.rol.create({
          data: {
            nombre: r.nombre,
            alcancePorDefecto: r.alcancePorDefecto,
            tipoMiembro: r.tipoMiembro,
            requiereRama: r.requiereRama,
            esSistema: false,
          },
        });
    ids.set(rol.nombre, rol.id);

    if (!existente) {
      const claves = r.permisos === 'TODOS' ? [...permisoIds.keys()] : r.permisos;
      await prisma.rolPermiso.createMany({
        data: claves.map((clave) => {
          const permisoId = permisoIds.get(clave);
          if (!permisoId) throw new Error(`Permiso "${clave}" no definido`);
          return { rolId: rol.id, permisoId };
        }),
        skipDuplicates: true,
      });
    }
  }
  return ids;
}

/** Crea el primer Jefe de Grupo para poder ingresar al sistema. */
async function seedAdmin(unidadIds: Map<string, number>, rolIds: Map<string, number>): Promise<void> {
  const dni = process.env.SEED_ADMIN_DNI ?? '11111111';
  const cicloAnio = Number(process.env.SEED_CICLO_ANIO ?? new Date().getFullYear());
  const unidadId = unidadIds.get('Jefatura de Grupo')!;
  let rolId = rolIds.get('Jefe de Grupo');
  if (!rolId) {
    const rolAdmin = await prisma.rol.findFirst({
      where: { alcancePorDefecto: AlcanceRol.GLOBAL },
      orderBy: { id: 'asc' },
    });
    rolId = rolAdmin?.id;
  }
  if (!rolId) return;

  let usuario = await prisma.usuario.findUnique({ where: { dni } });
  if (!usuario) {
    const password = process.env.SEED_ADMIN_PASSWORD || 'scout2026';
    usuario = await prisma.usuario.create({
      data: {
        dni,
        passwordHash: await bcrypt.hash(password, 10),
        nombre: process.env.SEED_ADMIN_NOMBRE ?? 'Jefe',
        apellido: process.env.SEED_ADMIN_APELLIDO ?? 'de Grupo',
        fechaNacimiento: new Date(process.env.SEED_ADMIN_FECHA_NACIMIENTO ?? '1980-01-01'),
        requiereCambioClave: false,
      },
    });
  }

  const asignacion = await prisma.asignacionMiembro.findFirst({
    where: { usuarioId: usuario.id, unidadId, rolId, activo: true },
  });
  if (!asignacion) {
    await prisma.asignacionMiembro.create({
      data: { usuarioId: usuario.id, unidadId, rolId, cicloAnio },
    });
  }
  console.log(`👤 Jefe de Grupo inicial: DNI ${dni}`);
}

async function main(): Promise<void> {
  const ramaIds = await seedRamas();
  console.log(`🌿 Ramas: ${ramaIds.size}`);
  const unidadIds = await seedUnidades(ramaIds);
  console.log(`🏕️  Unidades: ${unidadIds.size}`);
  const permisoIds = await seedPermisos();
  console.log(`🔑 Permisos: ${permisoIds.size}`);
  const rolIds = await seedRoles(permisoIds);
  console.log(`🎖️  Roles: ${rolIds.size}`);
  await seedAdmin(unidadIds, rolIds);
  await seedPlantillaOficial(prisma);
  await seedDemo(prisma);
}

main()
  .then(() => console.log('✅ Seed completado'))
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
