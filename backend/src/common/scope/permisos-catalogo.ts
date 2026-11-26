import { BadRequestException } from '@nestjs/common';
import { AlcanceRol } from '@prisma/client';

export interface PermisoCatalogoItem {
  readonly clave: string;
  readonly modulo: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly alcanceMinimo: AlcanceRol;
  readonly requiere: readonly string[];
}

export const CATALOGO_PERMISOS = [
  {
    clave: 'padron.ver',
    modulo: 'Padrón y Miembros',
    nombre: 'Padrón: Solo lectura',
    descripcion: 'Padrón y Ficha de Miembro: Solo lectura',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: [],
  },
  {
    clave: 'padron.editar',
    modulo: 'Padrón y Miembros',
    nombre: 'Padrón: Edición',
    descripcion: 'Padrón y Ficha de Miembro: Alta, edición de datos, baja y restablecimiento de contraseña',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: ['padron.ver'],
  },
  {
    clave: 'legajos.ver',
    modulo: 'Legajos y Salud',
    nombre: 'Legajos: Solo lectura',
    descripcion: 'Legajos y Colaboradores: Solo lectura y descarga PDF',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: [],
  },
  {
    clave: 'legajos.editar',
    modulo: 'Legajos y Salud',
    nombre: 'Legajos: Edición',
    descripcion: 'Legajos y Colaboradores: Completar fichas y validar entrega física QR',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: ['legajos.ver'],
  },
  {
    clave: 'plantillas.ver',
    modulo: 'Plantillas PDF',
    nombre: 'Plantillas: Solo lectura',
    descripcion: 'Plantillas de Formularios: Solo lectura',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: [],
  },
  {
    clave: 'plantillas.editar',
    modulo: 'Plantillas PDF',
    nombre: 'Plantillas: Edición',
    descripcion: 'Plantillas de Formularios: Diseñar y editar moldes PDF',
    alcanceMinimo: AlcanceRol.GLOBAL,
    requiere: ['plantillas.ver'],
  },
  {
    clave: 'pases.ver',
    modulo: 'Pases y Progresión',
    nombre: 'Pases: Solo lectura',
    descripcion: 'Pases y Progresión: Solo lectura de candidatos y trayectoria',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: [],
  },
  {
    clave: 'pases.editar',
    modulo: 'Pases y Progresión',
    nombre: 'Pases: Edición',
    descripcion: 'Pases y Progresión: Ejecutar pases y gestionar asignaciones de rol',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: ['pases.ver'],
  },
  {
    clave: 'cobranzas.ver',
    modulo: 'Tesorería y Cobranzas',
    nombre: 'Cobranzas: Solo lectura',
    descripcion: 'Cobranzas y Cuotas: Solo lectura de estado de cuenta y familias',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: [],
  },
  {
    clave: 'cobranzas.editar',
    modulo: 'Tesorería y Cobranzas',
    nombre: 'Cobranzas: Edición',
    descripcion: 'Cobranzas y Cuotas: Cobrar, generar/ajustar cargos y descuentos familiares',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: ['cobranzas.ver'],
  },
  {
    clave: 'planes.ver',
    modulo: 'Planes y Conceptos',
    nombre: 'Planes: Solo lectura',
    descripcion: 'Planes y Conceptos: Solo lectura de planes anuales y campamentos',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: [],
  },
  {
    clave: 'planes.editar',
    modulo: 'Planes y Conceptos',
    nombre: 'Planes: Edición',
    descripcion: 'Planes y Conceptos: Crear y editar planes de cuota y campamentos',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: ['planes.ver'],
  },
  {
    clave: 'caja.ver',
    modulo: 'Caja, Bancos y Balance',
    nombre: 'Caja y Balance: Solo lectura',
    descripcion: 'Caja, Bancos y Balance: Solo lectura de saldos, movimientos y cuadro de resultados de su alcance',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: [],
  },
  {
    clave: 'caja.editar',
    modulo: 'Caja, Bancos y Balance',
    nombre: 'Caja y Balance: Edición',
    descripcion: 'Caja, Bancos y Balance: Registrar ingresos/gastos, traspasos, cuentas y rubros de su alcance',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: ['caja.ver'],
  },
  {
    clave: 'eventos.ver',
    modulo: 'Eventos Económicos',
    nombre: 'Eventos: Solo lectura y ventas propias',
    descripcion: 'Eventos Económicos: Ver eventos, pedidos y registrar ventas propias en Mi Espacio',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: [],
  },
  {
    clave: 'eventos.editar',
    modulo: 'Eventos Económicos',
    nombre: 'Eventos: Edición y gestión',
    descripcion: 'Eventos Económicos: Vender en POS, gestionar pedidos, validar QR y configurar eventos según alcance',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: ['eventos.ver'],
  },
  {
    clave: 'organizacion.ver',
    modulo: 'Organización y Correo',
    nombre: 'Organización: Solo lectura',
    descripcion: 'Organización: Solo lectura de ramas y unidades organizativas',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: [],
  },
  {
    clave: 'organizacion.editar',
    modulo: 'Organización y Correo',
    nombre: 'Organización y Correo: Edición',
    descripcion: 'Organización y Correo: Administrar ramas, unidades y configuración de correo institucional (SMTP)',
    alcanceMinimo: AlcanceRol.GLOBAL,
    requiere: ['organizacion.ver'],
  },
  {
    clave: 'roles.ver',
    modulo: 'Roles y Permisos',
    nombre: 'Roles: Solo lectura',
    descripcion: 'Roles y Permisos: Solo lectura de roles y catálogo de permisos',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: [],
  },
  {
    clave: 'roles.editar',
    modulo: 'Roles y Permisos',
    nombre: 'Roles y Permisos: Edición',
    descripcion: 'Roles y Permisos: Crear, modificar, archivar y reactivar roles y sus permisos',
    alcanceMinimo: AlcanceRol.GLOBAL,
    requiere: ['roles.ver'],
  },
  {
    clave: 'avisos.ver',
    modulo: 'Avisos y Comunicados',
    nombre: 'Avisos: Solo lectura',
    descripcion: 'Avisos y Comunicados: Leer avisos recibidos y consultar historial enviado de su alcance',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: [],
  },
  {
    clave: 'avisos.editar',
    modulo: 'Avisos y Comunicados',
    nombre: 'Avisos: Enviar y gestionar',
    descripcion: 'Avisos y Comunicados: Redactar, enviar y eliminar avisos para su sección o todo el grupo',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: ['avisos.ver'],
  },
  {
    clave: 'campamentos.ver',
    modulo: 'Campamentos y Salidas',
    nombre: 'Campamentos: Solo lectura y confirmación propia',
    descripcion: 'Campamentos: Ver invitaciones propias, confirmar asistencia y consultar listado de su alcance',
    alcanceMinimo: AlcanceRol.PROPIO,
    requiere: [],
  },
  {
    clave: 'campamentos.editar',
    modulo: 'Campamentos y Salidas',
    nombre: 'Campamentos: Gestión completa',
    descripcion: 'Campamentos: Crear, editar, eliminar campamentos y gestionar asistencias',
    alcanceMinimo: AlcanceRol.UNIDAD,
    requiere: ['campamentos.ver'],
  },
] as const satisfies readonly PermisoCatalogoItem[];

