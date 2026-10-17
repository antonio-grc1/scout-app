export interface RamaColorConfig {
  key: 'lobatos' | 'scout' | 'caminantes' | 'rover' | 'adultos' | 'otro';
  nombre: string;
  colorName: string;
  badgeClases: string;
  avatarClases: string;
  dotColor: string;
  borderClases: string;
  bannerClases: string;
}

/**
 * Paleta de colores oficial solicitada:
 * - Lobatos: Amarillo (Amber/Yellow)
 * - Scout: Verde (Emerald/Green)
 * - Caminantes: Celeste (Sky/Light Blue)
 * - Rover: Rojo (Red)
 * - Adultos/Educadores: Índigo/Púrpura
 */
export const RAMA_COLORS: Record<string, RamaColorConfig> = {
  lobatos: {
    key: 'lobatos',
    nombre: 'Lobatos',
    colorName: 'Amarillo',
    badgeClases: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700',
    avatarClases: 'bg-amber-500 text-slate-950 font-black ring-2 ring-amber-300/60 dark:ring-amber-500/40',
    dotColor: 'bg-amber-500',
    borderClases: 'border-l-amber-400 dark:border-l-amber-500',
    bannerClases: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  },
  scout: {
    key: 'scout',
    nombre: 'Scout',
    colorName: 'Verde',
    badgeClases: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700',
    avatarClases: 'bg-emerald-600 text-white font-black ring-2 ring-emerald-300/60 dark:ring-emerald-500/40',
    dotColor: 'bg-emerald-600',
    borderClases: 'border-l-emerald-500 dark:border-l-emerald-500',
    bannerClases: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
  },
  caminantes: {
    key: 'caminantes',
    nombre: 'Caminantes',
    colorName: 'Celeste',
    badgeClases: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-700',
    avatarClases: 'bg-sky-500 text-white font-black ring-2 ring-sky-300/60 dark:ring-sky-500/40',
    dotColor: 'bg-sky-500',
    borderClases: 'border-l-sky-400 dark:border-l-sky-500',
    bannerClases: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800',
  },
  rover: {
    key: 'rover',
    nombre: 'Rover',
    colorName: 'Rojo',
    badgeClases: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950/70 dark:text-red-200 dark:border-red-700',
    avatarClases: 'bg-red-600 text-white font-black ring-2 ring-red-300/60 dark:ring-red-500/40',
    dotColor: 'bg-red-600',
    borderClases: 'border-l-red-500 dark:border-l-red-500',
    bannerClases: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-800',
  },
  adultos: {
    key: 'adultos',
    nombre: 'Educadores / Jefatura',
    colorName: 'Índigo',
    badgeClases: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-700',
    avatarClases: 'bg-indigo-600 text-white font-black ring-2 ring-indigo-300/60 dark:ring-indigo-500/40',
    dotColor: 'bg-indigo-600',
    borderClases: 'border-l-indigo-500 dark:border-l-indigo-500',
    bannerClases: 'bg-indigo-50 text-indigo-900 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-800',
  },
  otro: {
    key: 'otro',
    nombre: 'General',
    colorName: 'Gris',
    badgeClases: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    avatarClases: 'bg-slate-600 text-white font-black ring-2 ring-slate-300/60 dark:ring-slate-600/40',
    dotColor: 'bg-slate-500',
    borderClases: 'border-l-slate-400 dark:border-l-slate-600',
    bannerClases: 'bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-900/60 dark:text-slate-200 dark:border-slate-800',
  },
};

/**
 * Determina la configuración de color de la rama para un miembro
 */
export function obtenerConfigRama(m: any, unidades: any[] = []): RamaColorConfig {
  const asig = m?.asignaciones?.[0];
  const ramaObj = asig?.unidad?.rama;
  const unidadObj = unidades.find((u) => u.id === asig?.unidadId);

  const texto = `${ramaObj?.nombre || ''} ${asig?.unidad?.nombre || ''} ${unidadObj?.nombre || ''} ${unidadObj?.rama?.nombre || ''}`.toLowerCase();

  const esAdulto =
    asig?.unidad?.tipo === 'JEFATURA' ||
    asig?.unidad?.tipo === 'SIN_RAMA_APOYO' ||
    asig?.rol?.nombre?.toLowerCase().includes('educador') ||
    asig?.rol?.nombre?.toLowerCase().includes('jefe');

  // 1. Lobatos: Amarillo
  if (texto.includes('lobat')) {
    return RAMA_COLORS.lobatos;
  }

  // 2. Scout: Verde
  if (texto.includes('scout')) {
    return RAMA_COLORS.scout;
  }

  // 3. Caminantes: Celeste
  if (texto.includes('caminant')) {
    return RAMA_COLORS.caminantes;
  }

  // 4. Rover: Rojo
  if (texto.includes('rover')) {
    return RAMA_COLORS.rover;
  }

  // 5. Adultos / Jefatura
  if (esAdulto) {
    return RAMA_COLORS.adultos;
  }

  return RAMA_COLORS.otro;
}

/**
 * Determina el orden numérico de progresión de la rama de un miembro
 */
export function obtenerOrdenRama(m: any, unidades: any[] = [], ramas: any[] = []): number {
  const asig = m?.asignaciones?.[0];
  if (!asig) return 999;

  if (asig.unidad?.rama?.ordenProgresion != null) {
    return asig.unidad.rama.ordenProgresion;
  }

  const u = unidades.find((x) => x.id === asig.unidadId);
  if (u?.rama?.ordenProgresion != null) {
    return u.rama.ordenProgresion;
  }
  if (u?.ramaId && ramas.length > 0) {
    const r = ramas.find((x) => x.id === u.ramaId);
    if (r?.ordenProgresion != null) return r.ordenProgresion;
  }

  const nom = (asig.unidad?.nombre || u?.nombre || '').toLowerCase();
  if (nom.includes('lobat')) return 1;
  if (nom.includes('scout')) return 2;
  if (nom.includes('caminant')) return 3;
  if (nom.includes('rover')) return 4;
  if (asig.unidad?.tipo === 'JEFATURA' || nom.includes('jefatura')) return 90;
  if (asig.unidad?.tipo === 'SIN_RAMA_APOYO' || nom.includes('apoyo')) return 95;

  return 999;
}

