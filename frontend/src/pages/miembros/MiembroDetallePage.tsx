import React, { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useToastStore } from '../../store/toastStore';
import { ExpedienteMiembro360, type TabExpediente360 } from './ExpedienteMiembro360';

const TABS_VALIDAS: readonly TabExpediente360[] = [
  'datos',
  'cuotas',
  'ficha',
  'pase',
  'seguridad',
];

export const MiembroDetallePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const mostrarToast = useToastStore((s) => s.mostrarToast);

  const usuarioId = useMemo(() => {
    const parsed = Number(id);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [id]);

  const tabInicial = useMemo<TabExpediente360>(() => {
    const t = searchParams.get('tab') as TabExpediente360 | null;
    return t && TABS_VALIDAS.includes(t) ? t : 'datos';
  }, [searchParams]);

  const handleTabChange = (nuevoTab: TabExpediente360) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', nuevoTab);
      return next;
    });
  };

  if (usuarioId === null) {
    return (
      <div className="s-anim-view max-w-4xl mx-auto space-y-4">
        <Link
          to="/miembros"
          className="s-btn-sec s-touch px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Miembros</span>
        </Link>

        <div className="s-card rounded-2xl p-8 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
          <h1 className="text-base font-extrabold text-ink">Miembro no válido</h1>
          <p className="text-xs text-ink-muted">
            El identificador del expediente no es válido o fue eliminado.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="s-anim-view max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/miembros"
          className="s-btn-sec s-touch px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Miembros</span>
        </Link>

        <span className="text-xs font-bold text-ink-muted">Expediente 360° #{usuarioId}</span>
      </div>

      <div className="s-card rounded-2xl p-4 sm:p-5">
        <ExpedienteMiembro360
          usuarioId={usuarioId}
          tabInicial={tabInicial}
          onTabChange={handleTabChange}
          onActualizado={() => mostrarToast('Expediente actualizado.', 'exito')}
          onEliminado={(msg) => {
            mostrarToast(msg, 'exito');
            navigate('/miembros', { replace: true });
          }}
          onClaveReseteada={(msg) => mostrarToast(msg, 'exito')}
        />
      </div>
    </div>
  );
};
