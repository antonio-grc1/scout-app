import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { formatearFechaHora } from '../../lib/formatters';
import { obtenerLecturasAviso } from '../../services/avisos.service';
import { Drawer } from '../../components/ui/Drawer';

interface DrawerLecturasAvisoProps {
  avisoId: number | null;
  onCerrar: () => void;
}

type FiltroLectura = 'TODOS' | 'PENDIENTES' | 'LEIDOS';

export const DrawerLecturasAviso: React.FC<DrawerLecturasAvisoProps> = ({ avisoId, onCerrar }) => {
  const [filtro, setFiltro] = useState<FiltroLectura>('TODOS');

  const query = useQuery({
    queryKey: ['avisos-lecturas', avisoId],
    enabled: avisoId !== null,
    staleTime: 10_000,
    queryFn: () => obtenerLecturasAviso(avisoId!),
  });

  const destinatariosFiltrados = useMemo(() => {
    const lista = query.data?.destinatarios ?? [];
    if (filtro === 'PENDIENTES') return lista.filter((d) => !d.leido);
    if (filtro === 'LEIDOS') return lista.filter((d) => d.leido);
    return lista;
  }, [query.data?.destinatarios, filtro]);

  const resumen = query.data?.resumen;
  const porcentaje =
    resumen && resumen.total > 0 ? Math.round((resumen.leidos / resumen.total) * 100) : 0;

  return (
    <Drawer
      abierto={avisoId !== null}
      onCerrar={onCerrar}
      titulo={query.data?.aviso.titulo ?? 'Detalle de lecturas'}
      subtitulo={
        resumen
          ? `${resumen.leidos} de ${resumen.total} leyeron (${porcentaje}%)`
          : 'Consultando confirmaciones de lectura…'
      }
      mode="drawer"
      maxWidthClass="sm:max-w-lg"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      }
    >
      {query.isLoading ? (
        <div className="py-12 text-center text-sm text-ink-muted flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-brand" />
          <span>Cargando lecturas…</span>
        </div>
      ) : query.isError ? (
        <div className="s-badge-warn rounded-2xl p-4 text-sm font-semibold text-center space-y-2">
          <p>No se pudieron consultar las lecturas de este aviso.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="s-btn-sec px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {resumen && (
            <div className="s-panel rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-ink-muted">
                <span>Progreso de lectura</span>
                <span className="s-tabular text-ink">
                  {resumen.leidos} / {resumen.total}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-paper-3 overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{ width: `${porcentaje}%` }}
                />
              </div>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {(
                  [
                    { id: 'TODOS', label: `Todos (${resumen.total})` },
                    { id: 'PENDIENTES', label: `Pendientes (${resumen.pendientes})` },
                    { id: 'LEIDOS', label: `Leídos (${resumen.leidos})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltro(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                      filtro === f.id
                        ? 'bg-brand text-brand-contrast border-brand'
                        : 'bg-surface text-ink-2 border-rule hover:bg-paper-2'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {destinatariosFiltrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              No hay destinatarios para el filtro seleccionado.
            </p>
          ) : (
            <div className="space-y-2">
              {destinatariosFiltrados.map((d) => (
                <div
                  key={d.usuarioId}
                  className="s-panel rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink truncate">
                      {d.apellido}, {d.nombre}
                    </div>
                    <div className="text-xs text-ink-muted s-tabular">DNI {d.dni}</div>
                  </div>
                  {d.leido ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold s-badge-ok shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{d.leidoAt ? formatearFechaHora(d.leidoAt) : 'Leído'}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold s-badge-warn shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Pendiente</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};
