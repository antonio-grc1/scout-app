import React from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Users,
  FileText,
  Repeat,
  Ticket,
  Wallet,
  Shield,
  ArrowRight,
  Compass,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCapabilities, useActiveUnitStore } from '../../core/capabilities';
import { obtenerCicloAnioActual } from '../../lib/formatters';

export const InicioPage: React.FC = () => {
  const usuario = useAuthStore((s) => s.usuario);
  const caps = useCapabilities();
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const ciclo = obtenerCicloAnioActual();

  const activeUnitLabel =
    activeUnitId === 'ALL'
      ? caps.esGlobal
        ? 'Todo el grupo'
        : 'Todas tus unidades asignadas'
      : caps.unidadesAsignadas.find((u) => u.id === activeUnitId)?.nombre || `Unidad #${activeUnitId}`;

  const accesos = [
    {
      to: '/mi-espacio',
      title: 'Mi Espacio Personal',
      desc: 'Mi legajo, cuotas y recibos, vales de eventos y perfil.',
      icon: <User className="w-5 h-5 text-brand" />,
      show: true,
    },
    {
      to: '/miembros',
      title: 'Padrón de Miembros',
      desc: 'Listado en tu alcance, filtros por sección, ficha 360° y altas.',
      icon: <Users className="w-5 h-5 text-brand" />,
      show: caps.canViewMiembros,
    },
    {
      to: '/legajos',
      title: 'Legajos y Plantillas',
      desc: 'Cumplimiento anual, colaboradores adultos y plantillas PDF.',
      icon: <FileText className="w-5 h-5 text-brand" />,
      show: caps.canViewLegajosModule,
    },
    {
      to: '/pases',
      title: 'Progresiones y Pases',
      desc: 'Cálculo por camadas al 30/06 y bandeja de solicitudes.',
      icon: <Repeat className="w-5 h-5 text-brand" />,
      show: caps.canViewPases,
    },
    {
      to: '/eventos',
      title: 'Eventos y Vales QR',
      desc: 'Eventos del grupo, punto de venta rápido y control en puerta.',
      icon: <Ticket className="w-5 h-5 text-brand" />,
      show: caps.canViewEventos,
    },
    {
      to: '/tesoreria',
      title: 'Tesorería y Cobranzas',
      desc: 'Cobros familiares, planes, cuotas, caja y cuadro de resultados.',
      icon: <Wallet className="w-5 h-5 text-brand" />,
      show: caps.canSeeTesoreriaGestion,
    },
    {
      to: '/organizacion',
      title: 'Organización y RBAC',
      desc: 'Ramas, unidades organizativas, roles y correo institucional.',
      icon: <Shield className="w-5 h-5 text-brand" />,
      show: caps.canViewOrganizacion,
    },
  ].filter((a) => a.show);

  return (
    <div className="space-y-5">
      <div className="s-card rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand">
            <Compass className="w-3.5 h-3.5" />
            <span>Ciclo Operativo {ciclo}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight truncate">
            Hola, {usuario?.nombre} {usuario?.apellido}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted">
            {caps.rolPrincipalLabel}
            {!caps.esPropio ? ` · Foco activo: ${activeUnitLabel}` : ''}
          </p>
        </div>

        <Link
          to="/mi-espacio"
          className="s-btn-brand s-touch px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-2 shrink-0"
        >
          <span>Ir a Mi Espacio</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted px-0.5">
          Módulos Habilitados en tu Perfil
        </h2>

        <div className="s-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accesos.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="s-card s-card-hover rounded-2xl p-4 flex items-start gap-3.5 min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-ink truncate">{item.title}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                </div>
                <p className="text-xs text-ink-muted leading-snug">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
