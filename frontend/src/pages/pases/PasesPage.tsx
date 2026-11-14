import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Clock,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react';
import { api } from '../../api/client';
import { useActiveUnitStore, useCapabilities } from '../../core/capabilities';
import { useToastStore } from '../../store/toastStore';
import {
  calcularCamada,
  esErrorOffline,
  obtenerCicloAnioActual,
  traducirErrorAmigable,
} from '../../lib/formatters';
import { PanelPasesPorCamada } from '../../components/PanelPasesPorCamada';
import { Button, KpiCard } from '../../components/ui';

export const PasesPage: React.FC = () => {
  const navigate = useNavigate();
  const caps = useCapabilities();
  const activeUnitId = useActiveUnitStore((s) => s.activeUnitId);
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const cicloActual = useMemo(() => obtenerCicloAnioActual(), []);
  const fechaCorteDefault = `${cicloActual}-06-30`;

  const [fechaReferencia, setFechaReferencia] = useState<string>(fechaCorteDefault);
  const [candidatos, setCandidatos] = useState<any[]>([]);
  const [solicitudesCount, setSolicitudesCount] = useState<number>(0);
  const [unidades, setUnidades] = useState<any[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {};
      if (fechaReferencia && /^\d{4}-\d{2}-\d{2}$/.test(fechaReferencia)) {
        params.fechaReferencia = fechaReferencia;
      }
      if (activeUnitId !== 'ALL') {
        params.unidadId = activeUnitId;
      }

      const [resCandidatos, resSolicitudes, resUnidades] = await Promise.all([
        api.get('/pases/candidatos', { params }),
        api.get('/pases/solicitudes').catch(() => ({ data: [] })),
        api.get('/organizacion/unidades'),
      ]);

      setCandidatos(Array.isArray(resCandidatos.data) ? resCandidatos.data : []);
      setSolicitudesCount(Array.isArray(resSolicitudes.data) ? resSolicitudes.data.length : 0);
      setUnidades(Array.isArray(resUnidades.data) ? resUnidades.data : []);
    } catch (err) {
      const msg = traducirErrorAmigable(err, 'No se pudieron cargar los candidatos de pase.');
      if (esErrorOffline(err)) {
        setError('Sin conexión: no pudimos actualizar el padrón de pases.');
      } else {
        setError(msg);
      }
    } finally {
      setCargando(false);
    }
  }, [activeUnitId, fechaReferencia]);

  useEffect(() => {
    void cargarDatos();
  }, [cargarDatos]);

  const metricas = useMemo(() => {
    const camadasSet = new Set<string>();
    let egresos = 0;
    for (const c of candidatos) {
      const camada = c.camada ?? calcularCamada(c.usuario?.fechaNacimiento) ?? 0;
      camadasSet.add(`${c.unidadActual?.id || 0}-${camada}`);
      if (c.tipo === 'EGRESO') egresos += 1;
    }
    return {
      totalCandidatos: candidatos.length,
      totalCamadas: camadasSet.size,
      egresos,
    };
  }, [candidatos]);

  const unidadActivaNombre = useMemo(() => {
    if (activeUnitId === 'ALL') return 'Todas las secciones';
    return (
      unidades.find((u) => u.id === activeUnitId)?.nombre ||
      caps.unidadesAsignadas.find((u) => u.id === activeUnitId)?.nombre ||
      `Unidad #${activeUnitId}`
    );
  }, [activeUnitId, unidades, caps.unidadesAsignadas]);

  return (
    <div className="space-y-4 sm:space-y-5 s-anim-fade-up">
      {/* Cabecera de módulo + selector de fecha de corte 30/06 */}
      <section className="s-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-extrabold text-ink tracking-tight">
                Pases de Rama y Progresión
              </h1>
              <span className="s-badge-brand px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                {unidadActivaNombre}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-ink-muted">
              Cálculo reglamentario por camada al 30/06. Ajustá la fecha de corte, revisá destinos individuales o ejecutá pases en lote.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-paper-2 border border-rule text-xs font-semibold text-ink-2">
              <Calendar className="w-3.5 h-3.5 text-brand shrink-0" />
              <span className="whitespace-nowrap">Corte:</span>
              <input
                type="date"
                aria-label="Fecha de corte para cálculo de camada"
                value={fechaReferencia}
                onChange={(e) => setFechaReferencia(e.target.value || fechaCorteDefault)}
                className="bg-transparent text-ink font-bold text-xs outline-none cursor-pointer"
              />
            </label>

            {fechaReferencia !== fechaCorteDefault && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setFechaReferencia(fechaCorteDefault)}
                title={`Restablecer al 30/06/${cicloActual}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>30/06/{cicloActual}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={cargando}
              onClick={() => void cargarDatos()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </Button>
          </div>
        </div>
      </section>

      {/* KPIs de Pases */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Candidatos al corte"
          value={cargando ? '—' : metricas.totalCandidatos}
          hint={`Al ${fechaReferencia.split('-').reverse().join('/')}`}
          icon={<Users className="w-4 h-4" />}
          tone="brand"
        />
        <KpiCard
          label="Camadas activas"
          value={cargando ? '—' : metricas.totalCamadas}
          hint="Grupos por sección y año"
          icon={<Sparkles className="w-4 h-4" />}
          tone="info"
        />
        <KpiCard
          label="Solicitudes pendientes"
          value={cargando ? '—' : solicitudesCount}
          hint="Confirmación entre secciones"
          icon={<Clock className="w-4 h-4" />}
          tone={solicitudesCount > 0 ? 'warn' : 'ok'}
        />
        <KpiCard
          label="Egresos a Educador"
          value={cargando ? '—' : metricas.egresos}
          hint={caps.esGlobal ? 'Habilitado (Global)' : 'Requiere Jefatura (Global)'}
          icon={<ArrowRightLeft className="w-4 h-4" />}
          tone={metricas.egresos > 0 ? 'warn' : 'neutral'}
        />
      </section>

      {error && (
        <div className="s-badge-warn rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void cargarDatos()}>
            Reintentar
          </Button>
        </div>
      )}

      {cargando && candidatos.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="s-card rounded-2xl p-5 space-y-3 animate-pulse">
              <div className="h-5 w-52 bg-paper-3 rounded" />
              <div className="h-3.5 w-80 bg-paper-2 rounded" />
              <div className="h-24 w-full bg-paper-2 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <PanelPasesPorCamada
          candidatos={candidatos}
          unidades={unidades}
          onRecargar={cargarDatos}
          onToast={mostrarToast}
          onAbrirMiembro={(id) => navigate(`/miembros/${id}?tab=pase`)}
        />
      )}
    </div>
  );
};