export type PermisoSistema = (typeof CATALOGO_PERMISOS)[number]['clave'];

export const PERMISOS_SISTEMA: readonly PermisoSistema[] = CATALOGO_PERMISOS.map((p) => p.clave);

export const CATALOGO_PERMISOS_MAP = new Map<string, PermisoCatalogoItem>(
  CATALOGO_PERMISOS.map((p) => [p.clave, p]),
);

export const PERMISOS_CRITICOS_ADMIN = ['roles.editar', 'organizacion.editar'] as const;

export function nivelAlcance(alcance: AlcanceRol): number {
  switch (alcance) {
    case AlcanceRol.GLOBAL:
      return 3;
    case AlcanceRol.UNIDAD:
      return 2;
    case AlcanceRol.PROPIO:
    default:
      return 1;
  }
}

export function maximoAlcance(alcances: readonly AlcanceRol[]): AlcanceRol {
  let best: AlcanceRol = AlcanceRol.PROPIO;
  let bestNivel = 1;
  for (const a of alcances) {
    const n = nivelAlcance(a);
    if (n > bestNivel) {
      best = a;
      bestNivel = n;
    }
  }
  return best;
}

/**
 * Normaliza y valida los permisos + alcances por permiso de un rol.
 * - Si se provee `permisosAlcance`, cada permiso activo usa su alcance específico
 *   (respetando `alcanceMinimo` y asegurando que `<panel>.ver` cubra el alcance de `<panel>.editar`).
 * - Si no se provee `permisosAlcance` (retrocompatibilidad), todos los permisos heredan `alcancePorDefecto`.
 */
