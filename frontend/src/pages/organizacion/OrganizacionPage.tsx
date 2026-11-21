import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  GitBranch,
  Layers,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../api/client';
import { useCapabilities } from '../../core/capabilities';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { esErrorOffline, traducirErrorAmigable } from '../../lib/formatters';
import { PanelAdminRamas } from '../../components/PanelAdminRamas';
import { PanelGestorRoles } from '../../components/PanelGestorRoles';
import { PanelConfiguracionCorreo } from '../../components/PanelConfiguracionCorreo';
import {
  Button,
  KpiCard,
  SegmentedTabs,
  type SegmentedTabItem,
} from '../../components/ui';

type TabOrganizacion = 'ramas' | 'roles' | 'correo';

export const OrganizacionPage: React.FC = () => {
  const caps = useCapabilities();
  const refrescarSesionDesdeServidor = useAuthStore((s) => s.refrescarSesionDesdeServidor);
  const mostrarToast = useToastStore((s) => s.mostrarToast);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabsDisponibles = useMemo<SegmentedTabItem<TabOrganizacion>[]>(() => {
    const items: SegmentedTabItem<TabOrganizacion>[] = [];
    if (caps.canViewOrganizacion) {
      items.push({
        id: 'ramas',
        label: 'Ramas y Unidades',
        icon: <Layers className="w-3.5 h-3.5" />,
      });
    }
    if (caps.canViewRoles) {
      items.push({
        id: 'roles',
        label: 'Roles y Permisos',
        icon: <ShieldCheck className="w-3.5 h-3.5" />,
      });
    }
    if (caps.canEditCorreo) {
      items.push({
        id: 'correo',
        label: 'Correo Institucional',
        icon: <Mail className="w-3.5 h-3.5" />,
      });
    }
    return items;
  }, [caps.canViewOrganizacion, caps.canViewRoles, caps.canEditCorreo]);

  const resolverTabUrl = useCallback(
    (rawTab: string | null): TabOrganizacion => {
      const normalizada: string | null =
        rawTab === 'organizacion' ? 'ramas' : rawTab;
      const valida = tabsDisponibles.find((t) => t.id === normalizada);
      return valida ? valida.id : (tabsDisponibles[0]?.id ?? 'ramas');
    },
    [tabsDisponibles],
  );

  const [tab, setTab] = useState<TabOrganizacion>(() =>
    resolverTabUrl(searchParams.get('tab')),
  );

  useEffect(() => {
    const target = resolverTabUrl(searchParams.get('tab'));
    if (target !== tab) {
      setTab(target);
    }
  }, [searchParams, resolverTabUrl, tab]);

  const cambiarTab = (nueva: TabOrganizacion) => {
    setTab(nueva);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nueva);
      return next;
    });
  };

  const [ramas, setRamas] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [mostrarInactivas, setMostrarInactivas] = useState(false);
  const [mostrarRolesInactivos, setMostrarRolesInactivos] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [permisosCatalogo, setPermisosCatalogo] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    if (tabsDisponibles.length === 0) {
      setCargando(false);
      return;
    }

    setCargando(true);
    setError(null);
    try {
      const qInactivas = mostrarInactivas && caps.esGlobal ? '?incluirInactivas=true' : '';
      const qRolesInactivos = mostrarRolesInactivos && caps.esGlobal ? '?incluirInactivos=true' : '';
      const [resRamas, resUnidades, resRoles, resPermisos] = await Promise.all([
        caps.canViewOrganizacion
          ? api.get(`/organizacion/ramas${qInactivas}`)
          : Promise.resolve({ data: [] }),
        caps.canViewOrganizacion
          ? api.get(`/organizacion/unidades${qInactivas}`)
          : Promise.resolve({ data: [] }),
        caps.canViewRoles
          ? api.get(`/organizacion/roles${qRolesInactivos}`).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        caps.canViewRoles
          ? api.get('/organizacion/permisos').catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ]);

      setRamas(Array.isArray(resRamas.data) ? resRamas.data : []);
      setUnidades(Array.isArray(resUnidades.data) ? resUnidades.data : []);
      setRoles(Array.isArray(resRoles.data) ? resRoles.data : []);
      setPermisosCatalogo(Array.isArray(resPermisos.data) ? resPermisos.data : []);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudieron cargar los datos de organización.');
      if (esErrorOffline(err)) {
        setError('Sin conexión: mostrando datos almacenados si están disponibles.');
      } else {
        setError(msg);
      }
    } finally {
      setCargando(false);
    }
  }, [
    caps.canViewOrganizacion,
    caps.canViewRoles,
    caps.esGlobal,
    mostrarInactivas,
    mostrarRolesInactivos,
    tabsDisponibles.length,
  ]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const metricas = useMemo(() => {
    const ramasActivas = ramas.filter((r) => r.activa !== false).length;
    const unidadesActivas = unidades.filter((u) => u.activa !== false).length;
    return {
      ramasActivas,
      unidadesActivas,
      totalRoles: roles.length,
    };
  }, [ramas, unidades, roles]);

  if (tabsDisponibles.length === 0) {
    return (
      <div className="s-card rounded-2xl p-8 text-center text-base text-ink-muted">
        No tenés permisos habilitados para operar el módulo de Organización.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 s-anim-fade-up">
      {/* Cabecera + Sub-tabs */}
      <section className="s-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="space-y-1.5 min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
              Organización y Gobierno
            </h1>
            <p className="text-sm text-ink-muted">
              Administrá ramas pedagógicas, secciones e historial, roles y correo institucional.
            </p>
          </div>

          {tab !== 'correo' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={cargando}
              onClick={() => void cargarDatos()}
              className="self-start sm:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </Button>
          )}
        </div>

        <SegmentedTabs
          items={tabsDisponibles}
          activeId={tab}
          onChange={cambiarTab}
          ariaLabel="Subsecciones de organización"
        />
      </section>

      {/* KPIs compactos */}
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {caps.canViewOrganizacion && (
        <KpiCard
          label="Ramas activas"
          value={cargando && ramas.length === 0 ? '—' : metricas.ramasActivas}
          hint="Progresión por edades"
          icon={<Layers className="w-4 h-4" />}
          tone="brand"
        />
        )}
        {caps.canViewOrganizacion && (
        <KpiCard
          label="Secciones activas"
          value={cargando && unidades.length === 0 ? '—' : metricas.unidadesActivas}
          hint="Unidades del grupo"
          icon={<GitBranch className="w-4 h-4" />}
          tone="info"
        />
        )}
        {/* Cada KPI solo con su permiso: sin él mostraba "0" porque esos datos no se cargan */}
        {caps.canViewRoles && (
        <KpiCard
          label="Roles configurados"
          value={cargando && roles.length === 0 ? '—' : metricas.totalRoles}
          hint={caps.canEditCorreo ? 'Roles y correo institucional' : 'Permisos por rol'}
          icon={<ShieldCheck className="w-4 h-4" />}
          tone="ok"
          className="col-span-2 lg:col-span-1"
        />
        )}
      </section>

      {error && (
        <div className="s-badge-warn rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void cargarDatos()}>
            Reintentar
          </Button>
        </div>
      )}

      <div key={tab} className="s-anim-tab">
        {tab === 'ramas' && caps.canViewOrganizacion && (
          <PanelAdminRamas
            ramas={ramas}
            unidades={unidades}
            mostrarInactivas={mostrarInactivas}
            onToggleMostrarInactivas={setMostrarInactivas}
            onRecargar={cargarDatos}
            onToast={mostrarToast}
          />
        )}

        {tab === 'roles' && caps.canViewRoles && (
          <PanelGestorRoles
            roles={roles}
            permisosCatalogo={permisosCatalogo}
            mostrarInactivos={mostrarRolesInactivos}
            onToggleMostrarInactivos={setMostrarRolesInactivos}
            onRecargar={async () => {
              await cargarDatos();
              await refrescarSesionDesdeServidor();
            }}
            onToast={mostrarToast}
          />
        )}

        {tab === 'correo' && caps.canEditCorreo && (
          <PanelConfiguracionCorreo onToast={mostrarToast} />
        )}
      </div>
    </div>
  );
};
