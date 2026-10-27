// Centralización de etiquetas humanas, estados semánticos y formateadores sin jerga técnica

export const ESTADO_FICHA_CONFIG: Record<
  string,
  { label: string; shortLabel: string; badgeClass: string; dotClass: string }
> = {
  VALIDADO_FISICAMENTE: {
    label: 'Ficha al día',
    shortLabel: 'Al día',
    badgeClass:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
    dotClass: 'bg-emerald-500',
  },
  PENDIENTE_FIRMA_FISICA: {
    label: 'Falta entregar papel firmado',
    shortLabel: 'Falta papel',
    badgeClass:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
    dotClass: 'bg-amber-500',
  },
  DESACTUALIZADO_REQUIERE_REIMPRESION: {
    label: 'Datos editados (Reimprimir)',
    shortLabel: 'Reimprimir',
    badgeClass:
      'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
    dotClass: 'bg-rose-500',
  },
  BORRADOR: {
    label: 'Incompleta (Borrador)',
    shortLabel: 'Borrador',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dotClass: 'bg-slate-400',
  },
  SIN_FICHA: {
    label: 'Sin ficha cargada',
    shortLabel: 'Sin ficha',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
    dotClass: 'bg-rose-500',
  },
  SIN_ENTREGAR: {
    label: 'Sin ficha cargada',
    shortLabel: 'Sin ficha',
    badgeClass:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
    dotClass: 'bg-rose-500',
  },
};

export const ESTADO_CARGO_CONFIG: Record<
  string,
  { label: string; badgeClass: string }
> = {
  PAGADO: {
    label: 'Pagado',
    badgeClass:
      'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800',
  },
  PARCIAL: {
    label: 'Pago parcial',
    badgeClass:
      'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800',
  },
  PENDIENTE: {
    label: 'Pendiente',
    badgeClass:
      'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800',
  },
  ANULADO: {
    label: 'Anulado',
    badgeClass:
      'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 line-through',
  },
};

export const METODO_PAGO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  OTRO: 'Otro medio',
};

export const TIPO_UNIDAD_LABELS: Record<string, string> = {
  SECCION_RAMA: 'Rama de Protagonistas',
  JEFATURA: 'Jefatura de Grupo',
  SIN_RAMA_APOYO: 'Equipo de Apoyo',
};

