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
          className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Miembros</span>
        </Link>

        <div className="s-card rounded-2xl p-8 text-center space-y-2.5">
          <AlertCircle className="w-9 h-9 text-rose-500 mx-auto" />
          <h1 className="text-lg font-extrabold text-ink">Miembro no válido</h1>
          <p className="text-sm text-ink-muted">
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
          className="s-btn-sec s-touch px-4 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Miembros</span>
        </Link>

        <span className="text-[13px] font-bold text-ink-muted">Expediente #{usuarioId}</span>
      </div>

      <div className="s-card rounded-2xl p-5 sm:p-6">
        <ExpedienteMiembro360
          usuarioId={usuarioId}
          tabInicial={tabInicial}
          onTabChange={handleTabChange}
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