export function normalizarYValidarPermisosConAlcance(input: {
  permisos?: readonly string[];
  permisosAlcance?: Record<string, AlcanceRol>;
  alcancePorDefecto?: AlcanceRol;
}): {
  permisos: string[];
  permisosAlcance: Record<string, AlcanceRol>;
  alcanceMaximo: AlcanceRol;
} {
  if (input.permisosAlcance) {
    const clavesEntrada =
      input.permisos !== undefined ? input.permisos : Object.keys(input.permisosAlcance);
    const unicos = new Set(clavesEntrada);
    const mapa: Record<string, AlcanceRol> = {};

    for (const clave of unicos) {
      const meta = CATALOGO_PERMISOS_MAP.get(clave);
      if (!meta) {
        throw new BadRequestException(`Permiso inexistente en el catálogo del sistema: ${clave}`);
      }
      const alcancePerm =
        input.permisosAlcance[clave] ?? input.alcancePorDefecto ?? meta.alcanceMinimo;
      if (nivelAlcance(alcancePerm) < nivelAlcance(meta.alcanceMinimo)) {
        throw new BadRequestException(
          `El permiso "${meta.clave}" requiere un alcance mínimo ${meta.alcanceMinimo} (actual: ${alcancePerm})`,
        );
      }
      mapa[clave] = alcancePerm;
    }

    for (const clave of unicos) {
      const meta = CATALOGO_PERMISOS_MAP.get(clave)!;
      const faltantes = meta.requiere.filter((dep) => !unicos.has(dep));
      if (faltantes.length > 0) {
        throw new BadRequestException(
          `El permiso "${meta.clave}" requiere incluir previamente: ${faltantes.join(', ')}`,
        );
      }
      for (const dep of meta.requiere) {
        if (nivelAlcance(mapa[dep]) < nivelAlcance(mapa[clave])) {
          mapa[dep] = mapa[clave];
        }
      }
    }

    const permisosOrdenados = [...unicos].sort();
    const alcanceMaximo =
      permisosOrdenados.length > 0
        ? maximoAlcance(Object.values(mapa))
        : (input.alcancePorDefecto ?? AlcanceRol.PROPIO);
    return { permisos: permisosOrdenados, permisosAlcance: mapa, alcanceMaximo };
  }

  const alcanceBase = input.alcancePorDefecto ?? AlcanceRol.PROPIO;
  const permisosLista = [...new Set(input.permisos ?? [])].sort();
  validarPermisosParaAlcance(alcanceBase, permisosLista);
  const mapa: Record<string, AlcanceRol> = {};
  for (const clave of permisosLista) {
    mapa[clave] = alcanceBase;
  }
  return {
    permisos: permisosLista,
    permisosAlcance: mapa,
    alcanceMaximo: alcanceBase,
  };
}

/**
 * Valida que los permisos asignados a un rol existan en el catálogo del sistema,
 * sean compatibles con su `alcancePorDefecto` (`alcanceMinimo`) y satisfagan sus
 * dependencias declaradas (`requiere`).
 */
export function validarPermisosParaAlcance(alcance: AlcanceRol, permisos: readonly string[]): void {
  const unicos = new Set(permisos);
  const nivelRol = nivelAlcance(alcance);

  for (const clave of unicos) {
    const meta = CATALOGO_PERMISOS_MAP.get(clave);
    if (!meta) {
      throw new BadRequestException(`Permiso inexistente en el catálogo del sistema: ${clave}`);
    }
    if (nivelRol < nivelAlcance(meta.alcanceMinimo)) {
      throw new BadRequestException(
        `El permiso "${meta.clave}" requiere un alcance mínimo ${meta.alcanceMinimo} (actual: ${alcance})`,
      );
    }
    const faltantes = meta.requiere.filter((dep) => !unicos.has(dep));
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `El permiso "${meta.clave}" requiere incluir previamente: ${faltantes.join(', ')}`,
      );
    }
  }
}