export const NOMBRES_MESES_CORTOS = [
  '',
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export const NOMBRES_MESES_LARGOS = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function formatearMoneda(valor: number | string | null | undefined): string {
  const num = Number(valor ?? 0);
  if (isNaN(num)) return '$0';
  return num.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function calcularEdad(fechaNacStr?: string | null): number | null {
  if (!fechaNacStr) return null;
  const nac = new Date(fechaNacStr);
  if (isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

/**
 * Calcula el año de Camada según la cohorte escolar con corte al 30 de junio inclusive (30/06).
 * - Nacidos entre el 01/01/Y y el 30/06/Y -> Camada Y.
 * - Nacidos entre el 01/07/Y y el 31/12/Y -> Camada Y + 1.
 */
export function calcularCamada(fechaNacStr?: string | null): number | null {
  if (!fechaNacStr) return null;
  const nac = new Date(fechaNacStr);
  if (isNaN(nac.getTime())) return null;
  const anio = nac.getUTCFullYear();
  const mes = nac.getUTCMonth(); // 0 = Enero .. 5 = Junio
  return mes < 6 ? anio : anio + 1;
}

/**
 * Calcula la edad cumplida al 30 de junio inclusive (30/06) del año de ciclo indicado.
 */
export function calcularEdadAlCorte30Junio(
  fechaNacStr?: string | null,
  anioCiclo: number = new Date().getFullYear(),
): number | null {
  const camada = calcularCamada(fechaNacStr);
  if (camada === null) return null;
  return anioCiclo - camada;
}

/**
 * Normaliza un texto para búsquedas sin distinción de mayúsculas/minúsculas ni tildes/acentos.
 */
export function normalizarTextoBusqueda(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Formatea el nombre del grupo familiar asegurando que diga "Familia X" sin duplicar el prefijo.
 */
export function formatearNombreFamilia(nombre?: string | null): string {
  const n = String(nombre ?? '').trim();
  if (!n) return '';
  if (normalizarTextoBusqueda(n).startsWith('familia ')) return n;
  if (normalizarTextoBusqueda(n).startsWith('fam. ')) {
    return `Familia ${n.slice(5).trim()}`;
  }
  return `Familia ${n}`;
}

/**
 * Traduce errores de API o de red a mensajes claros y accionables para educadores/familias
 */
export function traducirErrorAmigable(err: any, mensajePorDefecto = 'No pudimos guardar los cambios. Intenta de nuevo.'): string {
  const raw = err?.response?.data?.message || err?.message || '';
  const texto = Array.isArray(raw) ? raw.join('. ') : String(raw);
  const lower = texto.toLowerCase();

  if (lower.includes('unique') || lower.includes('ya existe') || lower.includes('duplicad')) {
    if (lower.includes('dni')) return 'Ya hay una persona registrada con este número de DNI.';
    return 'Este registro ya existe en el sistema.';
  }
  if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('timeout')) {
    return 'Sin conexión a internet. Verifica tu señal e intenta nuevamente.';
  }
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('credenciales')) {
    return 'El DNI o la contraseña ingresados no son correctos.';
  }
  if (lower.includes('forbidden') || lower.includes('403') || lower.includes('permiso')) {
    return 'No tienes permisos para realizar esta acción.';
  }
  if (lower.includes('not found') || lower.includes('404')) {
    return 'No encontramos la información solicitada.';
  }
  if (lower.includes('500') || lower.includes('internal server')) {
    return 'Ocurrió un inconveniente temporal. Por favor, intenta de nuevo en unos segundos.';
  }

  if (texto && !lower.includes('prisma') && !lower.includes('sql') && !lower.includes('constraint') && !lower.includes('exception')) {
    return texto;
  }

  return mensajePorDefecto;
}

export interface OpcionTelefonoContacto {
  etiqueta: string;
  nombre?: string;
  telefono: string;
}

/**
 * Extrae todos los teléfonos registrados del miembro (propio, madre, padre, tutor y urgencias)
 * junto con el nombre y apellido de la persona y su vínculo para el modal de llamada.
 */
export function extraerTelefonosMiembro(
  miembro: any,
  entrega?: any,
): OpcionTelefonoContacto[] {
  if (!miembro) return [];
  const datos: Record<string, any> = {
    ...(miembro.datosFijosJson || {}),
    ...(entrega?.respuestasSnapshotJson || {}),
  };

  const resultado: OpcionTelefonoContacto[] = [];
  const agregar = (etiqueta: string, telRaw: unknown, nombreRaw?: unknown) => {
    const tel = String(telRaw ?? '').trim();
    if (!tel) return;
    const nombre = String(nombreRaw ?? '').trim() || undefined;
    if (resultado.some((r) => r.etiqueta === etiqueta && r.telefono === tel)) return;
    resultado.push({ etiqueta, nombre, telefono: tel });
  };

  const nombreCompletoMiembro = `${miembro.nombre || ''} ${miembro.apellido || ''}`.trim();

  agregar(
    'Miembro',
    miembro.telefonoContacto || datos.protagonista_telefono,
    nombreCompletoMiembro,
  );
  agregar(
    'Madre',
    datos.madre_telefono,
    String(datos.madre_nombres ?? '').trim() || `${miembro.apellido ? `Madre (${miembro.nombre} ${miembro.apellido})` : 'Madre'}`,
  );
  agregar(
    'Padre',
    datos.padre_telefono,
    String(datos.padre_nombres ?? '').trim() || `${miembro.apellido ? `Padre (${miembro.nombre} ${miembro.apellido})` : 'Padre'}`,
  );
  agregar(
    'Tutor/a',
    datos.tutor_telefono,
    String(datos.tutor_nombres ?? '').trim() || `${miembro.apellido ? `Tutor/a (${miembro.nombre} ${miembro.apellido})` : 'Tutor/a'}`,
  );
  agregar(
    'Emergencia',
    datos.emergencia_telefono || datos.telefono_urgencias || datos.tel_emergencia_1,
    String(datos.emergencia_nombre || datos.emergencia_contacto || '').trim() ||
      `Emergencia (${nombreCompletoMiembro})`,
  );

  return resultado;
}

export interface OpcionGrupoHermanos {
  key: string;
  esGrupoExistente: boolean;
  grupoFamiliarId?: number;
  nombreFamilia: string;
  representante: any;
  integrantes: Array<{
    id: number;
    dni: string;
    nombre: string;
    apellido: string;
    ramaNombre: string;
  }>;
  madreNombre?: string;
  padreNombre?: string;
  tutorNombre?: string;
  domicilio?: string;
}

/**
 * Agrupa los candidatos devueltos por /miembros/hermanos/buscar según su GrupoFamiliar.
 * Si A y B ya son hermanos en el mismo GrupoFamiliar, se presentan juntos como un único
 * grupo de hermanos seleccionable (transitividad A-B-C), diferenciándose de otras familias
 * con el mismo apellido.
 */
export function agruparCandidatosPorFamilia(
  candidatos: any[],
  excluirUsuarioId?: number,
): OpcionGrupoHermanos[] {
  const gruposMap = new Map<string, OpcionGrupoHermanos>();

  for (const c of candidatos || []) {
    if (excluirUsuarioId && c.id === excluirUsuarioId) continue;

    const gf = c.grupoFamiliar;
    // Excluir el grupo familiar si el usuario actual ya pertenece a ese grupo
    if (
      excluirUsuarioId &&
      Array.isArray(gf?.miembros) &&
      gf.miembros.some((m: any) => m.id === excluirUsuarioId)
    ) {
      continue;
    }

    const key = gf?.id ? `gf-${gf.id}` : `user-${c.id}`;
    if (gruposMap.has(key)) continue;

    const datos = c.datosCompartidos || c.datosFijosJson || {};
    const miembrosRaw = Array.isArray(gf?.miembros) && gf.miembros.length > 0 ? gf.miembros : [c];

    const integrantes = miembrosRaw.map((m: any) => ({
      id: m.id,
      dni: m.dni,
      nombre: m.nombre,
      apellido: m.apellido,
      ramaNombre: m.asignaciones?.[0]?.unidad?.nombre || 'Sin rama',
    }));

    gruposMap.set(key, {
      key,
      esGrupoExistente: Boolean(gf?.id && integrantes.length > 1),
      grupoFamiliarId: gf?.id,
      nombreFamilia: formatearNombreFamilia(gf?.nombreFamilia || `Familia ${c.apellido}`),
      representante: c,
      integrantes,
      madreNombre: datos.madre_nombres || undefined,
      padreNombre: datos.padre_nombres || undefined,
      tutorNombre: datos.tutor_nombres || undefined,
      domicilio: datos.domicilio || undefined,
    });
  }

  return Array.from(gruposMap.values());
}

/**
 * Selecciona automáticamente la plantilla de legajo adecuada según rol, rama y edad:
 * - Educadores / Dirigentes -> LEGAJO_EDUCADORES_2026
 * - Rama Rover o mayores de 18 años -> LEGAJO_ROVERS_2026
 * - Menores de 18 años (Lobatos, Scouts, Caminantes) -> LEGAJO_MENORES_2026
 */
export function seleccionarPlantillaPorMiembro(
  plantillas: any[],
  miembro: any,
  asignacionesFallback?: any[],
): any | null {
  if (!Array.isArray(plantillas) || plantillas.length === 0) return null;

  const asig = miembro?.asignaciones?.[0] || asignacionesFallback?.[0];
  const rolNombre = String(asig?.rol?.nombre || asig?.rol || '').toLowerCase();
  const alcance = String(asig?.alcanceOverride || asig?.rol?.alcancePorDefecto || asig?.alcance || '').toUpperCase();
  const unidadNombre = String(
    asig?.unidad?.nombre || asig?.unidadNombre || asig?.unidad?.rama?.nombre || '',
  ).toLowerCase();
  const unidadTipo = String(asig?.unidad?.tipo || '').toUpperCase();

  const esEducador =
    rolNombre.includes('educador') ||
    rolNombre.includes('jefe') ||
    unidadTipo === 'JEFATURA' ||
    unidadTipo === 'SIN_RAMA_APOYO' ||
    alcance === 'GLOBAL' ||
    alcance === 'UNIDAD';

  if (esEducador) {
    const pEdu = plantillas.find((p) => p.codigo === 'LEGAJO_EDUCADORES_2026');
    if (pEdu) return pEdu;
  }

  const edad = calcularEdad(miembro?.fechaNacimiento);
  const esRoverOMayor = unidadNombre.includes('rover') || (edad !== null && edad >= 18);

  if (esRoverOMayor) {
    const pRov = plantillas.find((p) => p.codigo === 'LEGAJO_ROVERS_2026');
    if (pRov) return pRov;
  }

  return (
    plantillas.find((p) => p.codigo === 'LEGAJO_MENORES_2026') ||
    plantillas[0]
  );
}
