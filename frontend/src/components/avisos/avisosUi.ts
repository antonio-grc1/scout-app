import type { DestinatarioAvisoTipo, PrioridadAviso } from '../../services/avisos.service';

export const PRIORIDAD_AVISO_CONFIG: Record<
  PrioridadAviso,
  { label: string; badgeClass: string; borderClass: string }
> = {
  NORMAL: {
    label: 'Normal',
    badgeClass: 's-badge-info',
    borderClass: '',
  },
  IMPORTANTE: {
    label: 'Importante',
    badgeClass: 's-badge-warn',
    borderClass: 'border-amber-400/50 dark:border-amber-600/50',
  },
  URGENTE: {
    label: 'Urgente',
    badgeClass: 's-badge-err',
    borderClass: 'border-rose-500/60 dark:border-rose-600/60',
  },
};

export const DESTINATARIO_AVISO_LABELS: Record<DestinatarioAvisoTipo, string> = {
  TODOS: 'Todos los miembros',
  PROTAGONISTAS: 'Solo protagonistas',
  EDUCADORES: 'Solo educadores',
  USUARIOS: 'Personas puntuales',
};
